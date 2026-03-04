import process from "node:process";
import { WebSocketServer, type WebSocket } from "ws";

export type SimulatorMode = "valid-auth" | "bad-auth" | "gap" | "flaky-network";

type GatewayFrame = GatewayEventFrame | GatewayResponseFrame;

interface GatewayEventFrame {
  type: "event";
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
}

interface GatewayResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
}

interface GatewayRequestFrame {
  type: "req";
  id: string;
  method: string;
  params?: {
    minProtocol?: number;
    maxProtocol?: number;
    auth?: { token?: string };
  };
}

type ScriptStep =
  | {
      type: "event";
      delayMs: number;
      frame: GatewayEventFrame;
    }
  | {
      type: "close";
      delayMs: number;
      code: number;
      reason: string;
    };

interface ClientState {
  connected: boolean;
  timers: Set<ReturnType<typeof setTimeout>>;
}

export interface GatewaySimulatorServiceOptions {
  mode: SimulatorMode;
  host?: string;
  port?: number;
  expectedToken?: string;
}

const MODE_NONCE: Record<SimulatorMode, string> = {
  "valid-auth": "nonce-valid-auth-001",
  "bad-auth": "nonce-bad-auth-001",
  gap: "nonce-gap-001",
  "flaky-network": "nonce-flaky-network-001"
};

const MODE_TS: Record<SimulatorMode, number> = {
  "valid-auth": 1737264000000,
  "bad-auth": 1737264000100,
  gap: 1737264000200,
  "flaky-network": 1737264000300
};

export class GatewaySimulatorService {
  private readonly mode: SimulatorMode;
  private readonly host: string;
  private readonly port: number;
  private readonly expectedToken: string;
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<WebSocket, ClientState>();

  constructor(options: GatewaySimulatorServiceOptions) {
    this.mode = options.mode;
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 0;
    this.expectedToken = options.expectedToken ?? "token-123";
    this.wss = new WebSocketServer({ host: this.host, port: this.port });
  }

  async start(): Promise<number> {
    this.wss.on("connection", (socket: WebSocket) => {
      const state: ClientState = { connected: false, timers: new Set() };
      this.clients.set(socket, state);

      this.sendFrame(socket, {
        type: "event",
        event: "connect.challenge",
        payload: {
          nonce: MODE_NONCE[this.mode],
          ts: MODE_TS[this.mode]
        }
      });

      socket.on("message", (data: Buffer) => {
        this.handleMessage(socket, data.toString());
      });

      socket.on("close", () => {
        this.clearClientState(socket);
      });
    });

    await new Promise<void>((resolve) => {
      this.wss.on("listening", () => resolve());
    });

    const address = this.wss.address();
    if (!address || typeof address === "string") {
      throw new Error("gateway simulator failed to resolve listening address");
    }

    return address.port;
  }

  async stop(): Promise<void> {
    for (const socket of this.clients.keys()) {
      this.clearClientState(socket);
      if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
        socket.terminate();
      }
    }
    this.clients.clear();

    await new Promise<void>((resolve, reject) => {
      this.wss.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private handleMessage(socket: WebSocket, raw: string): void {
    const request = this.parseRequest(raw);
    if (!request || request.type !== "req") {
      return;
    }

    if (request.method !== "connect") {
      this.sendFrame(socket, {
        type: "res",
        id: request.id,
        ok: false,
        error: {
          code: "METHOD_NOT_SUPPORTED",
          message: "only connect is supported"
        }
      });
      return;
    }

    const token = request.params?.auth?.token;
    if (this.mode === "bad-auth" || token !== this.expectedToken) {
      this.sendFrame(socket, {
        type: "res",
        id: request.id,
        ok: false,
        error: {
          code: "AUTH_INVALID",
          message: "token rejected"
        }
      });
      return;
    }

    const state = this.clients.get(socket);
    if (!state || state.connected) {
      return;
    }

    state.connected = true;
    this.sendFrame(socket, {
      type: "res",
      id: request.id,
      ok: true,
      payload: {
        type: "hello-ok",
        protocol: 3,
        policy: { tickIntervalMs: 15000 }
      }
    });

    for (const step of this.resolveScript()) {
      const timer = setTimeout(() => {
        state.timers.delete(timer);
        if (socket.readyState !== socket.OPEN) {
          return;
        }

        if (step.type === "event") {
          this.sendFrame(socket, step.frame);
          return;
        }

        socket.close(step.code, step.reason);
      }, step.delayMs);
      state.timers.add(timer);
    }
  }

  private parseRequest(raw: string): GatewayRequestFrame | null {
    try {
      return JSON.parse(raw) as GatewayRequestFrame;
    } catch {
      return null;
    }
  }

  private sendFrame(socket: WebSocket, frame: GatewayFrame): void {
    if (socket.readyState !== socket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(frame));
  }

  private clearClientState(socket: WebSocket): void {
    const state = this.clients.get(socket);
    if (!state) {
      return;
    }
    for (const timer of state.timers) {
      clearTimeout(timer);
    }
    state.timers.clear();
    this.clients.delete(socket);
  }

  private resolveScript(): ReadonlyArray<ScriptStep> {
    if (this.mode === "gap") {
      return [
        {
          type: "event",
          delayMs: 5,
          frame: { type: "event", event: "channels.delta", seq: 1, payload: { channelId: "main" } }
        },
        {
          type: "event",
          delayMs: 10,
          frame: { type: "event", event: "channels.delta", seq: 3, payload: { channelId: "main" } }
        },
        {
          type: "event",
          delayMs: 15,
          frame: { type: "event", event: "channels.delta", seq: 4, payload: { channelId: "main" } }
        }
      ];
    }

    if (this.mode === "flaky-network") {
      return [
        {
          type: "event",
          delayMs: 5,
          frame: { type: "event", event: "channels.delta", seq: 1, payload: { channelId: "main" } }
        },
        {
          type: "event",
          delayMs: 10,
          frame: {
            type: "event",
            event: "transport.drop",
            payload: { reason: "deterministic-reset" }
          }
        },
        {
          type: "close",
          delayMs: 15,
          code: 1012,
          reason: "deterministic-network-drop"
        }
      ];
    }

    return [
      {
        type: "event",
        delayMs: 5,
        frame: { type: "event", event: "channels.delta", seq: 1, payload: { channelId: "main" } }
      },
      {
        type: "event",
        delayMs: 10,
        frame: { type: "event", event: "channels.delta", seq: 2, payload: { channelId: "main" } }
      },
      {
        type: "event",
        delayMs: 15,
        frame: { type: "event", event: "channels.delta", seq: 3, payload: { channelId: "main" } }
      }
    ];
  }
}

export async function startGatewaySimulatorFromEnv(): Promise<void> {
  const mode = (process.env.SIM_MODE as SimulatorMode | undefined) ?? "valid-auth";
  const portEnv = process.env.SIM_PORT;
  const port = portEnv ? Number(portEnv) : 0;
  const token = process.env.SIM_TOKEN ?? "token-123";
  const simulator = new GatewaySimulatorService({ mode, port, expectedToken: token });
  const listeningPort = await simulator.start();
  process.stdout.write(`SIM_LISTENING:${listeningPort}\n`);

  const shutdown = async () => {
    await simulator.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

const invokedPath = process.argv[1]?.replace(/\\/g, "/");
if (invokedPath?.endsWith("/tests/simulator/gateway-sim.ts")) {
  void startGatewaySimulatorFromEnv();
}
