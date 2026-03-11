import { randomUUID } from "node:crypto";

import { HttpError } from "../../../../shared/middleware/error-handler.js";

function decodeSegmentOrThrow(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "INVALID_ROUTE_PARAM", "Route parameter is invalid");
  }
}

function isObjectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(value, code, message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, code, message);
  }

  return value.trim();
}

function readOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value, defaultValue = true) {
  if (typeof value === "boolean") {
    return value;
  }

  return defaultValue;
}

function resolveWorkspaceId(body, fallbackValue) {
  return readOptionalString(body.workspaceId) ?? fallbackValue;
}

function resolveControlRoute(pathname) {
  const segments = pathname.split("/").filter(Boolean);

  if (
    segments[0] === "api" &&
    segments[1] === "control" &&
    segments[2] === "agents" &&
    segments.length >= 5
  ) {
    const agentId = decodeSegmentOrThrow(segments[3]);
    if (!agentId) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    if (segments.length === 6 && segments[4] === "conversations" && segments[5] === "create") {
      return { kind: "conversation.create", agentId };
    }

    if (segments.length === 6 && segments[4] === "schedules" && segments[5] === "create") {
      return { kind: "schedule.create", agentId };
    }

    if (segments.length === 7 && segments[4] === "schedules") {
      const jobId = decodeSegmentOrThrow(segments[5]);
      if (!jobId) {
        throw new HttpError(404, "NOT_FOUND", "Route not found");
      }

      if (segments[6] === "update") {
        return { kind: "schedule.update", agentId, jobId };
      }
      if (segments[6] === "run") {
        return { kind: "schedule.run", agentId, jobId };
      }
      if (segments[6] === "remove") {
        return { kind: "schedule.remove", agentId, jobId };
      }
    }

    if (segments.length === 6 && segments[4] === "heartbeat" && segments[5] === "update") {
      return { kind: "heartbeat.update", agentId };
    }

    if (segments.length === 6 && segments[4] === "memory" && segments[5] === "configure") {
      return { kind: "memory.configure", agentId };
    }
  }

  if (
    segments[0] === "api" &&
    segments[1] === "control" &&
    segments[2] === "conversations" &&
    segments.length >= 5
  ) {
    const conversationId = decodeSegmentOrThrow(segments[3]);
    if (!conversationId) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    if (segments.length === 6 && segments[4] === "messages" && segments[5] === "send") {
      return { kind: "message.send", conversationId };
    }

    if (segments.length === 5 && segments[4] === "archive") {
      return { kind: "conversation.archive", conversationId };
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

  if (code.includes("CONFLICT")) {
    return new HttpError(409, code, message);
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

function touchConversation(repositories, conversationId, updatedAt) {
  if (typeof repositories?.conversations?.touch !== "function") {
    return;
  }

  repositories.conversations.touch({ id: conversationId, updatedAt });
}

async function callAdapter(action) {
  try {
    return await action();
  } catch (error) {
    throw mapAdapterErrorToHttpError(error);
  }
}

async function sendConversationMessage({
  repositories,
  openclawRuntimeAdapter,
  conversation,
  body
}) {
  if (!isObjectRecord(body)) {
    throw new HttpError(400, "INVALID_BODY", "Request body must be a JSON object");
  }

  if (conversation.status === "archived") {
    throw new HttpError(409, "CONVERSATION_ARCHIVED", "Conversation is archived");
  }

  const content = readNonEmptyString(body.content, "CONTENT_REQUIRED", "content is required");
  const userMessageId = randomUUID();
  const assistantMessageId = randomUUID();
  const createdAt = new Date().toISOString();

  repositories?.conversationMessages?.insert?.({
    id: userMessageId,
    conversationId: conversation.id,
    role: "user",
    state: "completed",
    content,
    errorCode: null,
    externalMessageId: null,
    createdAt,
    updatedAt: createdAt
  });
  repositories?.conversationMessages?.appendPendingAssistantMessage?.({
    id: assistantMessageId,
    conversationId: conversation.id,
    content: "",
    createdAt,
    updatedAt: createdAt,
    externalMessageId: null
  });
  touchConversation(repositories, conversation.id, createdAt);

  try {
    const adapterResponse = await openclawRuntimeAdapter.messaging.send({
      agentId: conversation.agentId,
      sessionKey: conversation.sessionKey,
      content
    });
    const completedAt = new Date().toISOString();
    repositories?.conversationMessages?.completeAssistantMessage?.({
      id: assistantMessageId,
      state: "completed",
      content: typeof adapterResponse?.outputText === "string" ? adapterResponse.outputText : "",
      errorCode: null,
      externalMessageId: readOptionalString(adapterResponse?.id),
      updatedAt: completedAt
    });
    touchConversation(repositories, conversation.id, completedAt);

    const items = repositories?.conversationMessages?.listByConversation
      ? repositories.conversationMessages.listByConversation(conversation.id)
      : [];
    const assistantMessage = items.find((message) => message.id === assistantMessageId) ?? null;
    const userMessage = items.find((message) => message.id === userMessageId) ?? null;

    return {
      status: 200,
      body: {
        ok: true,
        conversationId: conversation.id,
        userMessage,
        assistantMessage
      },
      workspaceId: conversation.workspaceId,
      kind: "control.agent-runtime.messages.send"
    };
  } catch (error) {
    const httpError = mapAdapterErrorToHttpError(error);
    const failedAt = new Date().toISOString();
    repositories?.conversationMessages?.completeAssistantMessage?.({
      id: assistantMessageId,
      state: "failed",
      content: httpError.message,
      errorCode: httpError.code,
      externalMessageId: null,
      updatedAt: failedAt
    });
    touchConversation(repositories, conversation.id, failedAt);
    throw httpError;
  }
}

export function createAgentRuntimeControlApi({ repositories, openclawRuntimeAdapter }) {
  return {
    resolve(pathname) {
      const route = resolveControlRoute(pathname);
      if (route === null) {
        return null;
      }

      if (route.kind === "conversation.create") {
        return {
          routeKey: `control.agent-runtime.conversations.create:${route.agentId}`,
          async mutate(body) {
            if (!isObjectRecord(body)) {
              throw new HttpError(400, "INVALID_BODY", "Request body must be a JSON object");
            }

            const workspaceId = readNonEmptyString(
              body.workspaceId,
              "WORKSPACE_ID_REQUIRED",
              "workspaceId is required"
            );
            const title = readNonEmptyString(body.title, "TITLE_REQUIRED", "title is required");
            const createdAt = new Date().toISOString();
            const conversationId = randomUUID();
            repositories?.conversations?.insert?.({
              id: conversationId,
              agentId: route.agentId,
              workspaceId,
              sessionKey: `dashboard:${route.agentId}:${conversationId}`,
              title,
              status: "active",
              createdAt,
              updatedAt: createdAt,
              archivedAt: null
            });
            const conversation = getConversationOrThrow(repositories, conversationId);

            return {
              status: 200,
              body: {
                ok: true,
                conversation
              },
              workspaceId,
              kind: "control.agent-runtime.conversations.create"
            };
          }
        };
      }

      if (route.kind === "message.send") {
        return {
          routeKey: `control.agent-runtime.messages.send:${route.conversationId}`,
          async mutate(body) {
            const conversation = getConversationOrThrow(repositories, route.conversationId);
            return sendConversationMessage({
              repositories,
              openclawRuntimeAdapter,
              conversation,
              body
            });
          }
        };
      }

      if (route.kind === "conversation.archive") {
        return {
          routeKey: `control.agent-runtime.conversations.archive:${route.conversationId}`,
          async mutate() {
            const conversation = getConversationOrThrow(repositories, route.conversationId);
            const archivedAt = new Date().toISOString();
            const archived = repositories?.conversations?.archiveConversation
              ? repositories.conversations.archiveConversation({
                  id: route.conversationId,
                  archivedAt,
                  updatedAt: archivedAt
                })
              : false;
            if (!archived) {
              throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
            }

            return {
              status: 200,
              body: {
                ok: true,
                archived: true,
                conversationId: route.conversationId
              },
              workspaceId: conversation.workspaceId,
              kind: "control.agent-runtime.conversations.archive"
            };
          }
        };
      }

      if (route.kind === "schedule.create") {
        return {
          routeKey: `control.agent-runtime.schedules.create:${route.agentId}`,
          async mutate(body) {
            const label = readNonEmptyString(body.label, "LABEL_REQUIRED", "label is required");
            const cron = readNonEmptyString(body.cron, "CRON_REQUIRED", "cron is required");
            const prompt = readNonEmptyString(body.prompt, "PROMPT_REQUIRED", "prompt is required");
            const payload = await callAdapter(() =>
              openclawRuntimeAdapter.cron.add({
                agentId: route.agentId,
                label,
                cron,
                prompt,
                enabled: readBoolean(body.enabled, true),
                timezone: readOptionalString(body.timezone),
                sessionKey: readOptionalString(body.sessionKey)
              })
            );
            return {
              status: 200,
              body: payload,
              workspaceId: resolveWorkspaceId(body, route.agentId),
              kind: "control.agent-runtime.schedules.create"
            };
          }
        };
      }

      if (route.kind === "schedule.update") {
        return {
          routeKey: `control.agent-runtime.schedules.update:${route.agentId}:${route.jobId}`,
          async mutate(body) {
            const label = readNonEmptyString(body.label, "LABEL_REQUIRED", "label is required");
            const cron = readNonEmptyString(body.cron, "CRON_REQUIRED", "cron is required");
            const prompt = readNonEmptyString(body.prompt, "PROMPT_REQUIRED", "prompt is required");
            const payload = await callAdapter(() =>
              openclawRuntimeAdapter.cron.update({
                agentId: route.agentId,
                scheduleId: route.jobId,
                label,
                cron,
                prompt,
                enabled: readBoolean(body.enabled, true),
                timezone: readOptionalString(body.timezone),
                sessionKey: readOptionalString(body.sessionKey)
              })
            );
            return {
              status: 200,
              body: payload,
              workspaceId: resolveWorkspaceId(body, route.agentId),
              kind: "control.agent-runtime.schedules.update"
            };
          }
        };
      }

      if (route.kind === "schedule.run") {
        return {
          routeKey: `control.agent-runtime.schedules.run:${route.agentId}:${route.jobId}`,
          async mutate(body) {
            const payload = await callAdapter(() =>
              openclawRuntimeAdapter.cron.run({
                agentId: route.agentId,
                scheduleId: route.jobId
              })
            );
            return {
              status: 200,
              body: payload,
              workspaceId: resolveWorkspaceId(body, route.agentId),
              kind: "control.agent-runtime.schedules.run"
            };
          }
        };
      }

      if (route.kind === "schedule.remove") {
        return {
          routeKey: `control.agent-runtime.schedules.remove:${route.agentId}:${route.jobId}`,
          async mutate(body) {
            const payload = await callAdapter(() =>
              openclawRuntimeAdapter.cron.remove({
                agentId: route.agentId,
                scheduleId: route.jobId
              })
            );
            return {
              status: 200,
              body: payload,
              workspaceId: resolveWorkspaceId(body, route.agentId),
              kind: "control.agent-runtime.schedules.remove"
            };
          }
        };
      }

      if (route.kind === "heartbeat.update") {
        return {
          routeKey: `control.agent-runtime.heartbeat.update:${route.agentId}`,
          async mutate(body) {
            const every = readNonEmptyString(body.every, "EVERY_REQUIRED", "every is required");
            const session = readNonEmptyString(
              body.session,
              "SESSION_REQUIRED",
              "session is required"
            );
            const payload = await callAdapter(() =>
              openclawRuntimeAdapter.heartbeat.configure({
                agentId: route.agentId,
                workspaceId: resolveWorkspaceId(body, route.agentId),
                every,
                session,
                lightContext:
                  typeof body.lightContext === "boolean" ? body.lightContext : undefined,
                ...(readOptionalString(body.prompt)
                  ? { prompt: readOptionalString(body.prompt) }
                  : {})
              })
            );
            return {
              status: 200,
              body: payload,
              workspaceId: resolveWorkspaceId(body, route.agentId),
              kind: "control.agent-runtime.heartbeat.update"
            };
          }
        };
      }

      return {
        routeKey: `control.agent-runtime.memory.configure:${route.agentId}`,
        async mutate(body) {
          const scope = readNonEmptyString(body.scope, "SCOPE_REQUIRED", "scope is required");
          const provider = readNonEmptyString(
            body.provider,
            "PROVIDER_REQUIRED",
            "provider is required"
          );
          const model = readOptionalString(body.model);
          const apiKeyRef = readOptionalString(body.apiKeyRef);
          const remoteBaseUrl =
            body.remote && typeof body.remote === "object"
              ? readOptionalString(body.remote.baseUrl)
              : null;
          const payload = await callAdapter(() =>
            openclawRuntimeAdapter.memory.configure({
              agentId: route.agentId,
              workspaceId: resolveWorkspaceId(body, route.agentId),
              scope,
              provider,
              secretRef: body.secretRef === null ? null : readOptionalString(body.secretRef),
              conversationId: readOptionalString(body.conversationId),
              model,
              remoteBaseUrl,
              apiKeyRef
            })
          );
          return {
            status: 200,
            body: payload,
            workspaceId: resolveWorkspaceId(body, route.agentId),
            kind: "control.agent-runtime.memory.configure"
          };
        }
      };
    }
  };
}
