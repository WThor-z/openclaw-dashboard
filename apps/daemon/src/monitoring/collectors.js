import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { HttpError } from "../middleware/error-handler.js";

const WORKSPACE_FAILURE_MARKERS = new Set(["error.log", "crash.log", "errors.json"]);
const OPENCLAW_SESSION_REGISTRY_PATH = path.join("state", "session-registry.json");
const OPENCLAW_EXPECTED_FILES = ["errors.json", OPENCLAW_SESSION_REGISTRY_PATH];
const DEFAULT_HOT_WINDOW_MINUTES = 30;
const DEFAULT_HOT_FILES_LIMIT = 5;
const RUNNING_STATE_MARKERS = new Set(["running", "active", "connected", "busy", "online"]);
const STOPPED_STATE_MARKERS = new Set([
  "stopped",
  "completed",
  "failed",
  "cancelled",
  "terminated",
  "offline",
  "closed"
]);
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
    const nextValue = toNonEmptyString(readByPath(target, pathCandidate));
    if (nextValue) {
      return nextValue;
    }
  }

  return null;
}

function pickBooleanByPaths(target, pathCandidates) {
  for (const pathCandidate of pathCandidates) {
    const value = readByPath(target, pathCandidate);
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return true;
      }
      if (normalized === "false" || normalized === "0" || normalized === "no") {
        return false;
      }
    }
  }

  return null;
}

function normalizeState(rawState) {
  const state = toNonEmptyString(rawState);
  return state ? state.toLowerCase() : "unknown";
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

function looksLikeRegistryEntry(entry) {
  if (!isObjectRecord(entry)) {
    return false;
  }

  return Boolean(
    pickStringByPaths(entry, [
      ["id"],
      ["sessionId"],
      ["session_id"],
      ["agent"],
      ["agentId"],
      ["agent_id"],
      ["workspace"],
      ["workspacePath"],
      ["workspace_path"],
      ["cwd"],
      ["workingDirectory"],
      ["working_directory"],
      ["status"],
      ["state"]
    ])
  );
}

function extractRegistryEntries(registryJson) {
  if (Array.isArray(registryJson)) {
    return registryJson.filter((entry) => isObjectRecord(entry));
  }

  if (!isObjectRecord(registryJson)) {
    return [];
  }

  const discovered = [];
  for (const key of REGISTRY_COLLECTION_KEYS) {
    if (key in registryJson) {
      discovered.push(...collectObjectEntries(registryJson[key]));
    }
  }

  if (discovered.length > 0) {
    return discovered;
  }

  const objectValues = Object.values(registryJson).filter((entry) => isObjectRecord(entry));
  if (objectValues.length > 0 && objectValues.some((entry) => looksLikeRegistryEntry(entry))) {
    return objectValues;
  }

  return looksLikeRegistryEntry(registryJson) ? [registryJson] : [];
}

function normalizeGatewayAgentEntry(entry) {
  const id =
    pickStringByPaths(entry, [["id"], ["sessionId"], ["session_id"], ["runtimeId"], ["runtime_id"]]) ??
    "unknown";
  const agent =
    pickStringByPaths(entry, [
      ["agent"],
      ["agentId"],
      ["agent_id"],
      ["clientId"],
      ["client_id"],
      ["workerId"],
      ["worker_id"],
      ["source"]
    ]) ?? "unknown-agent";
  const workspace =
    pickStringByPaths(entry, [
      ["workspace"],
      ["workspaceId"],
      ["workspace_id"],
      ["workspacePath"],
      ["workspace_path"],
      ["cwd"],
      ["workingDirectory"],
      ["working_directory"]
    ]) ?? "unknown-workspace";
  const state = normalizeState(
    pickStringByPaths(entry, [["status"], ["state"], ["phase"], ["connection"], ["lifecycle"]])
  );
  const updatedAt =
    pickStringByPaths(entry, [
      ["updatedAt"],
      ["updated_at"],
      ["lastSeenAt"],
      ["last_seen_at"],
      ["heartbeatAt"],
      ["heartbeat_at"],
      ["createdAt"],
      ["created_at"]
    ]) ?? null;
  const explicitActive = pickBooleanByPaths(entry, [
    ["active"],
    ["isActive"],
    ["is_active"],
    ["connected"],
    ["isConnected"],
    ["is_connected"],
    ["running"],
    ["isRunning"],
    ["is_running"]
  ]);
  const hasEndedAt = Boolean(
    pickStringByPaths(entry, [["endedAt"], ["ended_at"], ["finishedAt"], ["finished_at"], ["closedAt"], ["closed_at"]])
  );

  let isActive;
  if (typeof explicitActive === "boolean") {
    isActive = explicitActive;
  } else if (RUNNING_STATE_MARKERS.has(state)) {
    isActive = true;
  } else if (STOPPED_STATE_MARKERS.has(state) || hasEndedAt) {
    isActive = false;
  } else {
    isActive = true;
  }

  return {
    id,
    agent,
    workspace,
    state,
    updatedAt,
    isActive
  };
}

async function collectGatewaySnapshot({ openclawRoot, now }) {
  const collectedAt = now().toISOString();

  if (typeof openclawRoot !== "string" || openclawRoot.length === 0) {
    return {
      snapshot: {
        status: "not_configured",
        registryExists: false,
        activeAgentCount: 0,
        totalEntryCount: 0,
        agents: [],
        collectedAt
      }
    };
  }

  const canonicalRoot = await canonicalizePath(openclawRoot);
  if (!canonicalRoot) {
    return {
      snapshot: {
        status: "degraded",
        registryExists: false,
        activeAgentCount: 0,
        totalEntryCount: 0,
        agents: [],
        parseError: "openclaw root is invalid",
        collectedAt
      }
    };
  }

  const registryPath = path.join(canonicalRoot, OPENCLAW_SESSION_REGISTRY_PATH);
  let registryRaw;
  try {
    registryRaw = await readFile(registryPath, "utf8");
  } catch {
    return {
      snapshot: {
        status: "degraded",
        registryExists: false,
        activeAgentCount: 0,
        totalEntryCount: 0,
        agents: [],
        parseError: "session registry file is missing",
        collectedAt
      }
    };
  }

  let registryJson;
  try {
    registryJson = JSON.parse(registryRaw);
  } catch {
    return {
      snapshot: {
        status: "degraded",
        registryExists: true,
        activeAgentCount: 0,
        totalEntryCount: 0,
        agents: [],
        parseError: "session registry file is not valid JSON",
        collectedAt
      }
    };
  }

  const entries = extractRegistryEntries(registryJson);
  const normalizedEntries = entries.map((entry) => normalizeGatewayAgentEntry(entry));
  const activeAgents = normalizedEntries.filter((entry) => entry.isActive);
  const dedupedActiveAgents = [];
  const seen = new Set();
  for (const entry of activeAgents) {
    const dedupeKey = `${entry.id}::${entry.agent}::${entry.workspace}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    dedupedActiveAgents.push({
      id: entry.id,
      agent: entry.agent,
      workspace: entry.workspace,
      state: entry.state,
      updatedAt: entry.updatedAt
    });
  }

  return {
    snapshot: {
      status: dedupedActiveAgents.length > 0 ? "ok" : "idle",
      registryExists: true,
      activeAgentCount: dedupedActiveAgents.length,
      totalEntryCount: normalizedEntries.length,
      agents: dedupedActiveAgents,
      collectedAt
    }
  };
}

function normalizePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return path.normalize(value).replace(/[\\/]+$/, "");
}

async function canonicalizePath(inputPath) {
  const resolved = path.resolve(inputPath);

  try {
    return normalizePath(await realpath(resolved));
  } catch {
    return normalizePath(resolved);
  }
}

function isWithinRoot(candidatePath, rootPath) {
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${path.sep}`);
}

function toPortableRelativePath(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).split(path.sep).join("/");
}

async function scanDirectory(rootPath, { hotThreshold, hotFilesLimit }) {
  const files = [];
  const failureMarkers = [];

  async function visit(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      let details;
      try {
        details = await stat(entryPath);
      } catch {
        continue;
      }

      const relativePath = toPortableRelativePath(rootPath, entryPath);
      const modifiedAtMs = details.mtimeMs;

      if (WORKSPACE_FAILURE_MARKERS.has(entry.name)) {
        failureMarkers.push(relativePath);
      }

      files.push({
        relativePath,
        sizeBytes: details.size,
        modifiedAtMs
      });
    }
  }

  await visit(rootPath);

  const sortedByRecency = files
    .slice()
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs)
    .slice(0, hotFilesLimit)
    .map((entry) => ({
      path: entry.relativePath,
      sizeBytes: entry.sizeBytes,
      modifiedAt: new Date(entry.modifiedAtMs).toISOString()
    }));

  const hotFileCount = files.filter((entry) => entry.modifiedAtMs >= hotThreshold).length;
  const totalBytes = files.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  return {
    fileCount: files.length,
    totalBytes,
    hotFileCount,
    hotFiles: sortedByRecency,
    failureMarkers
  };
}

async function resolveWorkspaceRoots(workspaceRoots) {
  const roots = [];
  for (const rootPath of workspaceRoots) {
    const canonicalPath = await canonicalizePath(rootPath);
    if (!canonicalPath) {
      continue;
    }

    roots.push(canonicalPath);
  }

  return roots;
}

async function validateRequestedPath(requestedPath, allowlistedRoots) {
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    return null;
  }

  const candidatePath = await canonicalizePath(requestedPath);
  if (!candidatePath) {
    throw new HttpError(400, "PATH_NOT_ALLOWED", "Requested path is not allowlisted");
  }

  const allowed = allowlistedRoots.some((rootPath) => isWithinRoot(candidatePath, rootPath));
  if (!allowed) {
    throw new HttpError(400, "PATH_NOT_ALLOWED", "Requested path is not allowlisted");
  }

  return candidatePath;
}

async function collectWorkspaceSnapshot({
  workspaceRoots,
  requestedPath,
  now,
  hotWindowMinutes,
  hotFilesLimit
}) {
  const allowlistedRoots = await resolveWorkspaceRoots(workspaceRoots);
  const scopedPath = await validateRequestedPath(requestedPath, allowlistedRoots);
  const pathsToScan = scopedPath
    ? [scopedPath]
    : allowlistedRoots;
  const hotThreshold = now().getTime() - hotWindowMinutes * 60_000;

  const items = [];
  for (const rootPath of pathsToScan) {
    const metrics = await scanDirectory(rootPath, { hotThreshold, hotFilesLimit });
    items.push({
      workspace: path.basename(rootPath),
      ...metrics
    });
  }

  return {
    collectedAt: now().toISOString(),
    itemCount: items.length,
    items
  };
}

async function collectOpenclawSnapshot({ openclawRoot, now }) {
  if (typeof openclawRoot !== "string" || openclawRoot.length === 0) {
    return {
      snapshot: {
        status: "not_configured",
        exists: false,
        expectedFiles: OPENCLAW_EXPECTED_FILES.map((relativePath) => ({
          path: relativePath,
          exists: false
        })),
        collectedAt: now().toISOString()
      }
    };
  }

  const canonicalRoot = await canonicalizePath(openclawRoot);
  let directoryExists = false;
  if (canonicalRoot) {
    try {
      const rootStats = await stat(canonicalRoot);
      directoryExists = rootStats.isDirectory();
    } catch {
      directoryExists = false;
    }
  }
  const expectedFiles = [];

  for (const relativePath of OPENCLAW_EXPECTED_FILES) {
    const absolutePath = canonicalRoot ? path.join(canonicalRoot, relativePath) : relativePath;
    try {
      const fileStats = await stat(absolutePath);
      expectedFiles.push({ path: relativePath, exists: fileStats.isFile() });
    } catch {
      expectedFiles.push({ path: relativePath, exists: false });
    }
  }

  const missingCount = expectedFiles.filter((entry) => !entry.exists).length;
  return {
    snapshot: {
      status: directoryExists && missingCount === 0 ? "ok" : "degraded",
      exists: directoryExists,
      missingCount,
      expectedFiles,
      collectedAt: now().toISOString()
    }
  };
}

export function createMonitorProviders({
  workspaceRoots = [],
  openclawRoot = null,
  hotWindowMinutes = DEFAULT_HOT_WINDOW_MINUTES,
  hotFilesLimit = DEFAULT_HOT_FILES_LIMIT,
  now = () => new Date()
} = {}) {
  return {
    async workspaces(options = {}) {
      return collectWorkspaceSnapshot({
        workspaceRoots,
        requestedPath: options.path,
        now,
        hotWindowMinutes,
        hotFilesLimit
      });
    },
    async openclaw() {
      return collectOpenclawSnapshot({ openclawRoot, now });
    },
    async gateway() {
      return collectGatewaySnapshot({ openclawRoot, now });
    }
  };
}

export function createMonitorProvidersFromEnv(env = process.env) {
  const workspaceRoots = String(env.DAEMON_MONITOR_WORKSPACE_ROOTS ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return createMonitorProviders({
    workspaceRoots,
    openclawRoot: env.DAEMON_MONITOR_OPENCLAW_ROOT ?? null
  });
}
