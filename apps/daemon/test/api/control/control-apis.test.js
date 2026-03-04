import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createDaemonServer } from "../../../src/server/http-server.js";
import { runMigrations } from "../../../src/storage/migrations.js";
import { createStorageRepositories } from "../../../src/storage/repositories.js";

const activeServers = [];
const openDatabases = [];

afterEach(async () => {
  while (activeServers.length > 0) {
    const entry = activeServers.pop();
    await entry.stop();
  }

  while (openDatabases.length > 0) {
    const db = openDatabases.pop();
    db.close();
  }
});

function endpointFrom(address) {
  return `http://${address.address}:${address.port}`;
}

function createFixtureRepositories() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  openDatabases.push(db);
  runMigrations(db, { direction: "up" });
  return createStorageRepositories(db);
}

async function startServer({ repositories, readOnlyMode = false } = {}) {
  const server = createDaemonServer({
    host: "127.0.0.1",
    port: 0,
    adminToken: "dev-token",
    logger: { info() {}, error() {} },
    repositories,
    readOnlyMode
  });
  await server.start();
  activeServers.push(server);
  return server;
}

async function armWrites(baseUrl) {
  const response = await fetch(`${baseUrl}/api/control/arm`, {
    method: "POST",
    headers: {
      authorization: "Bearer dev-token"
    }
  });

  expect(response.status).toBe(200);
}

describe("control write APIs", () => {
  it("replays duplicate idempotency key without duplicate audit event", async () => {
    const repositories = createFixtureRepositories();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const headers = {
      authorization: "Bearer dev-token",
      "idempotency-key": "idem-ping-1"
    };

    const firstResponse = await fetch(`${baseUrl}/api/control/ping`, {
      method: "POST",
      headers
    });
    const firstBody = await firstResponse.json();

    const secondResponse = await fetch(`${baseUrl}/api/control/ping`, {
      method: "POST",
      headers
    });
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondBody).toEqual(firstBody);

    const controlEvents = repositories.events
      .listTimelineByWorkspace("global")
      .filter((event) => event.kind === "control.ping");
    expect(controlEvents).toHaveLength(1);
  });

  it("returns conflict for stale config baseVersion without side effects", async () => {
    const repositories = createFixtureRepositories();
    repositories.configSnapshots.insert({
      id: "snapshot-existing",
      workspaceId: "ws-1",
      source: "seed",
      snapshotJson: JSON.stringify({ model: "gpt-5" }),
      capturedAt: "2026-03-04T10:00:00.000Z"
    });

    const initialSnapshotCount = repositories.configSnapshots.listByWorkspace("ws-1").length;
    const initialOperationCount = repositories.configOperations.listByWorkspace("ws-1").length;
    const initialEventCount = repositories.events.listTimelineByWorkspace("ws-1").length;

    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const response = await fetch(`${baseUrl}/api/control/config/apply`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        "idempotency-key": "idem-config-1"
      },
      body: JSON.stringify({
        workspaceId: "ws-1",
        baseVersion: 0,
        config: { model: "gpt-5.3" }
      })
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("CONFIG_VERSION_CONFLICT");
    expect(repositories.configSnapshots.listByWorkspace("ws-1")).toHaveLength(initialSnapshotCount);
    expect(repositories.configOperations.listByWorkspace("ws-1")).toHaveLength(initialOperationCount);
    expect(repositories.events.listTimelineByWorkspace("ws-1")).toHaveLength(initialEventCount);
  });

  it("blocks writes when daemon read-only safety mode is enabled", async () => {
    const repositories = createFixtureRepositories();
    const server = await startServer({ repositories, readOnlyMode: true });
    const baseUrl = endpointFrom(server.address());

    const response = await fetch(`${baseUrl}/api/control/arm`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token"
      }
    });
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body.code).toBe("READ_ONLY_SAFETY_MODE");
  });
});
