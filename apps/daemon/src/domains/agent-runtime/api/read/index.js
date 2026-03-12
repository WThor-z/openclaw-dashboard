import { HttpError, sendJson } from "../../../../shared/middleware/error-handler.js";
import { parseAndRedactJson, redactSecrets } from "../../../../shared/redaction.js";
import { readFile } from "node:fs/promises";

function decodeSegmentOrThrow(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "INVALID_ROUTE_PARAM", "Route parameter is invalid");
  }
}

function parsePositiveInteger(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, "INVALID_LIMIT", "limit must be a positive integer");
  }

  return parsed;
}

function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function readNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readConversationIdFromPayload(payload) {
  const payloadRecord = asRecord(payload);
  if (!payloadRecord) {
    return null;
  }

  const directConversationId = readNonEmptyString(payloadRecord.conversationId);
  if (directConversationId) {
    return directConversationId;
  }

  const requestRecord = asRecord(payloadRecord.request);
  const requestConversationId = readNonEmptyString(requestRecord?.conversationId);
  if (requestConversationId) {
    return requestConversationId;
  }

  const responseRecord = asRecord(payloadRecord.response);
  const bodyRecord = asRecord(responseRecord?.body);
  const bodyConversationId = readNonEmptyString(bodyRecord?.conversationId);
  if (bodyConversationId) {
    return bodyConversationId;
  }

  const conversationRecord = asRecord(bodyRecord?.conversation);
  const conversationConversationId = readNonEmptyString(conversationRecord?.id);
  if (conversationConversationId) {
    return conversationConversationId;
  }

  const userMessageRecord = asRecord(bodyRecord?.userMessage);
  const userMessageConversationId = readNonEmptyString(userMessageRecord?.conversationId);
  if (userMessageConversationId) {
    return userMessageConversationId;
  }

  const assistantMessageRecord = asRecord(bodyRecord?.assistantMessage);
  return readNonEmptyString(assistantMessageRecord?.conversationId);
}

function toTimelineItem(record) {
  return {
    id: record.id,
    source: record.source,
    sessionId: record.sessionId,
    taskId: record.taskId,
    workspaceId: record.workspaceId,
    level: record.level,
    kind: record.kind,
    payload: parseAndRedactJson(record.payloadJson),
    createdAt: record.createdAt,
    dedupeKey: record.dedupeKey
  };
}

function toIsoTimestamp(value, fallbackIndex) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    return value;
  }

  return new Date(0 + fallbackIndex).toISOString();
}

function toTranscriptTimelineItem(eventValue, index, conversation) {
  const eventRecord = asRecord(eventValue);
  const kind =
    readNonEmptyString(eventRecord?.kind) ??
    readNonEmptyString(eventRecord?.type) ??
    readNonEmptyString(eventRecord?.event) ??
    "openclaw.transcript.event";
  const id =
    readNonEmptyString(eventRecord?.id) ??
    readNonEmptyString(eventRecord?.eventId) ??
    `transcript-${conversation.id}-${index}`;
  const createdAt = toIsoTimestamp(
    eventRecord?.timestamp ?? eventRecord?.createdAt ?? eventRecord?.ts,
    index
  );

  return {
    id,
    source: "openclaw-transcript",
    sessionId: null,
    taskId: null,
    workspaceId: conversation.workspaceId,
    level: "info",
    kind,
    payload: redactSecrets(eventRecord ?? eventValue),
    createdAt,
    dedupeKey: null
  };
}

async function readTranscriptTimelineItems(transcriptPath, conversation, limit) {
  const content = await readFile(transcriptPath, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsedEvents = [];
  for (let index = 0; index < lines.length; index += 1) {
    try {
      parsedEvents.push(JSON.parse(lines[index]));
    } catch {
      continue;
    }
  }

  const selected = parsedEvents
    .slice(-limit)
    .map((eventValue, index) => toTranscriptTimelineItem(eventValue, index, conversation));

  return selected.reverse();
}

function resolveSessionRowByConversation({ sessionsPayload, conversation }) {
  const rows = Array.isArray(sessionsPayload?.sessions) ? sessionsPayload.sessions : [];
  return (
    rows.find((row) => readNonEmptyString(row?.key) === conversation.sessionKey) ??
    rows.find((row) => readNonEmptyString(row?.sessionId) === conversation.id) ??
    null
  );
}

async function readNativeConversationTimeline(openclawRuntimeAdapter, conversation, limit) {
  if (typeof openclawRuntimeAdapter?.sessions?.list !== "function") {
    return null;
  }

  const sessionsPayload = await openclawRuntimeAdapter.sessions.list({
    agentId: conversation.agentId,
    limit: 200,
    allAgents: false
  });
  const sessionRow = resolveSessionRowByConversation({ sessionsPayload, conversation });
  const transcriptPath = readNonEmptyString(sessionRow?.transcriptPath);
  if (!transcriptPath) {
    return null;
  }

  const items = await readTranscriptTimelineItems(transcriptPath, conversation, limit);
  return {
    items,
    limit,
    conversationId: conversation.id,
    source: "openclaw-native-transcript"
  };
}

function mapAdapterErrorToHttpError(error) {
  if (error instanceof HttpError) {
    return error;
  }

  const code =
    typeof error?.code === "string" && error.code.length > 0
      ? error.code
      : "OPENCLAW_RUNTIME_ERROR";
  const message =
    typeof error?.message === "string" && error.message.length > 0
      ? error.message
      : "OpenClaw runtime operation failed";

  const httpStatusMatch = /^OPENCLAW_HTTP_(\d{3})$/.exec(code);
  if (httpStatusMatch) {
    return new HttpError(Number.parseInt(httpStatusMatch[1], 10), code, message);
  }

  if (code.includes("NOT_FOUND")) {
    return new HttpError(404, code, message);
  }

  if (
    code.includes("BAD_REQUEST") ||
    code.includes("INVALID") ||
    code.includes("VALIDATION") ||
    code.includes("REQUIRED")
  ) {
    return new HttpError(400, code, message);
  }

  return new HttpError(502, code, message);
}

function resolveAgentRuntimeRoute(pathname) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "api" && segments[1] === "agents" && segments.length >= 4) {
    const agentId = decodeSegmentOrThrow(segments[2]);
    if (!agentId) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    if (segments.length === 4 && segments[3] === "conversations") {
      return { kind: "conversations.list", agentId };
    }

    if (segments.length === 4 && segments[3] === "schedules") {
      return { kind: "schedules.list", agentId };
    }

    if (segments.length === 6 && segments[3] === "schedules" && segments[5] === "runs") {
      const jobId = decodeSegmentOrThrow(segments[4]);
      if (!jobId) {
        throw new HttpError(404, "NOT_FOUND", "Route not found");
      }

      return { kind: "schedule.runs", agentId, jobId };
    }

    if (segments.length === 4 && segments[3] === "heartbeat") {
      return { kind: "heartbeat.read", agentId };
    }

    if (segments.length === 4 && segments[3] === "memory") {
      return { kind: "memory.read", agentId };
    }
  }

  if (segments[0] === "api" && segments[1] === "conversations" && segments.length >= 3) {
    const conversationId = decodeSegmentOrThrow(segments[2]);
    if (!conversationId) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    if (segments.length === 3) {
      return { kind: "conversation.detail", conversationId };
    }

    if (segments.length === 4 && segments[3] === "messages") {
      return { kind: "conversation.messages", conversationId };
    }

    if (segments.length === 4 && segments[3] === "timeline") {
      return { kind: "conversation.timeline", conversationId };
    }
  }

  return null;
}

function getConversationOrThrow(repositories, conversationId) {
  const conversation = repositories?.conversations?.getById
    ? repositories.conversations.getById(conversationId)
    : null;
  if (!conversation) {
    throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }

  return conversation;
}

async function readSchedules(openclawRuntimeAdapter, agentId) {
  if (typeof openclawRuntimeAdapter?.cron?.list !== "function") {
    throw new HttpError(
      500,
      "OPENCLAW_ADAPTER_UNAVAILABLE",
      "OpenClaw runtime adapter is unavailable"
    );
  }

  try {
    return await openclawRuntimeAdapter.cron.list({ agentId });
  } catch (error) {
    throw mapAdapterErrorToHttpError(error);
  }
}

async function readScheduleRuns(openclawRuntimeAdapter, agentId, jobId, limit) {
  if (typeof openclawRuntimeAdapter?.cron?.runs !== "function") {
    throw new HttpError(
      500,
      "OPENCLAW_ADAPTER_UNAVAILABLE",
      "OpenClaw runtime adapter is unavailable"
    );
  }

  try {
    return await openclawRuntimeAdapter.cron.runs({
      agentId,
      scheduleId: jobId,
      ...(limit === null ? {} : { limit })
    });
  } catch (error) {
    throw mapAdapterErrorToHttpError(error);
  }
}

async function readHeartbeat(openclawRuntimeAdapter, agentId) {
  if (typeof openclawRuntimeAdapter?.heartbeat?.read !== "function") {
    throw new HttpError(
      500,
      "OPENCLAW_ADAPTER_UNAVAILABLE",
      "OpenClaw runtime adapter is unavailable"
    );
  }

  try {
    return await openclawRuntimeAdapter.heartbeat.read({ agentId });
  } catch (error) {
    throw mapAdapterErrorToHttpError(error);
  }
}

async function readMemory(openclawRuntimeAdapter, agentId) {
  if (typeof openclawRuntimeAdapter?.memory?.read !== "function") {
    throw new HttpError(
      500,
      "OPENCLAW_ADAPTER_UNAVAILABLE",
      "OpenClaw runtime adapter is unavailable"
    );
  }

  try {
    return await openclawRuntimeAdapter.memory.read({ agentId });
  } catch (error) {
    throw mapAdapterErrorToHttpError(error);
  }
}

async function readConversationTimeline(
  repositories,
  openclawRuntimeAdapter,
  conversationId,
  limit
) {
  const conversation = getConversationOrThrow(repositories, conversationId);
  const maxItems = Number.isInteger(limit) && limit > 0 ? limit : 50;

  try {
    const nativeTimeline = await readNativeConversationTimeline(
      openclawRuntimeAdapter,
      conversation,
      maxItems
    );
    if (nativeTimeline !== null) {
      return nativeTimeline;
    }
  } catch {
    // Fallback to daemon event timeline below when native session metadata or transcript is unavailable.
  }

  const rows = repositories?.events?.listTimelineByWorkspace
    ? repositories.events.listTimelineByWorkspace(conversation.workspaceId)
    : [];
  const timelineItems = [];
  for (const row of rows) {
    const timelineItem = toTimelineItem(row);
    if (readConversationIdFromPayload(timelineItem.payload) !== conversationId) {
      continue;
    }

    timelineItems.push(timelineItem);
    if (timelineItems.length >= maxItems) {
      break;
    }
  }

  return {
    items: timelineItems,
    limit: maxItems,
    conversationId
  };
}

export function createAgentRuntimeReadApiRouter({ repositories, openclawRuntimeAdapter }) {
  return {
    async handle(req, res, requestUrl) {
      if (req.method !== "GET") {
        return false;
      }

      const route = resolveAgentRuntimeRoute(requestUrl.pathname);
      if (route === null) {
        return false;
      }

      if (route.kind === "conversations.list") {
        const items = repositories?.conversations?.listByAgent
          ? repositories.conversations.listByAgent(route.agentId)
          : [];
        sendJson(res, 200, { items });
        return true;
      }

      if (route.kind === "conversation.detail") {
        const conversation = getConversationOrThrow(repositories, route.conversationId);
        sendJson(res, 200, { conversation });
        return true;
      }

      if (route.kind === "conversation.messages") {
        getConversationOrThrow(repositories, route.conversationId);
        const items = repositories?.conversationMessages?.listByConversation
          ? repositories.conversationMessages.listByConversation(route.conversationId)
          : [];
        sendJson(res, 200, { items });
        return true;
      }

      if (route.kind === "conversation.timeline") {
        const limit = parsePositiveInteger(requestUrl.searchParams.get("limit"));
        const payload = await readConversationTimeline(
          repositories,
          openclawRuntimeAdapter,
          route.conversationId,
          limit
        );
        sendJson(res, 200, payload);
        return true;
      }

      if (route.kind === "schedules.list") {
        const payload = await readSchedules(openclawRuntimeAdapter, route.agentId);
        sendJson(res, 200, payload);
        return true;
      }

      if (route.kind === "schedule.runs") {
        const limit = parsePositiveInteger(requestUrl.searchParams.get("limit"));
        const payload = await readScheduleRuns(
          openclawRuntimeAdapter,
          route.agentId,
          route.jobId,
          limit
        );
        sendJson(res, 200, payload);
        return true;
      }

      if (route.kind === "heartbeat.read") {
        const payload = await readHeartbeat(openclawRuntimeAdapter, route.agentId);
        sendJson(res, 200, payload);
        return true;
      }

      const payload = await readMemory(openclawRuntimeAdapter, route.agentId);
      sendJson(res, 200, payload);
      return true;
    }
  };
}
