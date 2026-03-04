import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { HttpError } from "../middleware/error-handler.js";

const WORKSPACE_FAILURE_MARKERS = new Set(["error.log", "crash.log", "errors.json"]);
const OPENCLAW_EXPECTED_FILES = ["errors.json", path.join("state", "session-registry.json")];
const DEFAULT_HOT_WINDOW_MINUTES = 30;
const DEFAULT_HOT_FILES_LIMIT = 5;

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
