import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

const checks = [
  path.resolve(currentDirPath, "..", "..", "tools", "ops", "run-local.mjs"),
  path.resolve(currentDirPath, "..", "..", "tools", "ops", "backup-export.mjs"),
  path.resolve(currentDirPath, "..", "..", "tools", "ops", "retention-cleanup.mjs")
];

try {
  for (const checkPath of checks) {
    execFileSync(process.execPath, [checkPath, "--check"], {
      stdio: "inherit"
    });
  }

  console.log("verify:ops pass");
  console.log("release-gate:pass");
} catch (error) {
  console.error("verify:ops failed", error);
  process.exit(1);
}
