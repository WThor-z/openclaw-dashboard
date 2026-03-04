import { spawn } from "node:child_process";

const passthroughArgs = process.argv.slice(2);
const useWorkspaceFilter = passthroughArgs.includes("--filter");

function splitRecursiveArgs(args) {
  const recursiveArgs = ["-r", "--if-present"];
  const scriptArgs = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--filter" && args[i + 1]) {
      recursiveArgs.push("--filter", args[i + 1]);
      i += 1;
      continue;
    }
    scriptArgs.push(arg);
  }

  return { recursiveArgs, scriptArgs };
}

const command = useWorkspaceFilter
  ? (() => {
      const { recursiveArgs, scriptArgs } = splitRecursiveArgs(passthroughArgs);
      return [...recursiveArgs, "test", ...scriptArgs];
    })()
  : ["exec", "vitest", "run", ...passthroughArgs];

const child = spawn("pnpm", command, {
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
