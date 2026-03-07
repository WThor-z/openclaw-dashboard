import { copyFile, mkdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
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

function normalizeRelativeDirectoryPath(relativePath, { allowRoot = false } = {}) {
  if (typeof relativePath !== "string") {
    throw new HttpError(400, "INVALID_FILE_PATH", "File path is required");
  }

  const trimmed = relativePath.trim();
  if (trimmed.length === 0) {
    if (allowRoot) {
      return "";
    }

    throw new HttpError(400, "INVALID_FILE_PATH", "File path is required");
  }

  const normalized = path.posix.normalize(trimmed.replace(/\\+/g, "/"));
  if (normalized === ".") {
    if (allowRoot) {
      return "";
    }

    throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
  }

  if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
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

export async function deleteAgentFile({ monitorProviders, agentId, requestedPath }) {
  const { workspaceRoot, workspaceId } = await resolveAgentWorkspace(monitorProviders, agentId);
  const relativePath = normalizeRelativeFilePath(requestedPath);

  const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);

  let targetStats;
  try {
    targetStats = await stat(absolutePath);
  } catch {
    throw new HttpError(404, "FILE_NOT_FOUND", "File not found");
  }

  if (!targetStats.isFile()) {
    throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
  }

  await unlink(absolutePath);

  return {
    path: relativePath,
    workspaceId
  };
}

export async function createAgentFolder({ monitorProviders, agentId, requestedPath }) {
  const { workspaceRoot, workspaceId } = await resolveAgentWorkspace(monitorProviders, agentId);
  const relativePath = normalizeRelativeDirectoryPath(requestedPath);
  const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);
  const parentPath = path.dirname(absolutePath);

  let parentStats;
  try {
    parentStats = await stat(parentPath);
  } catch {
    throw new HttpError(404, "PARENT_DIRECTORY_NOT_FOUND", "Parent directory not found");
  }

  if (!parentStats.isDirectory()) {
    throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
  }

  try {
    await stat(absolutePath);
    throw new HttpError(409, "PATH_ALREADY_EXISTS", "Path already exists");
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
  }

  await mkdir(absolutePath, { recursive: false });

  return {
    path: relativePath,
    workspaceId
  };
}

export async function renameWorkspacePath({ monitorProviders, agentId, sourcePath, targetPath }) {
  const { workspaceRoot, workspaceId } = await resolveAgentWorkspace(monitorProviders, agentId);
  const relativeSourcePath = normalizeRelativeFilePath(sourcePath);
  const relativeTargetPath = normalizeRelativeFilePath(targetPath);

  if (relativeSourcePath === relativeTargetPath) {
    throw new HttpError(400, "INVALID_TARGET_PATH", "Target path must be different");
  }

  const absoluteSourcePath = resolveWorkspacePath(workspaceRoot, relativeSourcePath);
  const absoluteTargetPath = resolveWorkspacePath(workspaceRoot, relativeTargetPath);

  let sourceStats;
  try {
    sourceStats = await stat(absoluteSourcePath);
  } catch {
    throw new HttpError(404, "PATH_NOT_FOUND", "Path not found");
  }

  if (sourceStats.isDirectory() && (absoluteTargetPath === absoluteSourcePath || absoluteTargetPath.startsWith(`${absoluteSourcePath}${path.sep}`))) {
    throw new HttpError(400, "INVALID_TARGET_PATH", "Cannot move a directory into itself");
  }

  const targetParentPath = path.dirname(absoluteTargetPath);
  let targetParentStats;
  try {
    targetParentStats = await stat(targetParentPath);
  } catch {
    throw new HttpError(404, "PARENT_DIRECTORY_NOT_FOUND", "Parent directory not found");
  }

  if (!targetParentStats.isDirectory()) {
    throw new HttpError(400, "INVALID_TARGET_PATH", "Target directory is invalid");
  }

  try {
    await stat(absoluteTargetPath);
    throw new HttpError(409, "PATH_ALREADY_EXISTS", "Path already exists");
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
  }

  await rename(absoluteSourcePath, absoluteTargetPath);

  return {
    path: relativeSourcePath,
    nextPath: relativeTargetPath,
    workspaceId,
    isDirectory: sourceStats.isDirectory()
  };
}

export async function deleteWorkspacePath({ monitorProviders, agentId, requestedPath, recursive }) {
  const { workspaceRoot, workspaceId } = await resolveAgentWorkspace(monitorProviders, agentId);
  const relativePath = normalizeRelativeFilePath(requestedPath);
  const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);

  let targetStats;
  try {
    targetStats = await stat(absolutePath);
  } catch {
    throw new HttpError(404, "PATH_NOT_FOUND", "Path not found");
  }

  if (targetStats.isFile()) {
    await unlink(absolutePath);
  } else if (targetStats.isDirectory()) {
    if (!recursive) {
      throw new HttpError(400, "RECURSIVE_REQUIRED", "Directory delete requires recursive=true");
    }

    await rm(absolutePath, { recursive: true, force: false });
  } else {
    throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
  }

  return {
    path: relativePath,
    workspaceId,
    isDirectory: targetStats.isDirectory()
  };
}

export async function moveWorkspacePath({ monitorProviders, agentId, sourcePath, targetDirectory }) {
  const { workspaceRoot, workspaceId } = await resolveAgentWorkspace(monitorProviders, agentId);
  const relativeSourcePath = normalizeRelativeFilePath(sourcePath);
  const relativeTargetDirectory = normalizeRelativeDirectoryPath(targetDirectory, { allowRoot: true });

  const absoluteSourcePath = resolveWorkspacePath(workspaceRoot, relativeSourcePath);
  const absoluteTargetDirectory = resolveWorkspacePath(workspaceRoot, relativeTargetDirectory);

  let sourceStats;
  try {
    sourceStats = await stat(absoluteSourcePath);
  } catch {
    throw new HttpError(404, "PATH_NOT_FOUND", "Path not found");
  }

  let targetDirectoryStats;
  try {
    targetDirectoryStats = await stat(absoluteTargetDirectory);
  } catch {
    throw new HttpError(404, "TARGET_DIRECTORY_NOT_FOUND", "Target directory not found");
  }

  if (!targetDirectoryStats.isDirectory()) {
    throw new HttpError(400, "INVALID_TARGET_PATH", "Target directory is invalid");
  }

  const destinationRelativePath = path.posix.join(relativeTargetDirectory, path.posix.basename(relativeSourcePath));
  const absoluteDestinationPath = resolveWorkspacePath(workspaceRoot, destinationRelativePath);

  if (sourceStats.isDirectory() && (absoluteDestinationPath === absoluteSourcePath || absoluteDestinationPath.startsWith(`${absoluteSourcePath}${path.sep}`))) {
    throw new HttpError(400, "INVALID_TARGET_PATH", "Cannot move a directory into itself");
  }

  try {
    await stat(absoluteDestinationPath);
    throw new HttpError(409, "PATH_ALREADY_EXISTS", "Path already exists");
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
  }

  await rename(absoluteSourcePath, absoluteDestinationPath);

  return {
    path: relativeSourcePath,
    nextPath: destinationRelativePath,
    workspaceId,
    isDirectory: sourceStats.isDirectory()
  };
}
