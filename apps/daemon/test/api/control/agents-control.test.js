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
  it("creates new files for completed agents resolved from session registry", async () => {
    const repositories = createFixtureRepositories();
    const { relativeWorkspace } = await createRegistryFixture();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const response = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/files/${encodeURIComponent("new-note.md")}`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-agent-create-1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ content: "# New file" })
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.path).toBe("new-note.md");

    const written = await readFile(path.join(relativeWorkspace, "new-note.md"), "utf8");
    expect(written).toBe("# New file");
  });

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

  it("deletes files for completed agents resolved from session registry", async () => {
    const repositories = createFixtureRepositories();
    const { relativeWorkspace } = await createRegistryFixture();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const response = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/files/${encodeURIComponent("notes.txt")}/delete`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-agent-delete-1"
        }
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.path).toBe("notes.txt");

    await expect(readFile(path.join(relativeWorkspace, "notes.txt"), "utf8")).rejects.toBeTruthy();
  });

  it("deletes files through body-path route for frontend compatibility", async () => {
    const repositories = createFixtureRepositories();
    const { relativeWorkspace } = await createRegistryFixture();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const response = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/files/delete`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-agent-delete-by-body-1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ path: "notes.txt" })
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.path).toBe("notes.txt");

    await expect(readFile(path.join(relativeWorkspace, "notes.txt"), "utf8")).rejects.toBeTruthy();
  });

  it("creates folders and supports rename, move, and recursive delete for directories", async () => {
    const repositories = createFixtureRepositories();
    const { relativeWorkspace } = await createRegistryFixture();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const createFolderResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/folders/create`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-folder-create-1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ path: "docs" })
      }
    );
    expect(createFolderResponse.status).toBe(200);

    await writeFile(path.join(relativeWorkspace, "docs", "guide.md"), "hello", "utf8");
    await writeFile(path.join(relativeWorkspace, "docs", "archive.pdf"), "binary-placeholder", "utf8");

    const deletePdfResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/paths/delete`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-path-delete-pdf-1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ path: "docs/archive.pdf", recursive: true })
      }
    );
    expect(deletePdfResponse.status).toBe(200);

    const renameResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/paths/rename`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-path-rename-1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ path: "docs", nextPath: "guides" })
      }
    );
    expect(renameResponse.status).toBe(200);

    const createArchiveResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/folders/create`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-folder-create-archive-1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ path: "archive" })
      }
    );
    expect(createArchiveResponse.status).toBe(200);

    const moveResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/paths/move`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-path-move-1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ path: "guides", targetDirectory: "archive" })
      }
    );
    expect(moveResponse.status).toBe(200);

    const deleteResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-completed")}/paths/delete`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "idempotency-key": "idem-path-delete-1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ path: "archive/guides", recursive: true })
      }
    );
    expect(deleteResponse.status).toBe(200);

    await expect(readFile(path.join(relativeWorkspace, "archive", "guides", "guide.md"), "utf8")).rejects.toBeTruthy();

  });
});
