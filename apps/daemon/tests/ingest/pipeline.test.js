import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createEventIngestionPipeline } from "../../src/platform/ingest/pipeline.js";
import { runMigrations } from "../../src/platform/storage/migrations.js";
import { createStorageRepositories } from "../../src/platform/storage/repositories.js";

const openDatabases = [];

afterEach(() => {
  while (openDatabases.length > 0) {
    const db = openDatabases.pop();
    db.close();
  }
});

function createMemoryDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  openDatabases.push(db);
  return db;
}

function createPipeline() {
  const db = createMemoryDb();
  runMigrations(db, { direction: "up" });
  const repositories = createStorageRepositories(db);
  const pipeline = createEventIngestionPipeline({ repositories, workspaceId: "ws-1" });
  return { pipeline, repositories };
}

function seedSessionTask(repositories, sessionId, taskId) {
  const now = "2026-03-04T10:00:00.000Z";
  repositories.sessions.insert({
    id: sessionId,
    workspaceId: "ws-1",
    status: "running",
    startedAt: now
  });
  repositories.tasks.insert({
    id: taskId,
    sessionId,
    workspaceId: "ws-1",
    state: "running",
    summary: "seed task",
    createdAt: now,
    updatedAt: now
  });
}

describe("event ingestion pipeline", () => {
  it("is idempotent when duplicate gateway payloads are ingested", () => {
    const { pipeline, repositories } = createPipeline();
    seedSessionTask(repositories, "session-1", "task-1");

    const frame = {
      type: "event",
      event: "task.updated",
      seq: 20,
      payload: {
        sessionId: "session-1",
        taskId: "task-1",
        status: "running"
      }
    };

    const first = pipeline.ingestGatewayEvent(frame);
    const second = pipeline.ingestGatewayEvent(frame);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(first.envelope?.dedupeKey).toBe(second.envelope?.dedupeKey);

    const rows = repositories.events.listTimelineByWorkspace("ws-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "gateway",
      kind: "task.updated",
      sessionId: "session-1",
      taskId: "task-1"
    });
  });

  it("marks resync as required when a sequence gap is detected", () => {
    const { pipeline } = createPipeline();

    const first = pipeline.ingestGatewayEvent({
      type: "event",
      event: "channels.delta",
      seq: 3,
      payload: {}
    });
    const second = pipeline.ingestGatewayEvent({
      type: "event",
      event: "channels.delta",
      seq: 5,
      payload: {}
    });

    expect(first.resyncRequired).toBe(false);
    expect(second.resyncRequired).toBe(true);
    expect(second.gap).toEqual({ expected: 4, received: 5 });
    expect(pipeline.getState().resyncRequired).toBe(true);
  });

  it("handles out-of-order gateway events without dropping valid data", () => {
    const { pipeline, repositories } = createPipeline();
    seedSessionTask(repositories, "session-2", "task-2");

    const newer = pipeline.ingestGatewayEvent({
      type: "event",
      event: "channels.delta",
      seq: 10,
      payload: { sessionId: "session-2", taskId: "task-2", message: "new" }
    });
    const older = pipeline.ingestGatewayEvent({
      type: "event",
      event: "channels.delta",
      seq: 9,
      payload: { sessionId: "session-2", taskId: "task-2", message: "old" }
    });

    expect(newer.inserted).toBe(true);
    expect(older.inserted).toBe(true);
    expect(older.resyncRequired).toBe(false);

    const rows = repositories.events.listTimelineByWorkspace("ws-1");
    expect(rows).toHaveLength(2);
  });

  it("persists malformed gateway frames as ingest.error events", () => {
    const { pipeline, repositories } = createPipeline();

    const result = pipeline.ingestGatewayFrame("{\"type\":\"event\",\"event\":\"channels.delta\",\"payload\":");
    expect(result.inserted).toBe(true);
    expect(result.error).toBeDefined();

    const rows = repositories.events.listTimelineByWorkspace("ws-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "gateway",
      kind: "ingest.error",
      level: "error"
    });

    const payload = JSON.parse(rows[0].payloadJson);
    expect(payload.reason).toContain("JSON");
  });

  it("normalizes daemon and cli events into the canonical envelope", () => {
    const { pipeline, repositories } = createPipeline();

    const daemonResult = pipeline.ingestDaemonEvent({
      kind: "daemon.started",
      level: "info",
      payload: { pid: 123 }
    });
    const cliResult = pipeline.ingestCliEvent({
      kind: "cli.imported",
      level: "warn",
      payload: { file: "events.ndjson", count: 3 }
    });

    expect(daemonResult.inserted).toBe(true);
    expect(cliResult.inserted).toBe(true);
    expect(daemonResult.envelope).toMatchObject({
      source: "daemon",
      kind: "daemon.started",
      level: "info",
      workspaceId: "ws-1"
    });
    expect(cliResult.envelope).toMatchObject({
      source: "cli",
      kind: "cli.imported",
      level: "warn",
      workspaceId: "ws-1"
    });
    expect(typeof daemonResult.envelope?.dedupeKey).toBe("string");
    expect(typeof cliResult.envelope?.dedupeKey).toBe("string");

    const rows = repositories.events.listTimelineByWorkspace("ws-1");
    expect(rows).toHaveLength(2);
  });
});
