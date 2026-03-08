import { randomUUID } from "node:crypto";

const DEFAULT_PROTOCOL_VERSION = 3;
const DEFAULT_ROLE = "operator";
const DEFAULT_SCOPES = ["operator.read"];

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => {
    if (left < right) {
      return -1;
    }

    if (left > right) {
      return 1;
    }

    return 0;
  });

  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function toTextFrame(raw) {
  const payload =
    raw && typeof raw === "object" && "data" in raw && raw.data !== undefined ? raw.data : raw;

  if (typeof payload === "string") {
    return payload;
  }

  if (payload instanceof Uint8Array) {
    return Buffer.from(payload).toString("utf8");
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }

  if (Array.isArray(payload)) {
    return Buffer.concat(payload.map((part) => Buffer.from(part))).toString("utf8");
  }

  if (payload && typeof payload === "object" && "buffer" in payload && payload.buffer instanceof ArrayBuffer) {
    return Buffer.from(payload.buffer, payload.byteOffset ?? 0, payload.byteLength).toString("utf8");
  }

  if (payload instanceof Buffer) {
    return payload.toString("utf8");
  }

  return String(payload);
}

function defaultSocketFactory(url) {
  if (typeof WebSocket !== "function") {
    throw new Error("WebSocket is unavailable in this runtime");
  }

  return new WebSocket(url);
}

function resolveBackoff(config = {}) {
  return {
    minDelayMs: config.minDelayMs ?? 500,
    maxDelayMs: config.maxDelayMs ?? 30_000,
    factor: config.factor ?? 2,
    jitterRatio: config.jitterRatio ?? 0.2
  };
}

function normalizeStatus(state) {
  if (state === "connecting" || state === "connected" || state === "degraded") {
    return state;
  }

  return "disconnected";
}

export function createGatewayDedupeKey(frame) {
  const source = frame?.source ?? "gateway";
  const event = frame?.event ?? "unknown";
  const seq = Number.isInteger(frame?.seq) ? frame.seq : "na";
  const payload = stableStringify(frame?.payload ?? null);

  return `${source}:${event}:${seq}:${payload}`;
}

export function createGatewayClient(options) {
  const config = {
    minProtocol: options?.minProtocol ?? DEFAULT_PROTOCOL_VERSION,
    maxProtocol: options?.maxProtocol ?? DEFAULT_PROTOCOL_VERSION,
    role: options?.role ?? DEFAULT_ROLE,
    scopes: options?.scopes ?? DEFAULT_SCOPES,
    client: {
      id: options?.client?.id ?? "daemon",
      version: options?.client?.version ?? "0.1.0",
      platform: options?.client?.platform ?? process.platform,
      mode: options?.client?.mode ?? "operator"
    },
    token: options?.token,
    caps: options?.caps ?? [],
    commands: options?.commands ?? [],
    permissions: options?.permissions ?? {},
    socketFactory: options?.socketFactory ?? defaultSocketFactory,
    backoff: resolveBackoff(options?.backoff),
    random: options?.random ?? Math.random,
    onEvent: options?.onEvent,
    onStatus: options?.onStatus,
    onGap: options?.onGap,
    buildDeviceIdentity: options?.buildDeviceIdentity,
    url: options?.url ?? "ws://127.0.0.1:18789"
  };

  let activeSocket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let lastCursor = null;
  let status = "disconnected";
  let shouldRun = false;
  let pendingConnectRequestId = null;

  function emitStatus(next) {
    const normalized = normalizeStatus(next);

    if (status === normalized) {
      return;
    }

    status = normalized;
    config.onStatus?.(normalized);
  }

  function resolveDevice(nonce) {
    const device = config.buildDeviceIdentity?.({ nonce });

    if (device && typeof device === "object") {
      return { nonce, ...device };
    }

    return {
      id: "daemon-device",
      nonce
    };
  }

  function isSocketOpen(socket) {
    const openState = socket?.constructor?.OPEN ?? 1;
    return socket?.readyState === openState;
  }

  function sendConnect(nonce) {
    if (!activeSocket || !isSocketOpen(activeSocket)) {
      return;
    }

    const requestId = randomUUID();
    pendingConnectRequestId = requestId;

    const frame = {
      type: "req",
      id: requestId,
      method: "connect",
      params: {
        minProtocol: config.minProtocol,
        maxProtocol: config.maxProtocol,
        client: config.client,
        role: config.role,
        scopes: config.scopes,
        caps: config.caps,
        commands: config.commands,
        permissions: config.permissions,
        auth: {
          token: config.token
        },
        device: resolveDevice(nonce)
      }
    };

    activeSocket.send(JSON.stringify(frame));
  }

  function scheduleReconnect() {
    if (!shouldRun) {
      return;
    }

    const baseDelay = Math.min(
      config.backoff.maxDelayMs,
      config.backoff.minDelayMs * config.backoff.factor ** reconnectAttempt
    );
    reconnectAttempt += 1;
    const jitter = baseDelay * config.backoff.jitterRatio * config.random();
    const delayMs = Math.round(baseDelay + jitter);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  }

  function onSocketMessage(raw) {
    let frame;

    try {
      frame = JSON.parse(toTextFrame(raw));
    } catch {
      return;
    }

    if (frame?.type === "event") {
      if (frame.event === "connect.challenge") {
        const nonce = frame?.payload?.nonce;

        if (typeof nonce === "string" && nonce.length > 0) {
          sendConnect(nonce);
        }

        return;
      }

      if (typeof frame.seq === "number") {
        if (lastCursor !== null && frame.seq > lastCursor + 1) {
          config.onGap?.({ expected: lastCursor + 1, received: frame.seq });
        }

        lastCursor = frame.seq;
      }

      config.onEvent?.(frame);
      return;
    }

    if (frame?.type === "res" && frame.id === pendingConnectRequestId) {
      pendingConnectRequestId = null;

      if (frame.ok) {
        reconnectAttempt = 0;
        emitStatus("connected");
      } else {
        emitStatus("degraded");
      }
    }
  }

  function onSocketClose() {
    activeSocket = null;
    pendingConnectRequestId = null;

    if (!shouldRun) {
      emitStatus("disconnected");
      return;
    }

    emitStatus("degraded");
    scheduleReconnect();
  }

  function connect() {
    if (!shouldRun) {
      return;
    }

    emitStatus("connecting");
    const socket = config.socketFactory(config.url);
    activeSocket = socket;

    const addListener =
      typeof socket?.on === "function"
        ? (event, handler) => socket.on(event, handler)
        : typeof socket?.addEventListener === "function"
          ? (event, handler) => socket.addEventListener(event, handler)
          : null;

    if (!addListener) {
      throw new Error("WebSocket instance does not support event subscriptions");
    }

    addListener("message", onSocketMessage);
    addListener("close", onSocketClose);
    addListener("error", () => {
      emitStatus("degraded");
    });
  }

  return {
    start() {
      if (shouldRun) {
        return;
      }

      shouldRun = true;
      connect();
    },
    stop() {
      shouldRun = false;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (activeSocket) {
        activeSocket.close(1000, "client stop");
        activeSocket = null;
      }

      emitStatus("disconnected");
    },
    getLastCursor() {
      return lastCursor;
    },
    getStatus() {
      return status;
    }
  };
}
