import { afterEach, describe, expect, it } from "vitest";

import {
  createDaemonServer,
  resolveBindConfig
} from "../src/server/http-server.js";

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
  const logger = options.logger ?? {
    info() {},
    error() {}
  };

  const server = createDaemonServer({
    host: "127.0.0.1",
    port: 0,
    adminToken: options.adminToken,
    logger
  });
  await server.start();
  activeServers.push(server);
  return server;
}

describe("daemon bind config", () => {
  it("uses loopback defaults", () => {
    const config = resolveBindConfig({});

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4060);
  });
});

describe("daemon routes", () => {
  it("serves health without auth", async () => {
    const server = await startServer();
    const baseUrl = endpointFrom(server.address());

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
  });

  it("blocks unauthenticated control writes", async () => {
    const server = await startServer({ adminToken: "dev-token" });
    const baseUrl = endpointFrom(server.address());

    const response = await fetch(`${baseUrl}/api/control/ping`, {
      method: "POST"
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(typeof body.requestId).toBe("string");
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("allows control writes with matching bearer token", async () => {
    const server = await startServer({ adminToken: "dev-token" });
    const baseUrl = endpointFrom(server.address());

    const armResponse = await fetch(`${baseUrl}/api/control/arm`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token"
      }
    });
    expect(armResponse.status).toBe(200);

    const response = await fetch(`${baseUrl}/api/control/ping`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "idempotency-key": "server-test-ping"
      }
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, armed: true });
  });

  it("logs request id for handled requests", async () => {
    const infoCalls = [];
    const server = await startServer({
      logger: {
        info(message) {
          infoCalls.push(message);
        },
        error() {}
      }
    });
    const baseUrl = endpointFrom(server.address());

    const response = await fetch(`${baseUrl}/health`);
    const requestId = response.headers.get("x-request-id");

    expect(response.status).toBe(200);
    expect(typeof requestId).toBe("string");
    expect(requestId?.length).toBeGreaterThan(0);
    expect(infoCalls.length).toBe(1);
    expect(infoCalls[0]).toContain(`[${requestId}]`);
    expect(infoCalls[0]).toContain("GET /health 200");
  });
});
