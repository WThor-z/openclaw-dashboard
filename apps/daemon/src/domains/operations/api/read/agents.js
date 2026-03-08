import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { HttpError, sendJson } from "../../../../shared/middleware/error-handler.js";
import {
  loadLatestSessionRegistryEntries,
  normalizeAgentStatus,
  resolveRegistryWorkspacePath
} from "../../../../platform/openclaw/session-registry.js";

const MAX_FILE_SIZE_BYTES = 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml"]);

function toAgentItem(entry) {
  const id = typeof entry?.agent === "string" && entry.agent.trim().length > 0 ? entry.agent : "unknown-agent";
  const name = typeof entry?.name === "string" && entry.name.trim().length > 0 ? entry.name.trim() : id;
  const workspacePath =
    typeof entry?.workspacePath === "string" && entry.workspacePath.trim().length > 0
      ? entry.workspacePath
      : null;
  const updatedAt =
    typeof entry?.updatedAt === "string" && entry.updatedAt.trim().length > 0 ? entry.updatedAt : null;

  const item = {
    id,
    name,
    role: "worker",
    workspacePath,
    status: normalizeAgentStatus(entry?.status),
    updatedAt
  };

  return item;
}

function normalizeComparablePath(targetPath) {
  return typeof targetPath === "string" && targetPath.trim().length > 0
    ? path.normalize(targetPath).replace(/[\\/]+$/, "").toLowerCase()
    : null;
}

function loadGatewayAgents(snapshot) {
  return Array.isArray(snapshot?.snapshot?.agents) ? snapshot.snapshot.agents : [];
}

function compareIsoDateDescending(left, right) {
  const leftValue = typeof left === "string" ? left : "";
  const rightValue = typeof right === "string" ? right : "";

  if (leftValue === rightValue) {
    return 0;
  }

  return leftValue > rightValue ? -1 : 1;
}

function findGatewayAgentMatch(agentEntry, gatewayAgents, { allowAgentAliasFallback = false } = {}) {
  const agentId = typeof agentEntry?.agent === "string" ? agentEntry.agent : null;
  const workspaceRoot = resolveRegistryWorkspacePath(agentEntry);
  const normalizedWorkspace = normalizeComparablePath(workspaceRoot);
  const normalizedRawWorkspace = normalizeComparablePath(agentEntry?.workspacePath);

  const candidates = gatewayAgents
    .map((entry) => {
      const gatewayWorkspace = normalizeComparablePath(entry?.workspace ?? entry?.workspacePath);
      const matchesWorkspace =
        (normalizedWorkspace !== null && gatewayWorkspace === normalizedWorkspace) ||
        (normalizedRawWorkspace !== null && gatewayWorkspace === normalizedRawWorkspace);
      const matchesId = agentId !== null && entry?.id === agentId;
      const matchesAgentAlias = agentId !== null && entry?.agent === agentId;

      let score = 0;
      if (matchesWorkspace) {
        score += 4;
      }
      if (matchesId) {
        score += 2;
      }
      if (allowAgentAliasFallback && matchesAgentAlias) {
        score += 1;
      }

      return {
        entry,
        score,
        matchesWorkspace,
        matchesId,
        matchesAgentAlias
      };
    })
    .filter((candidate) => {
      if (candidate.matchesWorkspace || candidate.matchesId) {
        return true;
      }

      return allowAgentAliasFallback && candidate.matchesAgentAlias;
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return compareIsoDateDescending(left.entry?.updatedAt, right.entry?.updatedAt);
    });

  return candidates[0]?.entry ?? null;
}

function toAgentItemWithGatewayStatus(entry, gatewayAgent) {
  const item = toAgentItem(entry);
  if (!gatewayAgent) {
    return item;
  }

  return {
    ...item,
    status: normalizeAgentStatus(gatewayAgent.state ?? gatewayAgent.status),
    updatedAt:
      typeof gatewayAgent.updatedAt === "string" && gatewayAgent.updatedAt.trim().length > 0
        ? gatewayAgent.updatedAt
        : item.updatedAt
  };
}

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

  return { workspaceRoot, agentEntry };
}

function toPortableRelativePath(workspaceRoot, absolutePath) {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

async function listWorkspaceFilesRecursive(workspaceRoot, currentPath = workspaceRoot) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  const items = [];
  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    let details;
    try {
      details = await stat(absolutePath);
    } catch {
      continue;
    }

    const relativePath = toPortableRelativePath(workspaceRoot, absolutePath);
    if (entry.isDirectory()) {
      const children = await listWorkspaceFilesRecursive(workspaceRoot, absolutePath);
      items.push({
        path: relativePath,
        name: entry.name,
        size: 0,
        modifiedAt: details.mtime.toISOString(),
        isDirectory: true,
        children
      });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    items.push({
      path: relativePath,
      name: entry.name,
      size: details.size,
      modifiedAt: details.mtime.toISOString(),
      isDirectory: false
    });
  }

  return items;
}

export async function handleAgentsListRead(res, _monitorProviders) {
  const agents = await loadLatestSessionRegistryEntries();
  let gatewayAgents = [];

  try {
    gatewayAgents = loadGatewayAgents(_monitorProviders?.gateway ? await _monitorProviders.gateway() : null);
  } catch {
    gatewayAgents = [];
  }

  sendJson(res, 200, {
    items: agents.map((entry) =>
      toAgentItemWithGatewayStatus(entry, findGatewayAgentMatch(entry, gatewayAgents, { allowAgentAliasFallback: false }))
    )
  });
}

export async function handleAgentStatusRead(res, _monitorProviders, agentId) {
  const agents = await loadLatestSessionRegistryEntries();
  const agentEntry = findAgentEntry(agents, agentId);

  if (!agentEntry) {
    throw new HttpError(404, "AGENT_NOT_FOUND", "Agent not found");
  }

  const fallbackUpdatedAt =
    (typeof agentEntry.updatedAt === "string" && agentEntry.updatedAt.trim().length > 0
      ? agentEntry.updatedAt
      : null) ?? new Date().toISOString();

  let status = normalizeAgentStatus(agentEntry.status);
  let updatedAt = fallbackUpdatedAt;

  try {
    const gatewaySnapshot = _monitorProviders?.gateway ? await _monitorProviders.gateway() : null;
    const gatewayAgents = loadGatewayAgents(gatewaySnapshot);
    const gatewayAgent = findGatewayAgentMatch(agentEntry, gatewayAgents, { allowAgentAliasFallback: true });

    if (gatewayAgent) {
      status = normalizeAgentStatus(gatewayAgent.state ?? gatewayAgent.status);
      if (typeof gatewayAgent.updatedAt === "string" && gatewayAgent.updatedAt.trim().length > 0) {
        updatedAt = gatewayAgent.updatedAt;
      }
    }
  } catch {
    // Fall back to registry-derived status when gateway status is unavailable.
  }

  sendJson(res, 200, {
    status,
    updatedAt
  });
}

export async function handleAgentFilesListRead(res, monitorProviders, agentId) {
  const { workspaceRoot } = await resolveAgentWorkspace(monitorProviders, agentId);
  const items = await listWorkspaceFilesRecursive(workspaceRoot);
  sendJson(res, 200, { items });
}

export async function handleAgentFileRead(res, monitorProviders, agentId, requestedPath) {
  const { workspaceRoot } = await resolveAgentWorkspace(monitorProviders, agentId);
  const relativePath = normalizeRelativeFilePath(requestedPath);
  assertAllowedFileExtension(relativePath);

  const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);

  let fileStats;
  try {
    fileStats = await stat(absolutePath);
  } catch {
    throw new HttpError(404, "FILE_NOT_FOUND", "File not found");
  }

  if (!fileStats.isFile()) {
    throw new HttpError(404, "FILE_NOT_FOUND", "File not found");
  }

  if (fileStats.size > MAX_FILE_SIZE_BYTES) {
    throw new HttpError(413, "FILE_TOO_LARGE", "File size exceeds 1MB limit");
  }

  const content = await readFile(absolutePath, "utf8");
  sendJson(res, 200, {
    path: relativePath,
    content,
    modifiedAt: fileStats.mtime.toISOString()
  });
}
