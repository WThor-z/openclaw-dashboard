import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGatewayClient,
  createGatewayDedupeKey
} from "../../src/platform/gateway/client.js";

class MockSocket {
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockSocket.OPEN;
    this.handlers = new Map();
    this.sent = [];
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  send(payload) {
    this.sent.push(payload);
  }

  close(code = 1000, reason = "") {
    this.readyState = MockSocket.CLOSED;
    this.emit("close", code, reason);
  }

  emit(event, ...args) {
    const handler = this.handlers.get(event);
    if (handler) {
      handler(...args);
    }
  }
}

class MockEventTargetSocket {
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockEventTargetSocket.OPEN;
    this.listeners = new Map();
    this.sent = [];
  }

  addEventListener(event, handler) {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = MockEventTargetSocket.CLOSED;
    this.emit("close", { code: 1000, reason: "closed" });
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(payload);
    }
  }
}

function lastSentFrame(socket) {
  const payload = socket.sent.at(-1);
  return payload ? JSON.parse(payload) : null;
}

describe("gateway protocol client", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for connect.challenge before sending connect request", async () => {
    const sockets = [];
    const statuses = [];

    const client = createGatewayClient({
      url: "ws://127.0.0.1:18789",
      token: "token-123",
      client: { id: "daemon", version: "0.1.0", platform: "node", mode: "operator" },
      socketFactory(url) {
        const socket = new MockSocket(url);
        sockets.push(socket);
        return socket;
      },
      onStatus(status) {
        statuses.push(status);
      }
    });

    client.start();
    const socket = sockets[0];

    expect(socket.sent).toEqual([]);

    socket.emit(
      "message",
      JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "nonce-1" }
      })
    );

    const connectFrame = lastSentFrame(socket);
    expect(connectFrame).toMatchObject({
      type: "req",
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        role: "operator",
        scopes: ["operator.read"],
        auth: { token: "token-123" },
        device: { nonce: "nonce-1" }
      }
    });
    expect(statuses).toContain("connecting");
  });

  it("supports EventTarget style websocket messages with MessageEvent.data", () => {
    const sockets = [];

    const client = createGatewayClient({
      url: "ws://127.0.0.1:18789",
      token: "token-123",
      client: { id: "daemon", version: "0.1.0", platform: "node", mode: "operator" },
      buildDeviceIdentity({ nonce }) {
        return { id: "device-for-nonce", binding: `bind:${nonce}` };
      },
      socketFactory(url) {
        const socket = new MockEventTargetSocket(url);
        sockets.push(socket);
        return socket;
      }
    });

    client.start();
    const socket = sockets[0];

    socket.emit("message", {
      data: JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "nonce-evt-target" }
      })
    });

    const connectFrame = lastSentFrame(socket);
    expect(connectFrame).toMatchObject({
      type: "req",
      method: "connect",
      params: {
        auth: { token: "token-123" },
        device: {
          nonce: "nonce-evt-target",
          id: "device-for-nonce",
          binding: "bind:nonce-evt-target"
        }
      }
    });
  });

  it("emits connected on successful connect response and reports auth failures", async () => {
    const sockets = [];
    const statuses = [];
    const events = [];

    const client = createGatewayClient({
      url: "ws://127.0.0.1:18789",
      token: "token-123",
      socketFactory(url) {
        const socket = new MockSocket(url);
        sockets.push(socket);
        return socket;
      },
      onStatus(status) {
        statuses.push(status);
      },
      onEvent(frame) {
        events.push(frame);
      }
    });

    client.start();
    const socket = sockets[0];

    socket.emit(
      "message",
      JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "nonce-1" }
      })
    );

    const connectRequest = lastSentFrame(socket);
    socket.emit(
      "message",
      JSON.stringify({ type: "res", id: connectRequest.id, ok: true, payload: { protocol: 3 } })
    );

    socket.emit(
      "message",
      JSON.stringify({ type: "event", event: "channels.delta", seq: 1, payload: { id: "main" } })
    );

    expect(statuses).toContain("connected");
    expect(events).toHaveLength(1);

    socket.emit("close", 1008, "auth failed");
    expect(statuses).toContain("degraded");
  });

  it("uses exponential backoff with jitter for reconnect attempts", async () => {
    vi.useFakeTimers();

    const sockets = [];
    const backoffCalls = [];

    const client = createGatewayClient({
      url: "ws://127.0.0.1:18789",
      token: "token-123",
      socketFactory(url) {
        const socket = new MockSocket(url);
        sockets.push(socket);
        return socket;
      },
      backoff: {
        minDelayMs: 100,
        maxDelayMs: 1000,
        factor: 2,
        jitterRatio: 0.1
      },
      random() {
        backoffCalls.push(true);
        return 1;
      }
    });

    client.start();
    expect(sockets).toHaveLength(1);

    sockets[0].emit("close", 1006, "network drop");

    vi.advanceTimersByTime(109);
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    expect(backoffCalls.length).toBeGreaterThan(0);

    sockets[1].emit("close", 1006, "network drop");
    vi.advanceTimersByTime(220);
    expect(sockets).toHaveLength(3);
  });

  it("tracks gap detection and exposes last cursor", () => {
    const sockets = [];
    const gaps = [];

    const client = createGatewayClient({
      url: "ws://127.0.0.1:18789",
      token: "token-123",
      socketFactory(url) {
        const socket = new MockSocket(url);
        sockets.push(socket);
        return socket;
      },
      onGap(gap) {
        gaps.push(gap);
      }
    });

    client.start();
    const socket = sockets[0];

    socket.emit(
      "message",
      JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce: "nonce-1" } })
    );
    const connectRequest = lastSentFrame(socket);
    socket.emit("message", JSON.stringify({ type: "res", id: connectRequest.id, ok: true }));

    socket.emit("message", JSON.stringify({ type: "event", event: "channels.delta", seq: 1, payload: {} }));
    socket.emit("message", JSON.stringify({ type: "event", event: "channels.delta", seq: 3, payload: {} }));

    expect(gaps).toEqual([{ expected: 2, received: 3 }]);
    expect(client.getLastCursor()).toBe(3);
  });
});

describe("gateway dedupe key", () => {
  it("is deterministic for same source event payload", () => {
    const keyA = createGatewayDedupeKey({
      source: "gateway",
      event: "channels.delta",
      seq: 12,
      payload: { b: 2, a: 1 }
    });

    const keyB = createGatewayDedupeKey({
      source: "gateway",
      event: "channels.delta",
      seq: 12,
      payload: { a: 1, b: 2 }
    });

    expect(keyA).toBe(keyB);
  });
});
