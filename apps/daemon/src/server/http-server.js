import { createServer } from "node:http";

import { createControlApiRouter } from "../api/control/index.js";
import { createReadApiRouter } from "../api/read/index.js";
import {
  assertAuthorizedControlRequest,
  assertAuthorizedReadRequest
} from "../middleware/auth-gate.js";
import { HttpError, sendError, sendJson } from "../middleware/error-handler.js";
import { createMonitorProvidersFromEnv } from "../monitoring/collectors.js";
import { attachRequestId } from "../middleware/request-id.js";
import { resolveBindConfig } from "./config.js";
import { createWebhookOutboxWorker } from "../webhooks/outbox-worker.js";
import { resolveWebhookEndpointPolicy } from "../webhooks/endpoint-policy.js";

function parseRequestUrl(req) {
  return new URL(req.url ?? "/", "http://localhost");
}

function isControlRoute(pathname) {
  return pathname.startsWith("/api/control/");
}

function isReadApiRoute(pathname) {
  return pathname.startsWith("/api/") && !isControlRoute(pathname);
}

function requestHandlerFactory({
  adminToken,
  logger,
  repositories,
  statusProvider,
  monitorProviders,
  readOnlyMode,
  writeArmWindowMs,
  readAuthEnabled,
  webhookEndpointPolicy
}) {
  const readRouter = createReadApiRouter({
    repositories,
    statusProvider,
    monitorProviders
  });
  const controlRouter = createControlApiRouter({
    repositories,
    readOnlyMode,
    writeArmWindowMs,
    webhookEndpointPolicy
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
      if (req.method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && pathname === "/api/auth/check") {
        if (!readAuthEnabled) {
          sendJson(res, 200, { ok: true, authorized: true, authRequired: false });
          return;
        }

        assertAuthorizedReadRequest(req, adminToken);
        sendJson(res, 200, { ok: true, authorized: true, authRequired: true });
        return;
      }

      if (isControlRoute(pathname)) {
        assertAuthorizedControlRequest(req, adminToken);
      }

      if (readAuthEnabled && isReadApiRoute(pathname)) {
        assertAuthorizedReadRequest(req, adminToken);
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
  readAuthEnabled = process.env.DAEMON_READ_AUTH_ENABLED !== "0",
  readOnlyMode = process.env.DAEMON_READ_ONLY_SAFETY_MODE === "1",
  writeArmWindowMs = Number.parseInt(process.env.DAEMON_CONTROL_ARM_WINDOW_MS ?? "", 10),
  logger = console,
  repositories,
  statusProvider,
  monitorProviders = createMonitorProvidersFromEnv(),
  webhookEndpointPolicy = resolveWebhookEndpointPolicy(),
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
        writeArmWindowMs,
        readAuthEnabled,
        webhookEndpointPolicy
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
        endpointPolicy: webhookEndpointPolicy,
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
