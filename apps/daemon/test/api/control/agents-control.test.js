import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDaemonServer } from "../../../src/server/http-server.js";
import { runMigrations } from "../../../src/storage/migrations.js";
import { createStorageRepositories } from "../../../src/storage/repositories.js";

const activeServers = [];
const openDatabases = [];
const temporaryDirectories = [];

afterEach(async () => {
  while (activeServers.length > 0) {
    const entry = activeServers.pop();
    await entry.stop();
  }

  while (openDatabases.length > 0) {
    const db = openDatabases.pop();
    db.close();
  }

  while (temporaryDirectories.length > 0) {
    const dirPath = temporaryDirectories.pop();
    await rm(dirPath, { recursive: true, force: true });
  }

  delete process.env.DAEMON_MONITOR_OPENCLAW_ROOT;
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

async function startServer({ repositories }) {
  const server = createDaemonServer({
    host: "127.0.0.1",
    port: 0,
    adminToken: "dev-token",
    logger: { info() {}, error() {} },
    repositories
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

async function createRegistryFixture() {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "daemon-control-agents-"));
  temporaryDirectories.push(baseDir);

  const openclawRoot = path.join(baseDir, ".openclaw");
  const relativeWorkspace = path.join(openclawRoot, "workspaces", "completed");
  await mkdir(path.join(openclawRoot, "state"), { recursive: true });
  await mkdir(relativeWorkspace, { recursive: true });
  await writeFile(path.join(relativeWorkspace, "notes.txt"), "original", "utf8");

  await writeFile(
    path.join(openclawRoot, "state", "session-registry.json"),
    JSON.stringify(
      {
        sessions: [
          {
            id: "runtime-completed-1",
            agent: "agent-completed",
            workspacePath: "workspaces/completed",
            status: "completed",
            updatedAt: "2026-03-05T12:00:00.000Z"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  process.env.DAEMON_MONITOR_OPENCLAW_ROOT = openclawRoot;
  return { relativeWorkspace };
}

describe("control agent APIs", () => {
  it("writes files for completed agents resolved from session registry", async () => {
    const repositories = createFixtureRepositories();
    const { relativeWorkspace } = await createRegistryFixture();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const response = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/files/${encodeURIComponent("notes.txt")}`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-agent-write-1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ content: "updated" })
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.path).toBe("notes.txt");

    const written = await readFile(path.join(relativeWorkspace, "notes.txt"), "utf8");
    expect(written).toBe("updated");
  });
});
