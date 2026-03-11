import { HttpError, sendJson } from "../../../../shared/middleware/error-handler.js";

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
