import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BACKUP_DIR = path.join("backups");
const DEFAULT_MAX_AGE_DAYS = 14;

function resolveMaxAgeDays() {
  const index = process.argv.findIndex((entry) => entry === "--max-age-days");
  if (index === -1) {
    return DEFAULT_MAX_AGE_DAYS;
  }

  const rawValue = process.argv[index + 1];
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("OPS_RETENTION_INVALID_MAX_AGE_DAYS");
  }

  return parsed;
}

async function run(checkOnly) {
  const backupDir = path.resolve(String(process.env.OPS_BACKUP_DIR ?? DEFAULT_BACKUP_DIR));
  const maxAgeDays = resolveMaxAgeDays();

  if (checkOnly) {
    console.log(`ops:retention check pass (backupDir=${backupDir}, maxAgeDays=${maxAgeDays})`);
    return;
  }

  let entries = [];
  try {
    entries = await readdir(backupDir);
  } catch {
    console.log(`ops:retention skipped (missing directory ${backupDir})`);
    return;
  }

  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let removedCount = 0;

  for (const entry of entries) {
    if (!entry.startsWith("backup-manifest-") || !entry.endsWith(".json")) {
      continue;
    }

    const absolutePath = path.join(backupDir, entry);
    let details;
    try {
      details = await stat(absolutePath);
    } catch {
      continue;
    }

    if (details.mtimeMs >= cutoffMs) {
      continue;
    }

    await rm(absolutePath, { force: true });
    removedCount += 1;
  }

  console.log(`ops:retention removed ${removedCount} expired backup manifests`);
}

run(process.argv.includes("--check")).catch((error) => {
  console.error("ops:retention failed", error);
  process.exit(1);
});
