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

  it("diffs and applies config with expected snapshot, operation, and audit side effects", async () => {
    const repositories = createFixtureRepositories();
    const workspaceId = "ws-1";
    repositories.configSnapshots.insert({
      id: "snapshot-seed",
      workspaceId,
      source: "seed",
      snapshotJson: JSON.stringify({ model: "gpt-5" }),
      capturedAt: "2026-03-04T10:00:00.000Z"
    });

    const initialSnapshotCount = repositories.configSnapshots.listByWorkspace(workspaceId).length;
    const initialOperationCount = repositories.configOperations.listByWorkspace(workspaceId).length;

    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const diffResponse = await fetch(`${baseUrl}/api/control/config/diff`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        "idempotency-key": "idem-config-diff-1"
      },
      body: JSON.stringify({
        workspaceId,
        config: { model: "gpt-5.3", temperature: 0.2 }
      })
    });
    const diffBody = await diffResponse.json();

    expect(diffResponse.status).toBe(200);
    expect(diffBody.ok).toBe(true);
    expect(diffBody.baseVersion).toBe(initialSnapshotCount);

    const applyResponse = await fetch(`${baseUrl}/api/control/config/apply`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        "idempotency-key": "idem-config-apply-1"
      },
      body: JSON.stringify({
        workspaceId,
        baseVersion: diffBody.baseVersion,
        config: { model: "gpt-5.3", temperature: 0.2 }
      })
    });
    const applyBody = await applyResponse.json();

    expect(applyResponse.status).toBe(200);
    expect(applyBody).toEqual({ ok: true, workspaceId, version: initialSnapshotCount + 1 });
    expect(repositories.configSnapshots.listByWorkspace(workspaceId)).toHaveLength(initialSnapshotCount + 1);
    expect(repositories.configOperations.listByWorkspace(workspaceId)).toHaveLength(initialOperationCount + 1);
    expect(
      repositories
        .events
        .listTimelineByWorkspace(workspaceId)
        .some((event) => event.kind === "control.config.apply")
    ).toBe(true);
  });

  it("cancels an existing task", async () => {
    const repositories = createFixtureRepositories();
    repositories.tasks.insert({
      id: "task-1",
      sessionId: null,
      workspaceId: "ws-1",
      state: "queued",
      summary: "queued task",
      createdAt: "2026-03-04T10:00:00.000Z",
      updatedAt: "2026-03-04T10:00:00.000Z"
    });

    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const response = await fetch(`${baseUrl}/api/control/tasks/task-1/cancel`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        "idempotency-key": "idem-cancel-1"
      },
      body: JSON.stringify({ workspaceId: "ws-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, taskId: "task-1", state: "cancelled" });
    expect(repositories.tasks.getById("task-1")?.state).toBe("cancelled");
  });

  it("returns TASK_NOT_FOUND when canceling a missing task", async () => {
    const repositories = createFixtureRepositories();
    const initialEventCount = repositories.events.listTimelineByWorkspace("ws-1").length;

    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const response = await fetch(`${baseUrl}/api/control/tasks/task-missing/cancel`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        "idempotency-key": "idem-cancel-missing-1"
      },
      body: JSON.stringify({ workspaceId: "ws-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("TASK_NOT_FOUND");
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
