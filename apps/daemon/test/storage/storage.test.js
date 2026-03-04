import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  createStorageRepositories,
  SECRET_PERSISTENCE_BLOCKED,
  StorageError
} from "../../src/storage/repositories.js";
import { runMigrations } from "../../src/storage/migrations.js";

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

describe("storage migrations", () => {
  it("creates required tables and indexes on up", () => {
    const db = createMemoryDb();

    runMigrations(db, { direction: "up" });

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((entry) => entry.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "config_operations",
        "config_snapshots",
        "cost_entries",
        "events",
        "sessions",
        "system_metrics",
        "tasks",
        "webhook_deliveries",
        "webhooks",
        "workspace_metrics"
      ])
    );

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all()
      .map((entry) => entry.name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        "idx_events_session_created_at",
        "idx_events_workspace_created_at",
        "idx_sessions_workspace_started_at"
      ])
    );
  });

  it("drops created tables on down", () => {
    const db = createMemoryDb();

    runMigrations(db, { direction: "up" });
    runMigrations(db, { direction: "down" });

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((entry) => entry.name);

    expect(tables).toEqual([]);
  });
});

describe("storage repositories", () => {
  it("inserts and queries timeline + session fixtures", () => {
    const db = createMemoryDb();

    runMigrations(db, { direction: "up" });
    const repos = createStorageRepositories(db);

    repos.sessions.insert({
      id: "s-1",
      workspaceId: "w-1",
      status: "running",
      startedAt: "2026-03-04T10:00:00.000Z"
    });

    repos.events.insert({
      id: "e-1",
      sessionId: "s-1",
      workspaceId: "w-1",
      level: "info",
      kind: "daemon.started",
      payloadJson: "{}",
      createdAt: "2026-03-04T10:01:00.000Z"
    });

    expect(repos.sessions.listByWorkspace("w-1")).toHaveLength(1);
    expect(repos.events.listBySession("s-1")).toHaveLength(1);
    expect(repos.events.listTimelineByWorkspace("w-1")).toHaveLength(1);
  });

  it("blocks plaintext secret/token persistence at repo boundary", () => {
    const db = createMemoryDb();

    runMigrations(db, { direction: "up" });
    const repos = createStorageRepositories(db);

    expect(() => {
      repos.webhooks.insert({
        id: "wh-1",
        workspaceId: "w-1",
        endpointUrl: "https://example.test/webhooks/control",
        webhookSecret: "plain-text-secret",
        createdAt: "2026-03-04T10:00:00.000Z"
      });
    }).toThrowError(StorageError);

    expect(() => {
      repos.configSnapshots.insert({
        id: "cfg-1",
        workspaceId: "w-1",
        source: "gateway",
        gatewayToken: "plain-token",
        snapshotJson: "{}",
        capturedAt: "2026-03-04T10:00:00.000Z"
      });
    }).toThrowError(
      expect.objectContaining({ code: SECRET_PERSISTENCE_BLOCKED })
    );
  });

  it("manages webhook outbox retries and breaker persistence", () => {
    const db = createMemoryDb();

    runMigrations(db, { direction: "up" });
    const repos = createStorageRepositories(db);

    repos.webhooks.insert({
      id: "wh-1",
      workspaceId: "w-1",
      endpointUrl: "https://receiver.test/webhook",
      secretRef: "WEBHOOK_SECRET",
      enabled: 1,
      breakerState: "closed",
      consecutiveFailures: 0,
      breakerNextAttemptAt: null,
      createdAt: "2026-03-04T11:00:00.000Z",
      updatedAt: "2026-03-04T11:00:00.000Z"
    });

    repos.webhookDeliveries.enqueue({
      id: "delivery-1",
      webhookId: "wh-1",
      eventId: null,
      payloadJson: JSON.stringify({ ok: true }),
      status: "pending",
      attemptCount: 0,
      maxAttempts: 4,
      responseCode: null,
      attemptedAt: null,
      nextAttemptAt: "2026-03-04T11:00:00.000Z",
      lastError: null,
      createdAt: "2026-03-04T11:00:00.000Z",
      updatedAt: "2026-03-04T11:00:00.000Z"
    });

    const due = repos.webhookDeliveries.listDue("2026-03-04T11:00:00.000Z", 10);
    expect(due).toHaveLength(1);
    expect(due[0].attemptCount).toBe(0);

    repos.webhookDeliveries.markRetry({
      id: "delivery-1",
      attemptCount: 1,
      responseCode: 503,
      attemptedAt: "2026-03-04T11:00:01.000Z",
      nextAttemptAt: "2026-03-04T11:00:06.000Z",
      lastError: "upstream unavailable",
      updatedAt: "2026-03-04T11:00:01.000Z"
    });

    repos.webhooks.updateBreaker({
      id: "wh-1",
      breakerState: "open",
      consecutiveFailures: 3,
      breakerNextAttemptAt: "2026-03-04T11:00:30.000Z",
      updatedAt: "2026-03-04T11:00:01.000Z"
    });

    const summary = repos.webhooks.listWithDeliverySummaryByWorkspace("w-1");
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      id: "wh-1",
      breakerState: "open",
      consecutiveFailures: 3,
      lastStatus: "retrying",
      nextAttemptAt: "2026-03-04T11:00:06.000Z"
    });

    const history = repos.webhookDeliveries.listByWebhook("wh-1");
    expect(history[0]).toMatchObject({
      id: "delivery-1",
      status: "retrying",
      attemptCount: 1,
      responseCode: 503,
      nextAttemptAt: "2026-03-04T11:00:06.000Z"
    });
  });
});
