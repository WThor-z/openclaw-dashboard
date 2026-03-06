import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createDaemonServer } from "../../../src/server/http-server.js";
import { runMigrations } from "../../../src/storage/migrations.js";
import { createStorageRepositories } from "../../../src/storage/repositories.js";

const activeServers = [];
const openDatabases = [];
const temporaryDirectories = [];
const READ_TOKEN = "dev-token";

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

async function startServer({ repositories, monitorProviders }) {
  const server = createDaemonServer({
    host: "127.0.0.1",
    port: 0,
    adminToken: READ_TOKEN,
    logger: { info() {}, error() {} },
    repositories,
    monitorProviders
  });
  await server.start();
  activeServers.push(server);
  return server;
}

function authorizedGet(url) {
  return fetch(url, {
    headers: {
      authorization: `Bearer ${READ_TOKEN}`
    }
  });
}

async function createRegistryFixture() {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "daemon-read-agents-"));
  temporaryDirectories.push(baseDir);

  const openclawRoot = path.join(baseDir, ".openclaw");
  const absoluteWorkspace = path.join(baseDir, "workspace-absolute");
  const relativeWorkspace = path.join(openclawRoot, "workspaces", "completed");
  const olderRelativeWorkspace = path.join(openclawRoot, "workspaces", "stale");

  await mkdir(path.join(openclawRoot, "state"), { recursive: true });
  await mkdir(absoluteWorkspace, { recursive: true });
  await mkdir(relativeWorkspace, { recursive: true });
  await mkdir(olderRelativeWorkspace, { recursive: true });

  await writeFile(path.join(relativeWorkspace, "summary.md"), "# complete\n", "utf8");

  await writeFile(
    path.join(openclawRoot, "state", "session-registry.json"),
    JSON.stringify(
      {
        sessions: [
          {
            id: "runtime-running",
            agent: "agent-alpha",
            workspacePath: absoluteWorkspace,
            status: "running",
            updatedAt: "2026-03-05T11:59:30.000Z"
          },
          {
            id: "runtime-completed-new",
            agent: "agent-beta",
            workspacePath: "workspaces/completed",
            status: "completed",
            updatedAt: "2026-03-05T12:00:00.000Z"
          },
          {
            id: "runtime-completed-old",
            agent: "agent-beta",
            workspacePath: "workspaces/stale",
            status: "running",
            updatedAt: "2026-03-05T11:58:00.000Z"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  process.env.DAEMON_MONITOR_OPENCLAW_ROOT = openclawRoot;
  return { openclawRoot, relativeWorkspace };
}

describe("read agent APIs", () => {
  it("lists agents with registry fields required by dashboard", async () => {
    const repositories = createFixtureRepositories();
    await createRegistryFixture();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    const agentsResponse = await authorizedGet(`${baseUrl}/api/agents`);
    const agentsBody = await agentsResponse.json();

    expect(agentsResponse.status).toBe(200);
    expect(agentsBody.items).toHaveLength(2);
    expect(agentsBody.items).toEqual(
      expect.arrayContaining([
        {
          id: "agent-alpha",
          name: "agent-alpha",
          role: "worker",
          workspacePath: expect.any(String),
          status: "busy",
          updatedAt: "2026-03-05T11:59:30.000Z"
        },
        {
          id: "agent-beta",
          name: "agent-beta",
          role: "worker",
          workspacePath: expect.any(String),
          status: "offline",
          updatedAt: "2026-03-05T12:00:00.000Z"
        }
      ])
    );
  });

  it("uses gateway runtime status for /api/agents/:id/status when available", async () => {
    const repositories = createFixtureRepositories();
    await createRegistryFixture();
    const monitorProviders = {
      async gateway() {
        return {
          snapshot: {
            agents: [
              {
                id: "runtime-completed-new",
                agent: "agent-beta",
                state: "running",
                updatedAt: "2026-03-05T12:01:00.000Z"
              }
            ]
          }
        };
      }
    };
    const server = await startServer({ repositories, monitorProviders });
    const baseUrl = endpointFrom(server.address());

    const statusResponse = await authorizedGet(`${baseUrl}/api/agents/agent-beta/status`);
    const statusBody = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(statusBody).toEqual({
      status: "busy",
      updatedAt: "2026-03-05T12:01:00.000Z"
    });
  });

  it("falls back to registry status when gateway has no matching agent", async () => {
    const repositories = createFixtureRepositories();
    await createRegistryFixture();
    const monitorProviders = {
      async gateway() {
        return {
          snapshot: {
            agents: [
              {
                id: "runtime-running",
                agent: "agent-alpha",
                state: "running",
                updatedAt: "2026-03-05T11:59:30.000Z"
              }
            ]
          }
        };
      }
    };
    const server = await startServer({ repositories, monitorProviders });
    const baseUrl = endpointFrom(server.address());

    const statusResponse = await authorizedGet(`${baseUrl}/api/agents/agent-beta/status`);
    const statusBody = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(statusBody).toEqual({
      status: "offline",
      updatedAt: "2026-03-05T12:00:00.000Z"
    });
  });

  it("returns 404 when agent is not found in registry", async () => {
    const repositories = createFixtureRepositories();
    await createRegistryFixture();
    const monitorProviders = {
      async gateway() {
        return {
          snapshot: {
            agents: []
          }
        };
      }
    };
    const server = await startServer({ repositories, monitorProviders });
    const baseUrl = endpointFrom(server.address());

    const statusResponse = await authorizedGet(`${baseUrl}/api/agents/agent-missing/status`);
    const statusBody = await statusResponse.json();

    expect(statusResponse.status).toBe(404);
    expect(statusBody.message).toBe("Agent not found");
  });

  it("lists files for completed agents whose workspacePath is relative", async () => {
    const repositories = createFixtureRepositories();
    const { relativeWorkspace } = await createRegistryFixture();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    const filesResponse = await authorizedGet(`${baseUrl}/api/agents/agent-beta/files`);
    const filesBody = await filesResponse.json();

    expect(filesResponse.status).toBe(200);
    expect(filesBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "summary.md",
          name: "summary.md",
          isDirectory: false
        })
      ])
    );

    const fileResponse = await authorizedGet(`${baseUrl}/api/agents/agent-beta/files/summary.md`);
    const fileBody = await fileResponse.json();
    const fileContents = await readFile(path.join(relativeWorkspace, "summary.md"), "utf8");

    expect(fileResponse.status).toBe(200);
    expect(fileBody.content).toBe(fileContents);
  });
});
