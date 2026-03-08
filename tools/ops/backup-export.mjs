import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BACKUP_DIR = path.join("backups");
const DEFAULT_SOURCES = ["data", ".openclaw"];

async function exists(entryPath) {
  try {
    await stat(entryPath);
    return true;
  } catch {
    return false;
  }
}

function resolveConfig(env = process.env) {
  const backupDir = String(env.OPS_BACKUP_DIR ?? DEFAULT_BACKUP_DIR).trim() || DEFAULT_BACKUP_DIR;
  const sourceList = String(env.OPS_BACKUP_SOURCES ?? DEFAULT_SOURCES.join(path.delimiter))
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return {
    backupDir,
    sourceList
  };
}

async function run(checkOnly) {
  const config = resolveConfig();
  if (!config.backupDir) {
    throw new Error("OPS_BACKUP_CONFIG_INVALID");
  }

  if (checkOnly) {
    console.log(`ops:backup check pass (backupDir=${config.backupDir})`);
    return;
  }

  const createdAt = new Date();
  const outputDir = path.resolve(config.backupDir);
  await mkdir(outputDir, { recursive: true });

  const sources = await Promise.all(
    config.sourceList.map(async (entry) => {
      const absolutePath = path.resolve(entry);
      return {
        path: absolutePath,
        exists: await exists(absolutePath)
      };
    })
  );

  const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `backup-manifest-${timestamp}.json`);
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        createdAt: createdAt.toISOString(),
        sourceCount: sources.length,
        sources
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`ops:backup manifest written ${outputPath}`);
}

run(process.argv.includes("--check")).catch((error) => {
  console.error("ops:backup failed", error);
  process.exit(1);
});
