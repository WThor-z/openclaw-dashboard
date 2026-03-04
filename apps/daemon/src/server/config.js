const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4060;

function parsePort(rawPort) {
  const parsedPort = Number.parseInt(String(rawPort), 10);

  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
    return DEFAULT_PORT;
  }

  return parsedPort;
}

export function resolveBindConfig({
  host = process.env.DAEMON_HOST,
  port = process.env.DAEMON_PORT
} = {}) {
  return {
    host: typeof host === "string" && host.trim() ? host : DEFAULT_HOST,
    port: port === undefined ? DEFAULT_PORT : parsePort(port)
  };
}
