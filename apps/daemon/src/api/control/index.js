import { randomUUID } from "node:crypto";

import { HttpError, sendJson } from "../../middleware/error-handler.js";
import { redactSecrets } from "../read/redaction.js";

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
  readOnlyMode = false,
  writeArmWindowMs = DEFAULT_ARM_WINDOW_MS
} = {}) {
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
