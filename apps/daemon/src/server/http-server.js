import { createServer } from "node:http";

import { createControlApiRouter } from "../api/control/index.js";
import { createReadApiRouter } from "../api/read/index.js";
import { assertAuthorizedControlRequest } from "../middleware/auth-gate.js";
import { HttpError, sendError, sendJson } from "../middleware/error-handler.js";
import { createMonitorProvidersFromEnv } from "../monitoring/collectors.js";
import { attachRequestId } from "../middleware/request-id.js";
import { resolveBindConfig } from "./config.js";
import { createWebhookOutboxWorker } from "../webhooks/outbox-worker.js";

function parseRequestUrl(req) {
  return new URL(req.url ?? "/", "http://localhost");
}

function isControlRoute(pathname) {
  return pathname.startsWith("/api/control/");
}

function requestHandlerFactory({
  adminToken,
  logger,
  repositories,
  statusProvider,
  monitorProviders,
  readOnlyMode,
  writeArmWindowMs
}) {
  const readRouter = createReadApiRouter({
    repositories,
    statusProvider,
    monitorProviders
  });
  const controlRouter = createControlApiRouter({
    repositories,
    readOnlyMode,
    writeArmWindowMs
  });

  return async function handleRequest(req, res) {
    const requestId = attachRequestId(req, res);
    const requestUrl = parseRequestUrl(req);
    const pathname = requestUrl.pathname;
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

      if (await readRouter.handle(req, res, requestUrl)) {
        return;
      }

      if (await controlRouter.handle(req, res, requestUrl)) {
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
  readOnlyMode = process.env.DAEMON_READ_ONLY_SAFETY_MODE === "1",
  writeArmWindowMs = Number.parseInt(process.env.DAEMON_CONTROL_ARM_WINDOW_MS ?? "", 10),
  logger = console,
  repositories,
  statusProvider,
  monitorProviders = createMonitorProvidersFromEnv(),
  webhookWorker,
  webhookWorkerOptions = {}
} = {}) {
  const bindConfig = resolveBindConfig({ host, port });
  const server = createServer(
    requestHandlerFactory({
      adminToken,
      logger,
      repositories,
      statusProvider,
      monitorProviders,
      readOnlyMode,
      writeArmWindowMs
    })
  );

  const worker =
    webhookWorker ??
    (repositories?.webhookDeliveries && repositories?.webhooks
      ? createWebhookOutboxWorker({
        repositories,
        resolveSecretRef(secretRef) {
          if (typeof secretRef !== "string" || secretRef.length === 0) {
            return null;
          }

          return process.env[secretRef] ?? null;
        },
        logger,
        ...webhookWorkerOptions
      })
      : null);

  return {
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(bindConfig.port, bindConfig.host, () => {
          server.off("error", reject);
          Promise.resolve(worker?.start?.())
            .then(() => {
              resolve();
            })
            .catch(reject);
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

          Promise.resolve(worker?.stop?.())
            .then(() => {
              resolve();
            })
            .catch(reject);
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
