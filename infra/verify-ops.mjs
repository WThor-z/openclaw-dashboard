import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

const checks = [
  path.join(currentDirPath, "ops", "run-local.mjs"),
  path.join(currentDirPath, "ops", "backup-export.mjs"),
  path.join(currentDirPath, "ops", "retention-cleanup.mjs")
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
