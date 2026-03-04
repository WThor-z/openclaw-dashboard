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

async function startServer({ repositories } = {}) {
  const server = createDaemonServer({
    host: "127.0.0.1",
    port: 0,
    logger: { info() {}, error() {} },
    repositories
  });
  await server.start();
  activeServers.push(server);
  return server;
}

function seedFixtureData(repositories) {
  repositories.sessions.insert({
    id: "session-1",
    workspaceId: "ws-1",
    status: "running",
    startedAt: "2026-03-04T10:00:00.000Z",
    endedAt: null
  });
  repositories.tasks.insert({
    id: "task-1",
    sessionId: "session-1",
    workspaceId: "ws-1",
    state: "running",
    summary: "collect metrics",
    createdAt: "2026-03-04T10:00:30.000Z",
    updatedAt: "2026-03-04T10:01:30.000Z"
  });
  repositories.costEntries.insert({
    id: "cost-1",
    workspaceId: "ws-1",
    sessionId: "session-1",
    taskId: "task-1",
    amountUsd: 0.4,
    model: "gpt-5.3",
    recordedAt: "2026-03-04T10:01:00.000Z"
  });
  repositories.costEntries.insert({
    id: "cost-2",
    workspaceId: "ws-1",
    sessionId: "session-1",
    taskId: "task-1",
    amountUsd: 0.6,
    model: "gpt-5.3",
    recordedAt: "2026-03-04T12:01:00.000Z"
  });
  repositories.events.insert({
    id: "event-1",
    source: "daemon",
    sessionId: "session-1",
    taskId: "task-1",
    workspaceId: "ws-1",
    level: "info",
    kind: "task.updated",
    payloadJson: JSON.stringify({ message: "ok", accessToken: "do-not-leak" }),
    createdAt: "2026-03-04T10:02:00.000Z"
  });
}

describe("read APIs", () => {
  it("serves fixture-backed status, events, sessions, tasks, and costs payloads", async () => {
    const repositories = createFixtureRepositories();
    seedFixtureData(repositories);
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    const statusResponse = await fetch(`${baseUrl}/api/status`);
    const statusBody = await statusResponse.json();
    expect(statusResponse.status).toBe(200);
    expect(statusBody).toMatchObject({ ok: true });

    const eventsResponse = await fetch(`${baseUrl}/api/events?limit=10`);
    const eventsBody = await eventsResponse.json();
    expect(eventsResponse.status).toBe(200);
    expect(eventsBody.items).toHaveLength(1);
    expect(eventsBody.items[0].payload.accessToken).toBe("[REDACTED]");

    const sessionsResponse = await fetch(`${baseUrl}/api/sessions`);
    const sessionsBody = await sessionsResponse.json();
    expect(sessionsResponse.status).toBe(200);
    expect(sessionsBody.items).toHaveLength(1);

    const sessionResponse = await fetch(`${baseUrl}/api/sessions/session-1`);
    const sessionBody = await sessionResponse.json();
    expect(sessionResponse.status).toBe(200);
    expect(sessionBody.session.id).toBe("session-1");

    const tasksResponse = await fetch(`${baseUrl}/api/tasks`);
    const tasksBody = await tasksResponse.json();
    expect(tasksResponse.status).toBe(200);
    expect(tasksBody.items).toHaveLength(1);

    const taskResponse = await fetch(`${baseUrl}/api/tasks/task-1`);
    const taskBody = await taskResponse.json();
    expect(taskResponse.status).toBe(200);
    expect(taskBody.task.id).toBe("task-1");

    const costsResponse = await fetch(`${baseUrl}/api/costs/daily`);
    const costsBody = await costsResponse.json();
    expect(costsResponse.status).toBe(200);
    expect(costsBody.days).toEqual([
      {
        date: "2026-03-04",
        amountUsd: 1,
        entryCount: 2
      }
    ]);

    const workspacesResponse = await fetch(`${baseUrl}/api/monitors/workspaces`);
    const workspacesBody = await workspacesResponse.json();
    expect(workspacesResponse.status).toBe(200);
    expect(Array.isArray(workspacesBody.items)).toBe(true);

    const openclawResponse = await fetch(`${baseUrl}/api/monitors/openclaw`);
    const openclawBody = await openclawResponse.json();
    expect(openclawResponse.status).toBe(200);
    expect(openclawBody.snapshot).toMatchObject({ status: "not_collected" });
  });

  it("rejects unbounded event limit", async () => {
    const repositories = createFixtureRepositories();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    const response = await fetch(`${baseUrl}/api/events?limit=50000`);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("LIMIT_OUT_OF_RANGE");
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("keeps event cursor pagination stable across inserts", async () => {
    const repositories = createFixtureRepositories();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    repositories.events.insert({
      id: "event-1",
      source: "daemon",
      sessionId: null,
      taskId: null,
      workspaceId: "ws-1",
      level: "info",
      kind: "daemon.started",
      payloadJson: "{}",
      createdAt: "2026-03-04T10:01:00.000Z"
    });
    repositories.events.insert({
      id: "event-2",
      source: "daemon",
      sessionId: null,
      taskId: null,
      workspaceId: "ws-1",
      level: "info",
      kind: "daemon.updated",
      payloadJson: "{}",
      createdAt: "2026-03-04T10:02:00.000Z"
    });
    repositories.events.insert({
      id: "event-3",
      source: "daemon",
      sessionId: null,
      taskId: null,
      workspaceId: "ws-1",
      level: "info",
      kind: "daemon.idle",
      payloadJson: "{}",
      createdAt: "2026-03-04T10:03:00.000Z"
    });

    const firstPageResponse = await fetch(`${baseUrl}/api/events?limit=2`);
    const firstPageBody = await firstPageResponse.json();
    expect(firstPageResponse.status).toBe(200);
    expect(firstPageBody.items.map((item) => item.id)).toEqual(["event-3", "event-2"]);
    expect(typeof firstPageBody.nextCursor).toBe("string");

    repositories.events.insert({
      id: "event-4",
      source: "daemon",
      sessionId: null,
      taskId: null,
      workspaceId: "ws-1",
      level: "info",
      kind: "daemon.new",
      payloadJson: "{}",
      createdAt: "2026-03-04T10:04:00.000Z"
    });

    const secondPageResponse = await fetch(
      `${baseUrl}/api/events?limit=2&cursor=${encodeURIComponent(firstPageBody.nextCursor)}`
    );
    const secondPageBody = await secondPageResponse.json();
    expect(secondPageResponse.status).toBe(200);
    expect(secondPageBody.items.map((item) => item.id)).toEqual(["event-1"]);
  });
});
