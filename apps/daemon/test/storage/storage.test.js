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
});
