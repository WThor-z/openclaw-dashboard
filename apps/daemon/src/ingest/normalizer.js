import { createHash, randomUUID } from "node:crypto";

function stableStringify(value) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return "null";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => {
    if (left < right) {
      return -1;
    }

    if (left > right) {
      return 1;
    }

    return 0;
  });

  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function normalizeCreatedAt(createdAt, nowIso) {
  if (typeof createdAt === "string" && Number.isFinite(Date.parse(createdAt))) {
    return new Date(createdAt).toISOString();
  }

  return nowIso;
}

function extractCorrelations(payload, overrides = {}) {
  const sessionId =
    overrides.sessionId ??
    payload?.sessionId ??
    payload?.session_id ??
    payload?.session?.id ??
    null;
  const taskId =
    overrides.taskId ??
    payload?.taskId ??
    payload?.task_id ??
    payload?.task?.id ??
    null;

  return {
    sessionId: typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null,
    taskId: typeof taskId === "string" && taskId.length > 0 ? taskId : null
  };
}

function createDedupeKey({ source, kind, level, workspaceId, sessionId, taskId, payloadJson }) {
  const signature = `${source}|${kind}|${level}|${workspaceId}|${sessionId ?? ""}|${taskId ?? ""}|${payloadJson}`;
  const digest = createHash("sha256").update(signature).digest("hex");
  return `sha256:${digest}`;
}

export function normalizeEventEnvelope(input) {
  const source = input?.source;
  if (source !== "gateway" && source !== "daemon" && source !== "cli") {
    throw new Error(`Unsupported event source: ${String(source)}`);
  }

  const nowIso = input?.nowIso ?? new Date().toISOString();
  const kind = typeof input?.kind === "string" && input.kind.length > 0 ? input.kind : "unknown";
  const level =
    input?.level === "debug" ||
    input?.level === "info" ||
    input?.level === "warn" ||
    input?.level === "error"
      ? input.level
      : "info";
  const workspaceId =
    typeof input?.workspaceId === "string" && input.workspaceId.length > 0
      ? input.workspaceId
      : "default";
  const payload = input?.payload ?? {};
  const payloadJson = stableStringify(payload);
  const correlation = extractCorrelations(payload, {
    sessionId: input?.sessionId,
    taskId: input?.taskId
  });

  return {
    id: randomUUID(),
    source,
    kind,
    level,
    workspaceId,
    sessionId: correlation.sessionId,
    taskId: correlation.taskId,
    payloadJson,
    createdAt: normalizeCreatedAt(input?.createdAt, nowIso),
    dedupeKey: createDedupeKey({
      source,
      kind,
      level,
      workspaceId,
      sessionId: correlation.sessionId,
      taskId: correlation.taskId,
      payloadJson
    })
  };
}

export function normalizeIngestError({ source, workspaceId, reason, detail, nowIso }) {
  const safeReason = typeof reason === "string" && reason.length > 0 ? reason : "Unknown ingest error";
  const payload = { reason: safeReason };
  if (typeof detail === "string") {
    payload.detail = detail;
  }

  return normalizeEventEnvelope({
    source,
    kind: "ingest.error",
    level: "error",
    workspaceId,
    payload,
    nowIso
  });
}
