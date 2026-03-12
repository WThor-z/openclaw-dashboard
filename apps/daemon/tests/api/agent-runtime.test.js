import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDaemonServer } from "../../src/app/http-server.js";
import { runMigrations } from "../../src/platform/storage/migrations.js";
import { createStorageRepositories } from "../../src/platform/storage/repositories.js";

const activeServers = [];
const openDatabases = [];
const ADMIN_TOKEN = "dev-token";

afterEach(async () => {
  while (activeServers.length > 0) {
    const entry = activeServers.pop();
    await entry.stop();
  }

  while (openDatabases.length > 0) {
    const db = openDatabases.pop();
    db.close();
  }
});

function endpointFrom(address) {
  return `http://${address.address}:${address.port}`;
}

function createFixtureRepositories() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  openDatabases.push(db);
  runMigrations(db, { direction: "up" });
  return createStorageRepositories(db);
}

function createRuntimeAdapter(overrides = {}) {
  return {
    messaging: {
      send: vi.fn(async ({ agentId, sessionKey, content }) => ({
        id: `resp:${agentId}:${sessionKey}`,
        outputText: `assistant:${content}`,
        raw: { ok: true },
        ...overrides.messagingSendResult
      }))
    },
    cron: {
      list: vi.fn(async ({ agentId }) => ({
        items: [
          {
            id: "job-1",
            agentId,
            workspaceId: "ws-1",
            label: "Daily sync",
            cron: "0 9 * * *",
            prompt: "Sync now",
            enabled: true,
            nextRunAt: "2026-03-11T09:00:00.000Z",
            lastRunAt: "2026-03-10T09:00:00.000Z",
            createdAt: "2026-03-10T08:00:00.000Z",
            updatedAt: "2026-03-10T08:00:00.000Z"
          }
        ]
      })),
      add: vi.fn(async (payload) => ({ ok: true, jobId: "job-2", ...payload })),
      update: vi.fn(async (payload) => ({ ok: true, updated: true, ...payload })),
      run: vi.fn(async (payload) => ({ ok: true, runId: "run-1", ...payload })),
      remove: vi.fn(async (payload) => ({ ok: true, removed: true, ...payload })),
      runs: vi.fn(async ({ agentId, scheduleId }) => ({
        items: [
          {
            id: "run-1",
            scheduleId,
            agentId,
            status: "succeeded",
            startedAt: "2026-03-10T09:00:00.000Z",
            finishedAt: "2026-03-10T09:00:03.000Z",
            errorCode: null
          }
        ]
      }))
    },
    heartbeat: {
      read: vi.fn(async ({ agentId }) => ({
        heartbeat: {
          agentId,
          workspaceId: "ws-1",
          enabled: true,
          every: "*/10 * * * *",
          session: "session-1",
          lightContext: true,
          prompt: "Ping",
          lastBeatAt: "2026-03-10T10:00:00.000Z",
          nextBeatAt: "2026-03-10T10:10:00.000Z",
          updatedAt: "2026-03-10T10:00:00.000Z"
        }
      })),
      configure: vi.fn(async (payload) => ({ ok: true, heartbeat: payload }))
    },
    memory: {
      read: vi.fn(async ({ agentId }) => ({
        memory: {
          agentId,
          plugin: {
            provider: "openclaw-memory",
            secretRef: "secret://memory/default"
          },
          bindings: [
            {
              id: "binding-1",
              agentId,
              workspaceId: "ws-1",
              scope: "conversation",
              provider: "openclaw-memory",
              secretRef: "secret://memory/default",
              conversationId: "conversation-1",
              updatedAt: "2026-03-10T10:00:00.000Z"
            }
          ]
        }
      })),
      configure: vi.fn(async (payload) => ({ ok: true, binding: payload }))
    },
    ...overrides
  };
}

async function startServer({
  repositories,
  openclawRuntimeAdapter,
  resolveAgentModel = vi.fn(async () => null)
}) {
  const server = createDaemonServer({
    host: "127.0.0.1",
    port: 0,
    adminToken: ADMIN_TOKEN,
    logger: { info() {}, error() {} },
    repositories,
    openclawRuntimeAdapter,
    resolveAgentModel
  });
  await server.start();
  activeServers.push(server);
  return server;
}

async function armWrites(baseUrl) {
  const response = await fetch(`${baseUrl}/api/control/arm`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`
    }
  });

  expect(response.status).toBe(200);
}

function authorizedHeaders(extra = {}) {
  return {
    authorization: `Bearer ${ADMIN_TOKEN}`,
    ...extra
  };
}

describe("agent runtime APIs", () => {
  it("creates conversations, sends messages, reads threads, and archives them", async () => {
    const repositories = createFixtureRepositories();
    const runtimeAdapter = createRuntimeAdapter();
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const createResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-1")}/conversations/create`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-conversation-create-1"
        }),
        body: JSON.stringify({ workspaceId: "ws-1", title: "Weekly review" })
      }
    );
    const createBody = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(createBody.ok).toBe(true);
    expect(createBody.conversation).toMatchObject({
      agentId: "agent-1",
      workspaceId: "ws-1",
      title: "Weekly review",
      status: "active"
    });

    const conversationId = createBody.conversation.id;

    const sendResponse = await fetch(
      `${baseUrl}/api/control/conversations/${encodeURIComponent(conversationId)}/messages/send`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-send-1"
        }),
        body: JSON.stringify({ content: "Summarize the latest changes." })
      }
    );
    const sendBody = await sendResponse.json();

    expect(sendResponse.status).toBe(200);
    expect(sendBody.ok).toBe(true);
    expect(sendBody.assistantMessage).toMatchObject({
      role: "assistant",
      state: "completed",
      content: "assistant:Summarize the latest changes."
    });
    expect(runtimeAdapter.messaging.send).toHaveBeenCalledWith({
      agentId: "agent-1",
      sessionKey: `dashboard:agent-1:${conversationId}`,
      content: "Summarize the latest changes."
    });

    const conversationsResponse = await fetch(
      `${baseUrl}/api/agents/${encodeURIComponent("agent-1")}/conversations`,
      {
        headers: authorizedHeaders()
      }
    );
    const conversationsBody = await conversationsResponse.json();
    expect(conversationsResponse.status).toBe(200);
    expect(conversationsBody.items).toHaveLength(1);
    expect(conversationsBody.items[0]).toMatchObject({ id: conversationId, messageCount: 2 });

    const detailResponse = await fetch(
      `${baseUrl}/api/conversations/${encodeURIComponent(conversationId)}`,
      {
        headers: authorizedHeaders()
      }
    );
    const detailBody = await detailResponse.json();
    expect(detailResponse.status).toBe(200);
    expect(detailBody.conversation).toMatchObject({ id: conversationId, messageCount: 2 });

    const messagesResponse = await fetch(
      `${baseUrl}/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        headers: authorizedHeaders()
      }
    );
    const messagesBody = await messagesResponse.json();
    expect(messagesResponse.status).toBe(200);
    expect(messagesBody.items).toHaveLength(2);
    const roles = messagesBody.items.map((message) => message.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
    const userMessage = messagesBody.items.find((m) => m.role === "user");
    const assistantMessage = messagesBody.items.find((m) => m.role === "assistant");
    expect(userMessage.content).toBe("Summarize the latest changes.");
    expect(assistantMessage.content).toBe("assistant:Summarize the latest changes.");
    expect(assistantMessage.state).toBe("completed");

    const archiveResponse = await fetch(
      `${baseUrl}/api/control/conversations/${encodeURIComponent(conversationId)}/archive`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-archive-1"
        }),
        body: JSON.stringify({ reason: "completed" })
      }
    );
    const archiveBody = await archiveResponse.json();
    expect(archiveResponse.status).toBe(200);
    expect(archiveBody).toMatchObject({ ok: true, archived: true, conversationId });

    expect(repositories.events.listTimelineByWorkspace("ws-1").map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        "control.agent-runtime.conversations.create",
        "control.agent-runtime.messages.send",
        "control.agent-runtime.conversations.archive"
      ])
    );
  });

  it("persists resolved model on conversation create and forwards it on send", async () => {
    const repositories = createFixtureRepositories();
    const runtimeAdapter = createRuntimeAdapter();
    const server = await startServer({
      repositories,
      openclawRuntimeAdapter: runtimeAdapter,
      resolveAgentModel: vi.fn(async () => "gpt-4.1-from-config")
    });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const createResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-1")}/conversations/create`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-conversation-create-model-1"
        }),
        body: JSON.stringify({ workspaceId: "ws-1", title: "Model snapshot" })
      }
    );
    const createBody = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(createBody.conversation).toMatchObject({
      model: "gpt-4.1-from-config"
    });

    const conversationId = createBody.conversation.id;
    const sendResponse = await fetch(
      `${baseUrl}/api/control/conversations/${encodeURIComponent(conversationId)}/messages/send`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-send-model-1"
        }),
        body: JSON.stringify({ content: "use snapped model" })
      }
    );

    expect(sendResponse.status).toBe(200);
    expect(runtimeAdapter.messaging.send).toHaveBeenCalledWith({
      agentId: "agent-1",
      sessionKey: `dashboard:agent-1:${conversationId}`,
      content: "use snapped model",
      model: "gpt-4.1-from-config"
    });
  });

  it("keeps null-model conversations compatible with adapter fallback", async () => {
    const repositories = createFixtureRepositories();
    repositories.conversations.insert({
      id: "conversation-null-model",
      agentId: "agent-1",
      workspaceId: "ws-1",
      sessionKey: "dashboard:agent-1:conversation-null-model",
      title: "Legacy conversation",
      status: "active",
      model: null,
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:00:00.000Z",
      archivedAt: null
    });
    const runtimeAdapter = createRuntimeAdapter({
      messaging: {
        send: vi.fn(async ({ content, model }) => {
          if (typeof model === "string" && model.length > 0) {
            return { id: "resp-with-model", outputText: `model:${model}:${content}`, raw: {} };
          }

          return { id: "resp-fallback", outputText: `fallback:${content}`, raw: {} };
        })
      }
    });
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const sendResponse = await fetch(
      `${baseUrl}/api/control/conversations/conversation-null-model/messages/send`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-send-null-model-fallback-1"
        }),
        body: JSON.stringify({ content: "fallback path" })
      }
    );
    const sendBody = await sendResponse.json();

    expect(sendResponse.status).toBe(200);
    expect(sendBody.assistantMessage.content).toBe("fallback:fallback path");
    expect(runtimeAdapter.messaging.send).toHaveBeenCalledWith({
      agentId: "agent-1",
      sessionKey: "dashboard:agent-1:conversation-null-model",
      content: "fallback path"
    });
  });

  it("returns OPENCLAW_MODEL_REQUIRED for null-model conversations when adapter has no fallback", async () => {
    const repositories = createFixtureRepositories();
    repositories.conversations.insert({
      id: "conversation-null-model-error",
      agentId: "agent-1",
      workspaceId: "ws-1",
      sessionKey: "dashboard:agent-1:conversation-null-model-error",
      title: "Legacy conversation",
      status: "active",
      model: null,
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:00:00.000Z",
      archivedAt: null
    });
    const runtimeAdapter = createRuntimeAdapter({
      messaging: {
        send: vi.fn(async ({ model }) => {
          if (typeof model === "string" && model.length > 0) {
            return { id: "resp-with-model", outputText: "ok", raw: {} };
          }

          throw { code: "OPENCLAW_MODEL_REQUIRED", message: "model is required" };
        })
      }
    });
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const sendResponse = await fetch(
      `${baseUrl}/api/control/conversations/conversation-null-model-error/messages/send`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-send-null-model-error-1"
        }),
        body: JSON.stringify({ content: "no fallback" })
      }
    );
    const sendBody = await sendResponse.json();

    expect(sendResponse.status).toBe(400);
    expect(sendBody.code).toBe("OPENCLAW_MODEL_REQUIRED");
  });

  it("returns CONVERSATION_NOT_FOUND for missing conversation reads and writes", async () => {
    const repositories = createFixtureRepositories();
    const runtimeAdapter = createRuntimeAdapter();
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const detailResponse = await fetch(`${baseUrl}/api/conversations/conversation-missing`, {
      headers: authorizedHeaders()
    });
    const detailBody = await detailResponse.json();
    expect(detailResponse.status).toBe(404);
    expect(detailBody.code).toBe("CONVERSATION_NOT_FOUND");

    const sendResponse = await fetch(
      `${baseUrl}/api/control/conversations/conversation-missing/messages/send`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-missing-send-1"
        }),
        body: JSON.stringify({ content: "hello" })
      }
    );
    const sendBody = await sendResponse.json();

    expect(sendResponse.status).toBe(404);
    expect(sendBody.code).toBe("CONVERSATION_NOT_FOUND");
  });

  it("replays duplicate message sends without duplicating messages or audit events", async () => {
    const repositories = createFixtureRepositories();
    repositories.conversations.insert({
      id: "conversation-1",
      agentId: "agent-1",
      workspaceId: "ws-1",
      sessionKey: "dashboard:agent-1:conversation-1",
      title: "Weekly review",
      status: "active",
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:00:00.000Z",
      archivedAt: null
    });
    const runtimeAdapter = createRuntimeAdapter();
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const request = {
      method: "POST",
      headers: authorizedHeaders({
        "content-type": "application/json",
        "idempotency-key": "runtime-send-idem-1"
      }),
      body: JSON.stringify({ content: "hello again" })
    };

    const firstResponse = await fetch(
      `${baseUrl}/api/control/conversations/conversation-1/messages/send`,
      request
    );
    const firstBody = await firstResponse.json();
    const secondResponse = await fetch(
      `${baseUrl}/api/control/conversations/conversation-1/messages/send`,
      request
    );
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondBody).toEqual(firstBody);
    expect(runtimeAdapter.messaging.send).toHaveBeenCalledTimes(1);
    expect(repositories.conversationMessages.listByConversation("conversation-1")).toHaveLength(2);
    expect(
      repositories.events
        .listTimelineByWorkspace("ws-1")
        .filter((event) => event.kind === "control.agent-runtime.messages.send")
    ).toHaveLength(1);
  });

  it("routes schedule, heartbeat, and memory reads and writes through the runtime adapter", async () => {
    const repositories = createFixtureRepositories();
    const runtimeAdapter = createRuntimeAdapter();
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const schedulesResponse = await fetch(`${baseUrl}/api/agents/agent-1/schedules`, {
      headers: authorizedHeaders()
    });
    const schedulesBody = await schedulesResponse.json();
    expect(schedulesResponse.status).toBe(200);
    expect(schedulesBody.items[0]).toMatchObject({ id: "job-1", agentId: "agent-1" });

    const runsResponse = await fetch(`${baseUrl}/api/agents/agent-1/schedules/job-1/runs`, {
      headers: authorizedHeaders()
    });
    const runsBody = await runsResponse.json();
    expect(runsResponse.status).toBe(200);
    expect(runsBody.items[0]).toMatchObject({ id: "run-1", scheduleId: "job-1" });

    const heartbeatResponse = await fetch(`${baseUrl}/api/agents/agent-1/heartbeat`, {
      headers: authorizedHeaders()
    });
    const heartbeatBody = await heartbeatResponse.json();
    expect(heartbeatResponse.status).toBe(200);
    expect(heartbeatBody.heartbeat).toMatchObject({ agentId: "agent-1", every: "*/10 * * * *" });

    const memoryResponse = await fetch(`${baseUrl}/api/agents/agent-1/memory`, {
      headers: authorizedHeaders()
    });
    const memoryBody = await memoryResponse.json();
    expect(memoryResponse.status).toBe(200);
    expect(memoryBody.memory).toMatchObject({ agentId: "agent-1" });

    const createScheduleResponse = await fetch(
      `${baseUrl}/api/control/agents/agent-1/schedules/create`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-schedule-create-1"
        }),
        body: JSON.stringify({
          label: "Daily sync",
          cron: "0 9 * * *",
          prompt: "Sync now",
          enabled: true,
          timezone: "Asia/Shanghai",
          sessionKey: "dashboard:agent-1:schedule-1"
        })
      }
    );
    expect(createScheduleResponse.status).toBe(200);

    const updateScheduleResponse = await fetch(
      `${baseUrl}/api/control/agents/agent-1/schedules/job-1/update`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-schedule-update-1"
        }),
        body: JSON.stringify({
          label: "Daily sync",
          cron: "0 10 * * *",
          prompt: "Sync later",
          enabled: false,
          timezone: "America/New_York",
          sessionKey: "dashboard:agent-1:schedule-1-updated"
        })
      }
    );
    expect(updateScheduleResponse.status).toBe(200);

    const runScheduleResponse = await fetch(
      `${baseUrl}/api/control/agents/agent-1/schedules/job-1/run`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-schedule-run-1"
        }),
        body: JSON.stringify({})
      }
    );
    expect(runScheduleResponse.status).toBe(200);

    const removeScheduleResponse = await fetch(
      `${baseUrl}/api/control/agents/agent-1/schedules/job-1/remove`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-schedule-remove-1"
        }),
        body: JSON.stringify({})
      }
    );
    expect(removeScheduleResponse.status).toBe(200);

    const updateHeartbeatResponse = await fetch(
      `${baseUrl}/api/control/agents/agent-1/heartbeat/update`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-heartbeat-update-1"
        }),
        body: JSON.stringify({
          workspaceId: "ws-1",
          every: "*/5 * * * *",
          session: "session-1",
          lightContext: true,
          prompt: "Ping"
        })
      }
    );
    expect(updateHeartbeatResponse.status).toBe(200);

    const configureMemoryResponse = await fetch(
      `${baseUrl}/api/control/agents/agent-1/memory/configure`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-memory-configure-1"
        }),
        body: JSON.stringify({
          workspaceId: "ws-1",
          scope: "conversation",
          provider: "openclaw-memory",
          secretRef: "secret://memory/default",
          conversationId: "conversation-1",
          model: "memory-pro",
          remote: { baseUrl: "https://memory.example.com" },
          apiKeyRef: "secret://memory/api-key"
        })
      }
    );
    expect(configureMemoryResponse.status).toBe(200);

    expect(runtimeAdapter.cron.list).toHaveBeenCalledWith({ agentId: "agent-1" });
    expect(runtimeAdapter.cron.runs).toHaveBeenCalledWith({
      agentId: "agent-1",
      scheduleId: "job-1"
    });
    expect(runtimeAdapter.cron.add).toHaveBeenCalledWith({
      agentId: "agent-1",
      label: "Daily sync",
      cron: "0 9 * * *",
      prompt: "Sync now",
      enabled: true,
      timezone: "Asia/Shanghai",
      sessionKey: "dashboard:agent-1:schedule-1"
    });
    expect(runtimeAdapter.cron.update).toHaveBeenCalledWith({
      agentId: "agent-1",
      scheduleId: "job-1",
      label: "Daily sync",
      cron: "0 10 * * *",
      prompt: "Sync later",
      enabled: false,
      timezone: "America/New_York",
      sessionKey: "dashboard:agent-1:schedule-1-updated"
    });
    expect(runtimeAdapter.cron.run).toHaveBeenCalledWith({
      agentId: "agent-1",
      scheduleId: "job-1"
    });
    expect(runtimeAdapter.cron.remove).toHaveBeenCalledWith({
      agentId: "agent-1",
      scheduleId: "job-1"
    });
    expect(runtimeAdapter.heartbeat.read).toHaveBeenCalledWith({ agentId: "agent-1" });
    expect(runtimeAdapter.heartbeat.configure).toHaveBeenCalledWith({
      agentId: "agent-1",
      workspaceId: "ws-1",
      every: "*/5 * * * *",
      session: "session-1",
      lightContext: true,
      prompt: "Ping"
    });
    expect(runtimeAdapter.memory.read).toHaveBeenCalledWith({ agentId: "agent-1" });
    expect(runtimeAdapter.memory.configure).toHaveBeenCalledWith({
      agentId: "agent-1",
      workspaceId: "ws-1",
      scope: "conversation",
      provider: "openclaw-memory",
      secretRef: "secret://memory/default",
      conversationId: "conversation-1",
      model: "memory-pro",
      remoteBaseUrl: "https://memory.example.com",
      apiKeyRef: "secret://memory/api-key"
    });
  });

  it("creates conversation without title using default 'New conversation'", async () => {
    const repositories = createFixtureRepositories();
    const runtimeAdapter = createRuntimeAdapter();
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const createResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-1")}/conversations/create`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-conversation-create-no-title-1"
        }),
        body: JSON.stringify({ workspaceId: "ws-1" })
      }
    );
    const createBody = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(createBody.ok).toBe(true);
    expect(createBody.conversation).toMatchObject({
      agentId: "agent-1",
      workspaceId: "ws-1",
      title: "New conversation",
      status: "active"
    });
  });

  it("updates title from default to first non-empty user message on send", async () => {
    const repositories = createFixtureRepositories();
    const runtimeAdapter = createRuntimeAdapter();
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const createResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-1")}/conversations/create`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-conversation-create-title-update-1"
        }),
        body: JSON.stringify({ workspaceId: "ws-1" })
      }
    );
    const createBody = await createResponse.json();
    expect(createBody.conversation.title).toBe("New conversation");

    const conversationId = createBody.conversation.id;

    const sendResponse = await fetch(
      `${baseUrl}/api/control/conversations/${encodeURIComponent(conversationId)}/messages/send`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-send-title-update-1"
        }),
        body: JSON.stringify({ content: "Hello, this is my first message to the assistant" })
      }
    );
    expect(sendResponse.status).toBe(200);

    const detailResponse = await fetch(
      `${baseUrl}/api/conversations/${encodeURIComponent(conversationId)}`,
      { headers: authorizedHeaders() }
    );
    const detailBody = await detailResponse.json();
    expect(detailBody.conversation.title).toBe("Hello, this is my first message to the assistant");
  });

  it("does not overwrite a non-default title on subsequent sends", async () => {
    const repositories = createFixtureRepositories();
    const runtimeAdapter = createRuntimeAdapter();
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const createResponse = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-1")}/conversations/create`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-conversation-create-persist-title-1"
        }),
        body: JSON.stringify({ workspaceId: "ws-1", title: "Custom Title" })
      }
    );
    const createBody = await createResponse.json();
    expect(createBody.conversation.title).toBe("Custom Title");

    const conversationId = createBody.conversation.id;

    const firstSendResponse = await fetch(
      `${baseUrl}/api/control/conversations/${encodeURIComponent(conversationId)}/messages/send`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-send-persist-title-1"
        }),
        body: JSON.stringify({ content: "First message should not change title" })
      }
    );
    expect(firstSendResponse.status).toBe(200);

    const secondSendResponse = await fetch(
      `${baseUrl}/api/control/conversations/${encodeURIComponent(conversationId)}/messages/send`,
      {
        method: "POST",
        headers: authorizedHeaders({
          "content-type": "application/json",
          "idempotency-key": "runtime-send-persist-title-2"
        }),
        body: JSON.stringify({ content: "Second message should also not change title" })
      }
    );
    expect(secondSendResponse.status).toBe(200);

    const detailResponse = await fetch(
      `${baseUrl}/api/conversations/${encodeURIComponent(conversationId)}`,
      { headers: authorizedHeaders() }
    );
    const detailBody = await detailResponse.json();
    expect(detailBody.conversation.title).toBe("Custom Title");
  });

  it("returns a safe validation error with request id when memory config is invalid", async () => {
    const repositories = createFixtureRepositories();
    const runtimeAdapter = createRuntimeAdapter({
      memory: {
        read: vi.fn(async ({ agentId }) => ({ memory: { agentId, bindings: [] } })),
        configure: vi.fn(async () => {
          throw {
            code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
            message: "secretRef must be a secret reference string or null"
          };
        })
      }
    });
    const server = await startServer({ repositories, openclawRuntimeAdapter: runtimeAdapter });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const response = await fetch(`${baseUrl}/api/control/agents/agent-1/memory/configure`, {
      method: "POST",
      headers: authorizedHeaders({
        "content-type": "application/json",
        "idempotency-key": "runtime-memory-invalid-1"
      }),
      body: JSON.stringify({
        workspaceId: "ws-1",
        scope: "conversation",
        provider: "openclaw-memory",
        secretRef: "",
        conversationId: "conversation-1"
      })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("OPENCLAW_MEMORY_SECRET_REF_REQUIRED");
    expect(typeof body.requestId).toBe("string");
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(repositories.events.listTimelineByWorkspace("ws-1")).toHaveLength(0);
  });
});
