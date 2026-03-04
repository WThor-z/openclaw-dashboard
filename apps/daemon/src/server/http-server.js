import { createServer } from "node:http";

import { assertAuthorizedControlRequest } from "../middleware/auth-gate.js";
import { HttpError, sendError, sendJson } from "../middleware/error-handler.js";
import { attachRequestId } from "../middleware/request-id.js";
import { resolveBindConfig } from "./config.js";

function parsePathname(req) {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  return requestUrl.pathname;
}

function isControlRoute(pathname) {
  return pathname.startsWith("/api/control/");
}

function requestHandlerFactory({ adminToken, logger }) {
  return async function handleRequest(req, res) {
    const requestId = attachRequestId(req, res);
    const pathname = parsePathname(req);
    const startedAt = Date.now();

    res.on("finish", () => {
      logger.info(
        `[${requestId}] ${req.method ?? "UNKNOWN"} ${pathname} ${res.statusCode} ${Date.now() - startedAt}ms`
      );
    });

    try {
      if (isControlRoute(pathname)) {
        assertAuthorizedControlRequest(req, adminToken);
      }

      if (req.method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && pathname === "/api/status") {
        sendJson(res, 200, {
          ok: true,
          connection: "local",
          status: "idle"
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/control/ping") {
        sendJson(res, 200, { ok: true });
        return;
      }

      throw new HttpError(404, "NOT_FOUND", "Route not found");
    } catch (error) {
      sendError(res, error, requestId);
    }
  };
}

export function createDaemonServer({
  host,
  port,
  adminToken = process.env.DASHBOARD_ADMIN_TOKEN,
  logger = console
} = {}) {
  const bindConfig = resolveBindConfig({ host, port });
  const server = createServer(requestHandlerFactory({ adminToken, logger }));

  return {
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(bindConfig.port, bindConfig.host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    stop() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    address() {
      const value = server.address();

      if (!value || typeof value === "string") {
        return null;
      }

      return value;
    },
    bindConfig
  };
}

export { resolveBindConfig };
