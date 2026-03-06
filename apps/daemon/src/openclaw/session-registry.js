import { readFile } from "node:fs/promises";
import path from "node:path";

const SESSION_REGISTRY_RELATIVE_PATH = path.join("state", "session-registry.json");
const REGISTRY_COLLECTION_KEYS = [
  "sessions",
  "activeSessions",
  "sessionRegistry",
  "registry",
  "items",
  "entries",
  "records",
  "agents",
  "workers"
];
const ERROR_MARKERS = new Set(["error", "failed"]);
const BUSY_MARKERS = new Set(["running", "busy", "active", "connected", "online"]);
const OFFLINE_MARKERS = new Set([
  "completed",
  "stopped",
  "terminated",
  "closed",
  "offline",
  "cancelled",
  "failed"
]);

function isObjectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readByPath(target, pathParts) {
  let current = target;
  for (const pathPart of pathParts) {
    if (!isObjectRecord(current) || !(pathPart in current)) {
      return null;
    }

    current = current[pathPart];
  }

  return current;
}

function pickStringByPaths(target, pathCandidates) {
  for (const pathCandidate of pathCandidates) {
    const value = toNonEmptyString(readByPath(target, pathCandidate));
    if (value) {
      return value;
    }
  }

  return null;
}

function collectObjectEntries(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => isObjectRecord(entry));
  }

  if (isObjectRecord(value)) {
    return Object.values(value).filter((entry) => isObjectRecord(entry));
  }

  return [];
}

function extractRegistryEntries(registryJson) {
  if (Array.isArray(registryJson)) {
    return registryJson.filter((entry) => isObjectRecord(entry));
  }

  if (!isObjectRecord(registryJson)) {
    return [];
  }

  const entries = [];
  for (const key of REGISTRY_COLLECTION_KEYS) {
    if (!(key in registryJson)) {
      continue;
    }

    entries.push(...collectObjectEntries(registryJson[key]));
  }

  return entries;
}

function compareUpdatedAt(candidateUpdatedAt, currentUpdatedAt) {
  const candidate = toNonEmptyString(candidateUpdatedAt);
  const current = toNonEmptyString(currentUpdatedAt);

  if (candidate && !current) {
    return 1;
  }
  if (!candidate && current) {
    return -1;
  }
  if (!candidate && !current) {
    return 0;
  }

  if (candidate > current) {
    return 1;
  }
  if (candidate < current) {
    return -1;
  }

  return 0;
}

function normalizeRegistryEntry(entry) {
  const agent = pickStringByPaths(entry, [
    ["agent"],
    ["agentId"],
    ["agent_id"],
    ["clientId"],
    ["client_id"],
    ["workerId"],
    ["worker_id"]
  ]);
  if (!agent) {
    return null;
  }

  const workspacePath = pickStringByPaths(entry, [
    ["workspacePath"],
    ["workspace_path"],
    ["workspace"],
    ["cwd"],
    ["workingDirectory"],
    ["working_directory"]
  ]);
  const updatedAt = pickStringByPaths(entry, [
    ["updatedAt"],
    ["updated_at"],
    ["lastSeenAt"],
    ["last_seen_at"],
    ["heartbeatAt"],
    ["heartbeat_at"],
    ["createdAt"],
    ["created_at"]
  ]);

  return {
    agent,
    workspacePath,
    status: normalizeAgentStatus(
      pickStringByPaths(entry, [["status"], ["state"], ["phase"], ["connection"], ["lifecycle"]])
    ),
    updatedAt
  };
}

export function normalizeAgentStatus(rawStatus) {
  const normalized = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : "";

  if (!normalized) {
    return "idle";
  }

  if (ERROR_MARKERS.has(normalized) || [...ERROR_MARKERS].some((marker) => normalized.includes(marker))) {
    return "error";
  }

  if (BUSY_MARKERS.has(normalized) || [...BUSY_MARKERS].some((marker) => normalized.includes(marker))) {
    return "busy";
  }

  if (OFFLINE_MARKERS.has(normalized) || [...OFFLINE_MARKERS].some((marker) => normalized.includes(marker))) {
    return "offline";
  }

  return "idle";
}

export async function loadLatestSessionRegistryEntries({ env = process.env } = {}) {
  const openclawRoot = toNonEmptyString(env.DAEMON_MONITOR_OPENCLAW_ROOT);
  if (!openclawRoot) {
    return [];
  }

  const registryPath = path.join(openclawRoot, SESSION_REGISTRY_RELATIVE_PATH);

  let rawRegistry;
  try {
    rawRegistry = await readFile(registryPath, "utf8");
  } catch {
    return [];
  }

  let registryJson;
  try {
    registryJson = JSON.parse(rawRegistry);
  } catch {
    return [];
  }

  const normalizedEntries = extractRegistryEntries(registryJson)
    .map((entry) => normalizeRegistryEntry(entry))
    .filter((entry) => entry !== null);
  const latestByAgent = new Map();

  for (const entry of normalizedEntries) {
    const current = latestByAgent.get(entry.agent);
    if (!current || compareUpdatedAt(entry.updatedAt, current.updatedAt) > 0) {
      latestByAgent.set(entry.agent, entry);
    }
  }

  return [...latestByAgent.values()];
}

export function resolveRegistryWorkspacePath(entry, { env = process.env } = {}) {
  const workspacePath = toNonEmptyString(entry?.workspacePath);
  if (!workspacePath) {
    return null;
  }

  if (path.isAbsolute(workspacePath)) {
    return path.resolve(workspacePath);
  }

  const openclawRoot = toNonEmptyString(env.DAEMON_MONITOR_OPENCLAW_ROOT);
  if (!openclawRoot) {
    return null;
  }

  return path.resolve(openclawRoot, workspacePath);
}
