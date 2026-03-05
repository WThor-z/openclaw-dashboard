import { isIP } from "node:net";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4060;

function normalizeHost(host) {
  return typeof host === "string" && host.trim() ? host.trim() : DEFAULT_HOST;
}

function isLoopbackHost(host) {
  const normalized = host.toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  if (normalized.startsWith("127.")) {
    return true;
  }

  if (normalized.startsWith("::ffff:127.")) {
    return true;
  }

  const ipVersion = isIP(normalized);
  return ipVersion === 4 ? normalized.startsWith("127.") : false;
}

function parsePort(rawPort) {
  const parsedPort = Number.parseInt(String(rawPort), 10);

  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
    return DEFAULT_PORT;
  }

  return parsedPort;
}

export function resolveBindConfig({
  host = process.env.DAEMON_HOST,
  port = process.env.DAEMON_PORT,
  allowPublicBind = process.env.ALLOW_PUBLIC_BIND === "1"
} = {}) {
  const resolvedHost = normalizeHost(host);
  if (!allowPublicBind && !isLoopbackHost(resolvedHost)) {
    throw new Error(
      `Refusing non-loopback bind host \"${resolvedHost}\". Set ALLOW_PUBLIC_BIND=1 to override.`
    );
  }

  return {
    host: resolvedHost,
    port: port === undefined ? DEFAULT_PORT : parsePort(port)
  };
}
