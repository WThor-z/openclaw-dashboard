import { afterEach, describe, expect, it } from "vitest";

import { createDaemonServer } from "../../../src/server/http-server.js";

const activeServers = [];

afterEach(async () => {
  while (activeServers.length > 0) {
    const entry = activeServers.pop();
    await entry.stop();
  }
});

function endpointFrom(address) {
  return `http://${address.address}:${address.port}`;
}

async function startServer(options = {}) {
  const server = createDaemonServer({
    host: "127.0.0.1",
    port: 0,
    adminToken: options.adminToken,
    logger: options.logger ?? { info() {}, error() {} }
  });
  await server.start();
  activeServers.push(server);
  return server;
}

describe("control arming", () => {
  it("rejects control writes when not armed", async () => {
    const server = await startServer({ adminToken: "dev-token" });
    const baseUrl = endpointFrom(server.address());

    const response = await fetch(`${baseUrl}/api/control/ping`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token"
      }
    });
    const body = await response.json();

    expect([403, 423]).toContain(response.status);
    expect(body.code).toBe("WRITE_NOT_ARMED");
  });
});
