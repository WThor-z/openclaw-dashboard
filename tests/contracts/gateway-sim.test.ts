import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

type SimulatorMode = "valid-auth" | "bad-auth" | "gap" | "flaky-network";

const modeOverride = process.env.SIM_MODE as SimulatorMode | undefined;

function shouldRunMode(mode: SimulatorMode): boolean {
  return modeOverride === undefined || modeOverride === mode;
}

function modeIt(mode: SimulatorMode) {
  return shouldRunMode(mode) ? it : it.skip;
}

type GatewayFrame = {
  type: string;
  event?: string;
  id?: string;
  ok?: boolean;
  seq?: number;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
};

interface RunningSimulator {
  child: ChildProcess;
  port: number;
}

const children = new Set<ChildProcess>();

afterEach(async () => {
  await Promise.all([...children].map((child) => stopSimulator(child)));
});

async function startSimulator(mode: SimulatorMode): Promise<RunningSimulator> {
  const child = spawn(
    "node",
    ["--experimental-strip-types", "tests/simulator/gateway-sim.ts"],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        SIM_MODE: mode,
        SIM_PORT: "0"
      }
    }
  );
  children.add(child);

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`simulator did not publish listening port for mode ${mode}. stderr: ${stderr}`));
    }, 4000);

    child.once("error", (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      const match = /SIM_LISTENING:(\d+)/.exec(line);
      if (!match) {
        return;
      }

      clearTimeout(timeout);
      resolve(Number(match[1]));
    });

    child.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timeout);
      reject(new Error(`simulator exited before startup code=${code} signal=${signal} stderr=${stderr}`));
    });
  });

  return { child, port };
}

async function stopSimulator(child: ChildProcess): Promise<void> {
  if (!children.has(child)) {
    return;
  }

  if (child.killed || child.exitCode !== null) {
    children.delete(child);
    return;
  }

  child.kill("SIGTERM");
  await once(child, "exit");
  children.delete(child);
}

function createFrameReader(ws: WebSocket) {
  const queue: GatewayFrame[] = [];
  const waiters: Array<(frame: GatewayFrame) => void> = [];

  ws.on("message", (data: Buffer) => {
    const frame = JSON.parse(data.toString()) as GatewayFrame;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(frame);
      return;
    }
    queue.push(frame);
  });

  return (timeoutMs = 3000): Promise<GatewayFrame> => {
    if (queue.length > 0) {
      const frame = queue.shift();
      if (!frame) {
        throw new Error("frame queue unexpectedly empty");
      }
      return Promise.resolve(frame);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("timed out waiting for websocket frame"));
      }, timeoutMs);

      waiters.push((frame) => {
        clearTimeout(timeout);
        resolve(frame);
      });

      ws.once("error", () => {
        clearTimeout(timeout);
        reject(new Error("websocket error while reading frame"));
      });
    });
  };
}

function sendConnect(ws: WebSocket, token: string): string {
  const id = randomUUID();
  void ws.send(
    JSON.stringify({
      type: "req",
      id,
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        auth: { token }
      }
    })
  );
  return id;
}

describe("gateway simulator websocket contract", () => {
  modeIt("valid-auth")("performs challenge -> connect -> hello-ok flow in valid-auth mode", async () => {
    const simulator = await startSimulator("valid-auth");
    const ws = new WebSocket(`ws://127.0.0.1:${simulator.port}`);
    const readJson = createFrameReader(ws);
    await once(ws, "open");

    const challenge = await readJson();
    const reqId = sendConnect(ws, "token-123");
    const response = await readJson();
    const event1 = await readJson();
    const event2 = await readJson();
    const event3 = await readJson();

    expect(challenge).toMatchObject({ type: "event", event: "connect.challenge" });
    expect(response).toMatchObject({
      type: "res",
      id: reqId,
      ok: true,
      payload: { type: "hello-ok", protocol: 3, policy: { tickIntervalMs: 15000 } }
    });
    expect([event1.seq, event2.seq, event3.seq]).toEqual([1, 2, 3]);

    ws.close();
    await stopSimulator(simulator.child);
  });

  modeIt("bad-auth")("rejects connect in bad-auth mode", async () => {
    const simulator = await startSimulator("bad-auth");
    const ws = new WebSocket(`ws://127.0.0.1:${simulator.port}`);
    const readJson = createFrameReader(ws);
    await once(ws, "open");

    await readJson();
    const reqId = sendConnect(ws, "token-123");
    const response = await readJson();

    expect(response).toMatchObject({
      type: "res",
      id: reqId,
      ok: false,
      error: { code: "AUTH_INVALID" }
    });

    ws.close();
    await stopSimulator(simulator.child);
  });

  modeIt("gap")("shows deterministic sequence gap in gap mode", async () => {
    const simulator = await startSimulator("gap");
    const ws = new WebSocket(`ws://127.0.0.1:${simulator.port}`);
    const readJson = createFrameReader(ws);
    await once(ws, "open");

    await readJson();
    sendConnect(ws, "token-123");
    await readJson();
    const event1 = await readJson();
    const event2 = await readJson();
    const event3 = await readJson();

    expect([event1.seq, event2.seq, event3.seq]).toEqual([1, 3, 4]);

    ws.close();
    await stopSimulator(simulator.child);
  });

  modeIt("flaky-network")("deterministically drops connection in flaky-network mode", async () => {
    const simulator = await startSimulator("flaky-network");
    const ws = new WebSocket(`ws://127.0.0.1:${simulator.port}`);
    const readJson = createFrameReader(ws);
    await once(ws, "open");

    await readJson();
    sendConnect(ws, "token-123");
    await readJson();
    const event1 = await readJson();
    const event2 = await readJson();

    expect(event1).toMatchObject({ event: "channels.delta", seq: 1 });
    expect(event2).toMatchObject({ event: "transport.drop" });
    await once(ws, "close");

    await stopSimulator(simulator.child);
  });
});
