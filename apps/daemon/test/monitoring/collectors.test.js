import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMonitorProviders } from "../../src/monitoring/collectors.js";

const temporaryDirectories = [];

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const dirPath = temporaryDirectories.pop();
    await rm(dirPath, { recursive: true, force: true });
  }
});

async function createWorkspaceRoot() {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "monitoring-collector-"));
  temporaryDirectories.push(baseDir);

  await mkdir(path.join(baseDir, "workspace", "logs"), { recursive: true });
  await writeFile(path.join(baseDir, "workspace", "logs", "error.log"), "error", "utf8");
  await writeFile(path.join(baseDir, "workspace", "notes.txt"), "done", "utf8");

  return path.join(baseDir, "workspace");
}

describe("monitor collectors", () => {
  it("returns metadata-only workspace summaries", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const providers = createMonitorProviders({
      workspaceRoots: [workspaceRoot],
      now: () => new Date("2026-03-05T12:00:00.000Z")
    });

    const snapshot = await providers.workspaces();

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      workspace: "workspace",
      fileCount: 2,
      totalBytes: expect.any(Number),
      failureMarkers: ["logs/error.log"]
    });
    expect(snapshot.items[0]).not.toHaveProperty("content");
  });

  it("rejects requested paths that escape the allowlist", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const providers = createMonitorProviders({ workspaceRoots: [workspaceRoot] });

    await expect(providers.workspaces({ path: "../../Users" })).rejects.toMatchObject({
      code: "PATH_NOT_ALLOWED"
    });
  });

  it("marks openclaw snapshot as missing when directory does not exist", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "monitoring-openclaw-missing-"));
    temporaryDirectories.push(baseDir);

    const missingOpenclawRoot = path.join(baseDir, ".openclaw-missing");
    const providers = createMonitorProviders({
      workspaceRoots: [],
      openclawRoot: missingOpenclawRoot,
      now: () => new Date("2026-03-05T12:00:00.000Z")
    });

    const snapshot = await providers.openclaw();

    expect(snapshot.snapshot.exists).toBe(false);
    expect(snapshot.snapshot.status).toBe("degraded");
    expect(snapshot.snapshot.expectedFiles).toEqual(
      expect.arrayContaining([{ path: "errors.json", exists: false }])
    );
    expect(
      snapshot.snapshot.expectedFiles.some(
        (entry) => entry.path.endsWith("session-registry.json") && entry.exists === false
      )
    ).toBe(true);
  });

  it("extracts active agents and workspace mapping from session registry", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "monitoring-openclaw-gateway-"));
    temporaryDirectories.push(baseDir);

    const openclawRoot = path.join(baseDir, ".openclaw");
    await mkdir(path.join(openclawRoot, "state"), { recursive: true });
    await writeFile(
      path.join(openclawRoot, "state", "session-registry.json"),
      JSON.stringify(
        {
          sessions: [
            {
              id: "runtime-1",
              agent: "agent-alpha",
              workspacePath: "/workspace/a",
              status: "running",
              updatedAt: "2026-03-05T12:00:00.000Z"
            },
            {
              id: "runtime-2",
              agent: "agent-beta",
              workspacePath: "/workspace/b",
              status: "completed",
              updatedAt: "2026-03-05T11:59:00.000Z"
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const providers = createMonitorProviders({
      workspaceRoots: [],
      openclawRoot,
      now: () => new Date("2026-03-05T12:00:00.000Z")
    });

    const snapshot = await providers.gateway();

    expect(snapshot.snapshot).toMatchObject({
      status: "ok",
      registryExists: true,
      activeAgentCount: 1,
      totalEntryCount: 2
    });
    expect(snapshot.snapshot.agents).toHaveLength(1);
    expect(snapshot.snapshot.agents[0]).toMatchObject({
      id: "runtime-1",
      agent: "agent-alpha",
      workspace: "/workspace/a",
      state: "running"
    });
  });
});
