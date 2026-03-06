import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SESSION_REGISTRY_RELATIVE_PATH = path.join("state", "session-registry.json");
const CONFIG_FILENAME_CANDIDATES = ["openclaw.json", "clawdbot.json", "moltbot.json", "moldbot.json"];
const STATE_DIRNAME_CANDIDATES = [".openclaw", ".clawdbot", ".moltbot", ".moldbot"];
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

function resolveHomeDirectory(env) {
  return (
    toNonEmptyString(env?.HOME) ??
    toNonEmptyString(env?.USERPROFILE) ??
    toNonEmptyString(os.homedir()) ??
    null
  );
}

function resolveUserPath(input, env) {
  const value = toNonEmptyString(input);
  if (!value) {
    return null;
  }

  if (value.startsWith("~")) {
    const homeDirectory = resolveHomeDirectory(env);
    if (!homeDirectory) {
      return path.resolve(value);
    }

    return path.resolve(value.replace(/^~(?=$|[\\/])/, homeDirectory));
  }

  return path.resolve(value);
}

function resolveTildePath(input, env) {
  const value = toNonEmptyString(input);
  if (!value) {
    return null;
  }

  if (!value.startsWith("~")) {
    return null;
  }

  const homeDirectory = resolveHomeDirectory(env);
  if (!homeDirectory) {
    return path.resolve(value);
  }

  return path.resolve(value.replace(/^~(?=$|[\\/])/, homeDirectory));
}

function uniquePaths(paths) {
  return [...new Set(paths.filter((entry) => typeof entry === "string" && entry.length > 0))];
}

async function pathExists(targetPath) {
  try {
    await readFile(targetPath, "utf8");
    return true;
  } catch {
    return false;
  }
}

export function resolveStateDirCandidates(env = process.env) {
  const explicitStateDir =
    resolveUserPath(env.OPENCLAW_STATE_DIR, env) ??
    resolveUserPath(env.CLAWDBOT_STATE_DIR, env) ??
    resolveUserPath(env.DAEMON_MONITOR_OPENCLAW_ROOT, env);

  if (explicitStateDir) {
    return uniquePaths([explicitStateDir]);
  }

  const homeDirectory = resolveHomeDirectory(env);
  if (!homeDirectory) {
    return [];
  }

  return uniquePaths(STATE_DIRNAME_CANDIDATES.map((dirname) => path.join(homeDirectory, dirname)));
}

export function resolveConfigCandidates(env = process.env) {
  const explicitConfigPath =
    resolveUserPath(env.OPENCLAW_CONFIG_PATH, env) ?? resolveUserPath(env.CLAWDBOT_CONFIG_PATH, env);
  if (explicitConfigPath) {
    return [explicitConfigPath];
  }

  const stateDirCandidates = resolveStateDirCandidates(env);
  const candidates = [];
  for (const stateDir of stateDirCandidates) {
    for (const filename of CONFIG_FILENAME_CANDIDATES) {
      candidates.push(path.join(stateDir, filename));
    }
  }

  return uniquePaths(candidates);
}

export async function resolvePreferredStateDir(env = process.env) {
  const explicitStateDir =
    resolveUserPath(env.OPENCLAW_STATE_DIR, env) ??
    resolveUserPath(env.CLAWDBOT_STATE_DIR, env) ??
    resolveUserPath(env.DAEMON_MONITOR_OPENCLAW_ROOT, env);
  if (explicitStateDir) {
    return explicitStateDir;
  }

  const stateDirCandidates = resolveStateDirCandidates(env);
  for (const stateDir of stateDirCandidates) {
    const registryPath = path.join(stateDir, SESSION_REGISTRY_RELATIVE_PATH);
    if (await pathExists(registryPath)) {
      return stateDir;
    }

    for (const configPath of CONFIG_FILENAME_CANDIDATES.map((filename) => path.join(stateDir, filename))) {
      if (await pathExists(configPath)) {
        return stateDir;
      }
    }
  }

  return stateDirCandidates[0] ?? null;
}

function stripJsonComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function stripTrailingCommas(input) {
  return input.replace(/,\s*([}\]])/g, "$1");
}

function parseConfigLikeJson(rawValue) {
  try {
    return JSON.parse(rawValue);
  } catch {
    return JSON.parse(stripTrailingCommas(stripJsonComments(rawValue)));
  }
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

function normalizeRegistryEntry(entry, stateDir = null) {
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
  const name = pickStringByPaths(entry, [["name"], ["identity", "name"]]);

  return {
    agent,
    name,
    stateDir,
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

function normalizeConfiguredAgentEntry(entry, defaults, stateDir = null) {
  const agent = pickStringByPaths(entry, [["id"], ["agent"], ["agentId"], ["name"]]);
  if (!agent) {
    return null;
  }

  const workspacePath =
    pickStringByPaths(entry, [["workspace"], ["workspacePath"], ["cwd"], ["workingDirectory"]]) ??
    pickStringByPaths(defaults, [["workspace"], ["workspacePath"], ["cwd"], ["workingDirectory"]]);

  return {
    agent,
    name: pickStringByPaths(entry, [["name"], ["identity", "name"]]) ?? agent,
    stateDir,
    workspacePath,
    status: "idle",
    updatedAt: null
  };
}

function normalizeLegacyRoutedAgentEntries(routingAgents, defaults, stateDir = null) {
  if (!isObjectRecord(routingAgents)) {
    return [];
  }

  return Object.entries(routingAgents)
    .map(([agentId, value]) => {
      if (!isObjectRecord(value)) {
        return null;
      }

      return normalizeConfiguredAgentEntry(
        {
          id: agentId,
          ...value
        },
        defaults,
        stateDir
      );
    })
    .filter((entry) => entry !== null);
}

async function loadConfiguredAgentEntries({ env = process.env } = {}) {
  const configCandidates = resolveConfigCandidates(env);

  for (const configPath of configCandidates) {
    let rawConfig;
    try {
      rawConfig = await readFile(configPath, "utf8");
    } catch {
      continue;
    }

    let configJson;
    try {
      configJson = parseConfigLikeJson(rawConfig);
    } catch {
      continue;
    }

    const defaults = isObjectRecord(configJson?.agents?.defaults) ? configJson.agents.defaults : null;
    const configuredList = Array.isArray(configJson?.agents?.list) ? configJson.agents.list : [];
    const stateDir = path.dirname(configPath);
    const normalizedAgents = configuredList
      .map((entry) => normalizeConfiguredAgentEntry(entry, defaults, stateDir))
      .filter((entry) => entry !== null);

    const legacyRoutedAgents = normalizeLegacyRoutedAgentEntries(configJson?.routing?.agents, defaults, stateDir);
    const discoveredAgents = normalizedAgents.length > 0 ? normalizedAgents : legacyRoutedAgents;

    if (discoveredAgents.length > 0) {
      return discoveredAgents;
    }

    const defaultWorkspace = pickStringByPaths(defaults, [
      ["workspace"],
      ["workspacePath"],
      ["cwd"],
      ["workingDirectory"]
    ]);
    if (defaultWorkspace) {
      return [
        {
          agent: "main",
          name: "main",
          stateDir,
          workspacePath: defaultWorkspace,
          status: "idle",
          updatedAt: null
        }
      ];
    }
  }

  return [];
}

export async function loadLatestSessionRegistryEntries({ env = process.env } = {}) {
  const stateDirCandidates = resolveStateDirCandidates(env);

  for (const stateDir of stateDirCandidates) {
    const registryPath = path.join(stateDir, SESSION_REGISTRY_RELATIVE_PATH);

    let rawRegistry;
    try {
      rawRegistry = await readFile(registryPath, "utf8");
    } catch {
      continue;
    }

    let registryJson;
    try {
      registryJson = JSON.parse(rawRegistry);
    } catch {
      continue;
    }

    const normalizedEntries = extractRegistryEntries(registryJson)
      .map((entry) => normalizeRegistryEntry(entry, stateDir))
      .filter((entry) => entry !== null);
    const latestByAgent = new Map();

    for (const entry of normalizedEntries) {
      const current = latestByAgent.get(entry.agent);
      if (!current || compareUpdatedAt(entry.updatedAt, current.updatedAt) > 0) {
        latestByAgent.set(entry.agent, entry);
      }
    }

    const latestEntries = [...latestByAgent.values()];
    if (latestEntries.length > 0) {
      return latestEntries;
    }
  }

  return loadConfiguredAgentEntries({ env });
}

export function resolveRegistryWorkspacePath(entry, { env = process.env } = {}) {
  const workspacePath = toNonEmptyString(entry?.workspacePath);
  if (!workspacePath) {
    return null;
  }

  if (path.isAbsolute(workspacePath)) {
    return path.resolve(workspacePath);
  }

  const tildeWorkspacePath = resolveTildePath(workspacePath, env);
  if (tildeWorkspacePath) {
    return tildeWorkspacePath;
  }

  const stateDir = toNonEmptyString(entry?.stateDir) ?? resolveStateDirCandidates(env)[0] ?? null;
  if (!stateDir) {
    return null;
  }

  return path.resolve(stateDir, workspacePath);
}
