import { randomUUID } from "node:crypto";

import { HttpError, sendJson } from "../../middleware/error-handler.js";
import { createMonitorProvidersFromEnv } from "../../monitoring/collectors.js";
import { redactSecrets } from "../read/redaction.js";
import { writeAgentFile } from "./agents.js";
import {
  normalizeAndValidateWebhookEndpoint,
  WebhookEndpointPolicyError
} from "../../webhooks/endpoint-policy.js";

const DEFAULT_ARM_WINDOW_MS = 30000;
const MAX_BODY_SIZE_BYTES = 1024 * 1024;

const WRITE_NOT_ARMED = "WRITE_NOT_ARMED";
const READ_ONLY_MODE_CODE = "READ_ONLY_SAFETY_MODE";

function isObjectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseBoolean(value, defaultValue = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return defaultValue;
}

function parseIdempotencyKey(req) {
  const rawValue = req.headers["idempotency-key"];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "idempotency-key header is required");
  }

  return value.trim();
}

function parseJsonOrNull(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseSnapshot(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return { version: 0, config: {} };
  }

  const latest = snapshots[0];
  const parsed = parseJsonOrNull(latest.snapshotJson);
  return {
    version: snapshots.length,
    config: isObjectRecord(parsed) ? parsed : {}
  };
}

function buildDiffEntries(baseConfig, nextConfig, parentPath = "") {
  const entries = [];
  const keys = new Set([...Object.keys(baseConfig), ...Object.keys(nextConfig)]);

  for (const key of [...keys].sort()) {
    const path = parentPath.length > 0 ? `${parentPath}.${key}` : key;
    const before = baseConfig[key];
    const after = nextConfig[key];

    if (isObjectRecord(before) && isObjectRecord(after)) {
      entries.push(...buildDiffEntries(before, after, path));
      continue;
    }

    if (Array.isArray(before) && Array.isArray(after)) {
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        entries.push({ path, before, after });
      }
      continue;
    }

    if (before !== after) {
      entries.push({ path, before, after });
    }
  }

  return entries;
}

async function parseRequestBody(req) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const value = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += value.length;
    if (totalBytes > MAX_BODY_SIZE_BYTES) {
      throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request payload exceeds limit");
    }
    chunks.push(value);
  }

  if (chunks.length === 0) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  if (!isObjectRecord(parsed)) {
    throw new HttpError(400, "INVALID_BODY", "Request body must be a JSON object");
  }

  return parsed;
}

function replayIfMatched(repositories, dedupeKey) {
  if (!repositories?.events?.getByDedupeKey) {
    return null;
  }

  const record = repositories.events.getByDedupeKey(dedupeKey);
  if (!record) {
    return null;
  }

  const payload = parseJsonOrNull(record.payloadJson);
  if (!isObjectRecord(payload) || !isObjectRecord(payload.response)) {
    return null;
  }

  const status = parseNumber(payload.response.status);
  const body = payload.response.body;
  if (!status || !isObjectRecord(body)) {
    return null;
  }

  return { status, body };
}

function persistAuditEvent({ repositories, dedupeKey, workspaceId, taskId, kind, payload }) {
  if (!repositories?.events?.insertIfNotExists) {
    return true;
  }

  return repositories.events.insertIfNotExists({
    id: randomUUID(),
    source: "daemon",
    sessionId: null,
    taskId: taskId ?? null,
    workspaceId,
    level: "info",
    kind,
    payloadJson: JSON.stringify(redactSecrets(payload)),
    createdAt: new Date().toISOString(),
    dedupeKey
  });
}

export function createControlApiRouter({
  repositories,
  monitorProviders = createMonitorProvidersFromEnv(),
  readOnlyMode = false,
  writeArmWindowMs = DEFAULT_ARM_WINDOW_MS,
  webhookEndpointPolicy = {}
} = {}) {
  const mutationLocks = new Map();
  const armingState = {
    armedUntil: 0,
    windowMs:
      Number.isInteger(writeArmWindowMs) && writeArmWindowMs > 0
        ? writeArmWindowMs
        : DEFAULT_ARM_WINDOW_MS
  };

  function assertWriteAllowed(pathname) {
    if (readOnlyMode && pathname.startsWith("/api/control/")) {
      throw new HttpError(423, READ_ONLY_MODE_CODE, "Daemon is running in read-only safety mode");
    }

    if (pathname === "/api/control/arm") {
      return;
    }

    if (Date.now() >= armingState.armedUntil) {
      throw new HttpError(423, WRITE_NOT_ARMED, "Write controls must be armed before mutating");
    }
  }

  async function handleMutation(req, res, pathname, routeKey, mutationHandler) {
    assertWriteAllowed(pathname);
    const idempotencyKey = parseIdempotencyKey(req);
    const dedupeKey = `${routeKey}:${idempotencyKey}`;

    const replay = replayIfMatched(repositories, dedupeKey);
    if (replay) {
      sendJson(res, replay.status, replay.body);
      return;
    }

    if (mutationLocks.has(dedupeKey)) {
      await mutationLocks.get(dedupeKey);
      const replayed = replayIfMatched(repositories, dedupeKey);
      if (replayed) {
        sendJson(res, replayed.status, replayed.body);
        return;
      }
    }

    let releaseLock = () => {};
    const lockPromise = new Promise((resolve) => {
      releaseLock = resolve;
    });
    mutationLocks.set(dedupeKey, lockPromise);

    try {
      const body = await parseRequestBody(req);
      const mutation = await mutationHandler(body);

      const persisted = persistAuditEvent({
        repositories,
        dedupeKey,
        workspaceId: mutation.workspaceId,
        taskId: mutation.taskId,
        kind: mutation.kind,
        payload: {
          request: redactSecrets(body),
          response: {
            status: mutation.status,
            body: mutation.body
          }
        }
      });

      if (!persisted) {
        const replayed = replayIfMatched(repositories, dedupeKey);
        if (replayed) {
          sendJson(res, replayed.status, replayed.body);
          return;
        }
      }

      sendJson(res, mutation.status, mutation.body);
    } finally {
      mutationLocks.delete(dedupeKey);
      releaseLock();
    }
  }

  function resolveTaskCancelSuffix(pathname) {
    if (!pathname.startsWith("/api/control/tasks/")) {
      return null;
    }

    const suffix = pathname.slice("/api/control/tasks/".length);
    if (!suffix.endsWith("/cancel")) {
      return null;
    }

    const taskId = suffix.slice(0, -"/cancel".length);
    if (!taskId) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    return decodeURIComponent(taskId);
  }

  function resolveApprovalSuffix(pathname) {
    if (!pathname.startsWith("/api/control/approvals/")) {
      return null;
    }

    const suffix = pathname.slice("/api/control/approvals/".length);
    if (!suffix.endsWith("/resolve")) {
      return null;
    }

    const approvalId = suffix.slice(0, -"/resolve".length);
    if (!approvalId) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    return decodeURIComponent(approvalId);
  }

  function resolveWebhookSuffix(pathname) {
    const prefix = "/api/control/webhooks/";
    if (!pathname.startsWith(prefix)) {
      return null;
    }

    const suffix = pathname.slice(prefix.length);
    if (!suffix) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    if (suffix === "create") {
      return { action: "create", webhookId: null };
    }

    const segments = suffix.split("/");
    if (segments.length === 2 && segments[0].length > 0) {
      if (segments[1] === "update") {
        return { action: "update", webhookId: decodeURIComponent(segments[0]) };
      }
      if (segments[1] === "disable") {
        return { action: "disable", webhookId: decodeURIComponent(segments[0]) };
      }
      if (segments[1] === "enqueue") {
        return { action: "enqueue", webhookId: decodeURIComponent(segments[0]) };
      }
    }

    throw new HttpError(404, "NOT_FOUND", "Route not found");
  }

  function decodePathOrThrow(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
    }
  }

  function resolveAgentFileWriteRoute(pathname) {
    const prefix = "/api/control/agents/";
    if (!pathname.startsWith(prefix)) {
      return null;
    }

    const suffix = pathname.slice(prefix.length);
    if (!suffix) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    const firstSlash = suffix.indexOf("/");
    if (firstSlash <= 0) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    const encodedAgentId = suffix.slice(0, firstSlash);
    const remainder = suffix.slice(firstSlash + 1);

    if (!remainder.startsWith("files/")) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    const encodedFilePath = remainder.slice("files/".length);
    if (!encodedFilePath) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    const agentId = decodePathOrThrow(encodedAgentId);
    if (!agentId) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    return {
      agentId,
      filePath: decodePathOrThrow(encodedFilePath)
    };
  }

  async function normalizeEndpointOrThrow(endpointUrl) {
    try {
      return await normalizeAndValidateWebhookEndpoint(endpointUrl, webhookEndpointPolicy);
    } catch (error) {
      if (error instanceof WebhookEndpointPolicyError) {
        throw new HttpError(400, error.code, error.message);
      }

      throw error;
    }
  }

  return {
    async handle(req, res, requestUrl) {
      if (req.method !== "POST") {
        return false;
      }

      const pathname = requestUrl.pathname;
      if (!pathname.startsWith("/api/control/")) {
        return false;
      }

      if (pathname === "/api/control/arm") {
        assertWriteAllowed(pathname);
        armingState.armedUntil = Date.now() + armingState.windowMs;
        sendJson(res, 200, {
          ok: true,
          armed: true,
          armWindowMs: armingState.windowMs,
          armedUntil: new Date(armingState.armedUntil).toISOString()
        });
        return true;
      }

      if (pathname === "/api/control/ping") {
        await handleMutation(req, res, pathname, "control.ping", async () => ({
          status: 200,
          body: { ok: true, armed: true },
          workspaceId: "global",
          kind: "control.ping"
        }));
        return true;
      }

      if (pathname === "/api/control/tasks/enqueue") {
        await handleMutation(req, res, pathname, "control.tasks.enqueue", async (body) => {
          const now = new Date().toISOString();
          const taskId = typeof body.taskId === "string" && body.taskId.trim().length > 0
            ? body.taskId.trim()
            : randomUUID();
          const workspaceId =
            typeof body.workspaceId === "string" && body.workspaceId.trim().length > 0
              ? body.workspaceId.trim()
              : "global";

          if (repositories?.tasks?.insert) {
            repositories.tasks.insert({
              id: taskId,
              sessionId: null,
              workspaceId,
              state: "queued",
              summary: typeof body.summary === "string" ? body.summary : null,
              createdAt: now,
              updatedAt: now
            });
          }

          return {
            status: 200,
            body: { ok: true, taskId, state: "queued" },
            workspaceId,
            taskId,
            kind: "control.tasks.enqueue"
          };
        });
        return true;
      }

      const taskId = resolveTaskCancelSuffix(pathname);
      if (taskId !== null) {
        await handleMutation(req, res, pathname, `control.tasks.cancel:${taskId}`, async (body) => {
          const now = new Date().toISOString();
          const workspaceId =
            typeof body.workspaceId === "string" && body.workspaceId.trim().length > 0
              ? body.workspaceId.trim()
              : "global";
          if (repositories?.tasks?.updateState) {
            const found = repositories.tasks.updateState({
              id: taskId,
              state: "cancelled",
              updatedAt: now
            });
            if (!found) {
              throw new HttpError(404, "TASK_NOT_FOUND", "Task not found");
            }
          }

          return {
            status: 200,
            body: { ok: true, taskId, state: "cancelled" },
            workspaceId,
            taskId,
            kind: "control.tasks.cancel"
          };
        });
        return true;
      }

      const approvalId = resolveApprovalSuffix(pathname);
      if (approvalId !== null) {
        await handleMutation(req, res, pathname, `control.approvals.resolve:${approvalId}`, async (body) => {
          const decision = body.decision === "reject" ? "reject" : "approve";
          const workspaceId =
            typeof body.workspaceId === "string" && body.workspaceId.trim().length > 0
              ? body.workspaceId.trim()
              : "global";

          return {
            status: 200,
            body: { ok: true, approvalId, decision, resolved: true },
            workspaceId,
            kind: "control.approvals.resolve"
          };
        });
        return true;
      }

      const webhookRoute = resolveWebhookSuffix(pathname);
      if (webhookRoute !== null) {
        const now = new Date().toISOString();

        if (webhookRoute.action === "create") {
          await handleMutation(req, res, pathname, "control.webhooks.create", async (body) => {
            const workspaceId =
              typeof body.workspaceId === "string" && body.workspaceId.trim().length > 0
                ? body.workspaceId.trim()
                : "global";
            if (typeof body.endpointUrl !== "string" || body.endpointUrl.trim().length === 0) {
              throw new HttpError(400, "ENDPOINT_URL_REQUIRED", "endpointUrl is required");
            }
            if (typeof body.secretRef !== "string" || body.secretRef.trim().length === 0) {
              throw new HttpError(400, "SECRET_REF_REQUIRED", "secretRef is required");
            }

            const endpointUrl = await normalizeEndpointOrThrow(body.endpointUrl.trim());

            const webhookId =
              typeof body.webhookId === "string" && body.webhookId.trim().length > 0
                ? body.webhookId.trim()
                : randomUUID();
            const enabled = parseBoolean(body.enabled, true) ? 1 : 0;

            if (repositories?.webhooks?.insert) {
              repositories.webhooks.insert({
                id: webhookId,
                workspaceId,
                endpointUrl,
                secretRef: body.secretRef.trim(),
                enabled,
                createdAt: now,
                updatedAt: now,
                breakerState: "closed",
                consecutiveFailures: 0,
                breakerNextAttemptAt: null
              });
            }

            return {
              status: 200,
              body: { ok: true, webhookId, enabled: enabled === 1 },
              workspaceId,
              kind: "control.webhooks.create"
            };
          });
          return true;
        }

        if (webhookRoute.action === "update") {
          await handleMutation(
            req,
            res,
            pathname,
            `control.webhooks.update:${webhookRoute.webhookId}`,
            async (body) => {
              const webhook = repositories?.webhooks?.getById
                ? repositories.webhooks.getById(webhookRoute.webhookId)
                : null;
              if (!webhook) {
                throw new HttpError(404, "WEBHOOK_NOT_FOUND", "Webhook not found");
              }

              const endpointUrl =
                typeof body.endpointUrl === "string" && body.endpointUrl.trim().length > 0
                  ? body.endpointUrl.trim()
                  : webhook.endpointUrl;
              const normalizedEndpointUrl = await normalizeEndpointOrThrow(endpointUrl);
              const secretRef =
                typeof body.secretRef === "string" && body.secretRef.trim().length > 0
                  ? body.secretRef.trim()
                  : webhook.secretRef;
              const enabled = parseBoolean(body.enabled, webhook.enabled === 1) ? 1 : 0;

              const updated = repositories?.webhooks?.update
                ? repositories.webhooks.update({
                  id: webhookRoute.webhookId,
                  endpointUrl: normalizedEndpointUrl,
                  secretRef,
                  enabled,
                  updatedAt: now
                })
                : false;
              if (!updated) {
                throw new HttpError(404, "WEBHOOK_NOT_FOUND", "Webhook not found");
              }

              return {
                status: 200,
                body: {
                  ok: true,
                  webhookId: webhookRoute.webhookId,
                  enabled: enabled === 1
                },
                workspaceId: webhook.workspaceId,
                kind: "control.webhooks.update"
              };
            }
          );
          return true;
        }

        if (webhookRoute.action === "disable") {
          await handleMutation(
            req,
            res,
            pathname,
            `control.webhooks.disable:${webhookRoute.webhookId}`,
            async () => {
              const webhook = repositories?.webhooks?.getById
                ? repositories.webhooks.getById(webhookRoute.webhookId)
                : null;
              if (!webhook) {
                throw new HttpError(404, "WEBHOOK_NOT_FOUND", "Webhook not found");
              }

              const disabled = repositories?.webhooks?.disable
                ? repositories.webhooks.disable({ id: webhookRoute.webhookId, updatedAt: now })
                : false;
              if (!disabled) {
                throw new HttpError(404, "WEBHOOK_NOT_FOUND", "Webhook not found");
              }

              return {
                status: 200,
                body: { ok: true, webhookId: webhookRoute.webhookId, enabled: false },
                workspaceId: webhook.workspaceId,
                kind: "control.webhooks.disable"
              };
            }
          );
          return true;
        }

        if (webhookRoute.action === "enqueue") {
          await handleMutation(
            req,
            res,
            pathname,
            `control.webhooks.enqueue:${webhookRoute.webhookId}`,
            async (body) => {
              const webhook = repositories?.webhooks?.getById
                ? repositories.webhooks.getById(webhookRoute.webhookId)
                : null;
              if (!webhook) {
                throw new HttpError(404, "WEBHOOK_NOT_FOUND", "Webhook not found");
              }

              const payload = isObjectRecord(body.payload) ? body.payload : {};
              const deliveryId = randomUUID();
              if (repositories?.webhookDeliveries?.enqueue) {
                repositories.webhookDeliveries.enqueue({
                  id: deliveryId,
                  webhookId: webhookRoute.webhookId,
                  eventId: null,
                  payloadJson: JSON.stringify(payload),
                  status: "pending",
                  attemptCount: 0,
                  maxAttempts: parseNumber(body.maxAttempts) ?? 5,
                  responseCode: null,
                  attemptedAt: now,
                  nextAttemptAt: now,
                  lastError: null,
                  createdAt: now,
                  updatedAt: now
                });
              }

              return {
                status: 200,
                body: {
                  ok: true,
                  webhookId: webhookRoute.webhookId,
                  deliveryId,
                  status: "pending"
                },
                workspaceId: webhook.workspaceId,
                kind: "control.webhooks.enqueue"
              };
            }
          );
          return true;
        }
      }

      const agentFileRoute = resolveAgentFileWriteRoute(pathname);
      if (agentFileRoute !== null) {
        await handleMutation(
          req,
          res,
          pathname,
          `control.agents.files.write:${agentFileRoute.agentId}:${agentFileRoute.filePath}`,
          async (body) => {
            const result = await writeAgentFile({
              body,
              monitorProviders,
              agentId: agentFileRoute.agentId,
              requestedPath: agentFileRoute.filePath
            });

            return {
              status: 200,
              body: {
                ok: true,
                path: result.path,
                modifiedAt: result.modifiedAt
              },
              workspaceId: result.workspaceId,
              kind: "control.agents.files.write"
            };
          }
        );
        return true;
      }

      if (pathname === "/api/control/config/diff") {
        await handleMutation(req, res, pathname, "control.config.diff", async (body) => {
          const workspaceId =
            typeof body.workspaceId === "string" && body.workspaceId.trim().length > 0
              ? body.workspaceId.trim()
              : "global";
          const proposedConfig = isObjectRecord(body.config) ? body.config : {};

          const snapshots = repositories?.configSnapshots?.listByWorkspace
            ? repositories.configSnapshots.listByWorkspace(workspaceId)
            : [];
          const current = parseSnapshot(snapshots);
          const redactedCurrent = redactSecrets(current.config);
          const redactedProposed = redactSecrets(proposedConfig);

          return {
            status: 200,
            body: {
              ok: true,
              workspaceId,
              baseVersion: current.version,
              diff: buildDiffEntries(redactedCurrent, redactedProposed)
            },
            workspaceId,
            kind: "control.config.diff"
          };
        });
        return true;
      }

      if (pathname === "/api/control/config/apply") {
        await handleMutation(req, res, pathname, "control.config.apply", async (body) => {
          const workspaceId =
            typeof body.workspaceId === "string" && body.workspaceId.trim().length > 0
              ? body.workspaceId.trim()
              : "global";
          const baseVersion = parseNumber(body.baseVersion);
          if (baseVersion === null || !Number.isInteger(baseVersion) || baseVersion < 0) {
            throw new HttpError(400, "INVALID_BASE_VERSION", "baseVersion must be a non-negative integer");
          }

          const config = isObjectRecord(body.config) ? body.config : {};
          const snapshots = repositories?.configSnapshots?.listByWorkspace
            ? repositories.configSnapshots.listByWorkspace(workspaceId)
            : [];
          const currentVersion = snapshots.length;
          if (baseVersion !== currentVersion) {
            throw new HttpError(
              409,
              "CONFIG_VERSION_CONFLICT",
              `baseVersion ${baseVersion} does not match current version ${currentVersion}`
            );
          }

          const now = new Date().toISOString();
          const redactedConfig = redactSecrets(config);
          const nextVersion = currentVersion + 1;
          if (repositories?.configSnapshots?.insert) {
            repositories.configSnapshots.insert({
              id: randomUUID(),
              workspaceId,
              source: "control.apply",
              snapshotJson: JSON.stringify(redactedConfig),
              capturedAt: now
            });
          }

          if (repositories?.configOperations?.insert) {
            repositories.configOperations.insert({
              id: randomUUID(),
              workspaceId,
              actor: "control-api",
              operation: "apply",
              payloadJson: JSON.stringify({ baseVersion, nextVersion, config: redactedConfig }),
              createdAt: now
            });
          }

          return {
            status: 200,
            body: { ok: true, workspaceId, version: nextVersion },
            workspaceId,
            kind: "control.config.apply"
          };
        });
        return true;
      }

      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }
  };
}
