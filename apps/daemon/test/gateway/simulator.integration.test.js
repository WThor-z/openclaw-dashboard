import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { createGatewayClient } from "../../src/gateway/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");
const modeOverride = process.env.SIM_MODE;
const simulatorChildren = new Set();

afterEach(async () => {
  await Promise.all([...simulatorChildren].map((child) => stopSimulator(child)));
});

function modeIt(mode) {
  if (modeOverride && modeOverride !== mode) {
    return it.skip;
  }

  return it;
}

async function startSimulator(mode) {
  const child = spawn("node", ["--experimental-strip-types", "tests/simulator/gateway-sim.ts"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      SIM_MODE: mode,
      SIM_PORT: "0",
      SIM_TOKEN: "token-123"
    }
  });

  simulatorChildren.add(child);

  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const port = await new Promise((resolvePort, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => {
      reject(new Error(`simulator startup timeout mode=${mode} stderr=${stderr}`));
    }, 4000);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`simulator exited before startup code=${code} signal=${signal} stderr=${stderr}`));
    });

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = /SIM_LISTENING:(\d+)/.exec(stdout);
      if (!match) {
        return;
      }

      clearTimeout(timeout);
      resolvePort(Number(match[1]));
    });
  });

  return { child, port };
}

async function stopSimulator(child) {
  if (!simulatorChildren.has(child)) {
    return;
  }

  if (child.killed || child.exitCode !== null) {
    simulatorChildren.delete(child);
    return;
  }

  child.kill("SIGTERM");
  await once(child, "exit");
  simulatorChildren.delete(child);
}

async function waitForStatus(statuses, expected) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (statuses.includes(expected)) {
      return;
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }

  throw new Error(`timed out waiting for status ${expected}; observed=${statuses.join(",")}`);
}

describe("gateway client simulator integration", () => {
  modeIt("valid-auth")("reaches connected with Node global WebSocket in valid-auth", async () => {
    expect(typeof WebSocket).toBe("function");

    const simulator = await startSimulator("valid-auth");
    const statuses = [];
    const client = createGatewayClient({
      url: `ws://127.0.0.1:${simulator.port}`,
      token: "token-123",
      socketFactory(url) {
        return new WebSocket(url);
      },
      onStatus(status) {
        statuses.push(status);
      }
    });

    try {
      client.start();
      await waitForStatus(statuses, "connected");
      expect(statuses).toContain("connecting");
      expect(client.getStatus()).toBe("connected");
    } finally {
      client.stop();
      await stopSimulator(simulator.child);
    }
  });

  modeIt("bad-auth")("transitions to degraded with Node global WebSocket in bad-auth", async () => {
    expect(typeof WebSocket).toBe("function");

    const simulator = await startSimulator("bad-auth");
    const statuses = [];
    const client = createGatewayClient({
      url: `ws://127.0.0.1:${simulator.port}`,
      token: "token-123",
      socketFactory(url) {
        return new WebSocket(url);
      },
      onStatus(status) {
        statuses.push(status);
      }
    });

    try {
      client.start();
      await waitForStatus(statuses, "degraded");
      expect(statuses).toContain("connecting");
      expect(client.getStatus()).toBe("degraded");
    } finally {
      client.stop();
      await stopSimulator(simulator.child);
    }
  });
});
