import { copyFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { HttpError } from "../../middleware/error-handler.js";
import {
  loadLatestSessionRegistryEntries,
  resolveRegistryWorkspacePath
} from "../../openclaw/session-registry.js";

const MAX_FILE_SIZE_BYTES = 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml"]);

function findAgentEntry(agents, agentId) {
  return agents.find((entry) => entry?.agent === agentId) ?? null;
}

function isWithinRoot(candidatePath, rootPath) {
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${path.sep}`);
}

function normalizeRelativeFilePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    throw new HttpError(400, "INVALID_FILE_PATH", "File path is required");
  }

  const normalized = path.posix.normalize(relativePath.trim().replace(/\\+/g, "/"));
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
  }

  return normalized;
}

function assertAllowedFileExtension(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
    throw new HttpError(400, "UNSUPPORTED_FILE_EXTENSION", "File extension is not allowed");
  }
}

function resolveWorkspacePath(workspaceRoot, relativePath) {
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  if (!isWithinRoot(absolutePath, workspaceRoot)) {
    throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
  }

  return absolutePath;
}

async function resolveAgentWorkspace(_monitorProviders, agentId) {
  const agents = await loadLatestSessionRegistryEntries();
  const agentEntry = findAgentEntry(agents, agentId);

  if (!agentEntry) {
    throw new HttpError(404, "AGENT_NOT_FOUND", "Agent not found");
  }

  const workspaceRoot = resolveRegistryWorkspacePath(agentEntry);
  if (!workspaceRoot) {
    throw new HttpError(404, "AGENT_WORKSPACE_NOT_FOUND", "Agent workspace not found");
  }

  let workspaceStats;
  try {
    workspaceStats = await stat(workspaceRoot);
  } catch {
    throw new HttpError(404, "AGENT_WORKSPACE_NOT_FOUND", "Agent workspace not found");
  }

  if (!workspaceStats.isDirectory()) {
    throw new HttpError(404, "AGENT_WORKSPACE_NOT_FOUND", "Agent workspace not found");
  }

  return {
    workspaceRoot,
    workspaceId:
      typeof agentEntry.workspacePath === "string" && agentEntry.workspacePath.trim().length > 0
        ? agentEntry.workspacePath.trim()
        : "global"
  };
}

export async function writeAgentFile({ body, monitorProviders, agentId, requestedPath }) {
  if (typeof body?.content !== "string") {
    throw new HttpError(400, "INVALID_BODY", "content must be a UTF-8 string");
  }

  const contentSize = Buffer.byteLength(body.content, "utf8");
  if (contentSize > MAX_FILE_SIZE_BYTES) {
    throw new HttpError(413, "FILE_TOO_LARGE", "File size exceeds 1MB limit");
  }

  const { workspaceRoot, workspaceId } = await resolveAgentWorkspace(monitorProviders, agentId);
  const relativePath = normalizeRelativeFilePath(requestedPath);
  assertAllowedFileExtension(relativePath);

  const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);
  const parentPath = path.dirname(absolutePath);

  let parentStats;
  try {
    parentStats = await stat(parentPath);
  } catch {
    throw new HttpError(404, "FILE_NOT_FOUND", "File not found");
  }

  if (!parentStats.isDirectory()) {
    throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
  }

  let targetStats = null;
  try {
    targetStats = await stat(absolutePath);
  } catch {
    targetStats = null;
  }

  if (targetStats !== null) {
    if (!targetStats.isFile()) {
      throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
    }
    await copyFile(absolutePath, `${absolutePath}.bak`);
  }

  await writeFile(absolutePath, body.content, "utf8");
  const modifiedStats = await stat(absolutePath);

  return {
    path: relativePath,
    modifiedAt: modifiedStats.mtime.toISOString(),
    workspaceId
  };
}
