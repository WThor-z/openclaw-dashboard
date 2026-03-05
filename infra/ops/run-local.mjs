const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4060;

function parsePort(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return null;
  }

  return parsed;
}

function resolveRunConfig(env = process.env) {
  const host = String(env.DAEMON_HOST ?? DEFAULT_HOST).trim() || DEFAULT_HOST;
  const port = parsePort(env.DAEMON_PORT ?? DEFAULT_PORT) ?? DEFAULT_PORT;

  return {
    host,
    port
  };
}

function run(checkOnly) {
  const config = resolveRunConfig();
  if (!config.host) {
    throw new Error("OPS_RUN_CONFIG_INVALID");
  }

  if (checkOnly) {
    console.log(`ops:run check pass (host=${config.host}, port=${config.port})`);
    return;
  }

  console.log("Local run plan:");
  console.log(`- Daemon: pnpm --filter @apps/daemon dev (bind ${config.host}:${config.port})`);
  console.log("- Web: pnpm --filter @apps/web dev --host 127.0.0.1 --port 4173");
}

try {
  const checkOnly = process.argv.includes("--check");
  run(checkOnly);
} catch (error) {
  console.error("ops:run failed", error);
  process.exit(1);
}
