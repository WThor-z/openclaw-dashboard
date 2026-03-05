import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createMonitorProviders } from "../../../src/monitoring/collectors.js";
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

async function createFixtureTree() {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "daemon-monitoring-"));
  temporaryDirectories.push(baseDir);

  const workspaceOnePath = path.join(baseDir, "workspace-1");
  const workspaceTwoPath = path.join(baseDir, "workspace-2");
  const openclawPath = path.join(baseDir, ".openclaw");

  await mkdir(path.join(workspaceOnePath, "logs"), { recursive: true });
  await mkdir(path.join(workspaceTwoPath, "src"), { recursive: true });
  await mkdir(path.join(openclawPath, "state"), { recursive: true });

  await writeFile(path.join(workspaceOnePath, "logs", "error.log"), "boom", "utf8");
  await writeFile(path.join(workspaceOnePath, "build.json"), '{"ok":true}', "utf8");
  await writeFile(path.join(workspaceTwoPath, "src", "index.js"), "export const ready = true;", "utf8");
  await writeFile(
    path.join(openclawPath, "state", "session-registry.json"),
    JSON.stringify(
      {
        sessions: [
          {
            id: "runtime-1",
            agent: "agent-alpha",
            workspacePath: workspaceOnePath,
            status: "running",
            updatedAt: "2026-03-05T11:59:00.000Z"
          },
          {
            id: "runtime-2",
            agent: "agent-beta",
            workspacePath: workspaceTwoPath,
            status: "completed",
            updatedAt: "2026-03-05T11:55:00.000Z"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(path.join(openclawPath, "errors.json"), "{}", "utf8");

  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60_000);
  await utimes(path.join(workspaceTwoPath, "src", "index.js"), oneMinuteAgo, oneMinuteAgo);

  return { workspaceOnePath, workspaceTwoPath, openclawPath };
}

describe("monitor read APIs", () => {
  it("returns workspace and openclaw monitoring summaries", async () => {
    const repositories = createFixtureRepositories();
    const fixtures = await createFixtureTree();
    const monitorProviders = createMonitorProviders({
      workspaceRoots: [fixtures.workspaceOnePath, fixtures.workspaceTwoPath],
      openclawRoot: fixtures.openclawPath,
      now: () => new Date("2026-03-05T12:00:00.000Z")
    });
    const server = await startServer({ repositories, monitorProviders });
    const baseUrl = endpointFrom(server.address());

    const workspacesResponse = await authorizedGet(`${baseUrl}/api/monitors/workspaces`);
    const workspacesBody = await workspacesResponse.json();

    expect(workspacesResponse.status).toBe(200);
    expect(workspacesBody.items).toHaveLength(2);
    expect(workspacesBody.items[0]).toMatchObject({
      fileCount: expect.any(Number),
      totalBytes: expect.any(Number),
      hotFileCount: expect.any(Number)
    });
    expect(workspacesBody.items[0]).not.toHaveProperty("content");

    const openclawResponse = await authorizedGet(`${baseUrl}/api/monitors/openclaw`);
    const openclawBody = await openclawResponse.json();

    expect(openclawResponse.status).toBe(200);
    expect(openclawBody.snapshot).toMatchObject({
      status: "ok",
      exists: true,
      expectedFiles: expect.any(Array)
    });

    const gatewayResponse = await authorizedGet(`${baseUrl}/api/monitors/gateway`);
    const gatewayBody = await gatewayResponse.json();

    expect(gatewayResponse.status).toBe(200);
    expect(gatewayBody.snapshot).toMatchObject({
      status: "ok",
      registryExists: true,
      activeAgentCount: 1,
      totalEntryCount: 2
    });
    expect(gatewayBody.snapshot.agents).toHaveLength(1);
    expect(gatewayBody.snapshot.agents[0]).toMatchObject({
      id: "runtime-1",
      agent: "agent-alpha",
      workspace: fixtures.workspaceOnePath,
      state: "running"
    });
  });

  it("rejects traversal path requests with PATH_NOT_ALLOWED", async () => {
    const repositories = createFixtureRepositories();
    const fixtures = await createFixtureTree();
    const monitorProviders = createMonitorProviders({
      workspaceRoots: [fixtures.workspaceOnePath],
      openclawRoot: fixtures.openclawPath,
      now: () => new Date("2026-03-05T12:00:00.000Z")
    });
    const server = await startServer({ repositories, monitorProviders });
    const baseUrl = endpointFrom(server.address());

    const response = await authorizedGet(`${baseUrl}/api/monitors/workspaces?path=../../Users`);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("PATH_NOT_ALLOWED");
  });
});
