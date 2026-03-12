import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App.js";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

type ConversationSummary = {
  id: string;
  agentId: string;
  workspaceId: string;
  sessionKey: string;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  lastMessageAt: string | null;
  messageCount?: number;
};

type ConversationMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  state: "pending" | "completed" | "failed";
  content: string;
  errorCode: string | null;
  externalMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ScheduleSummary = {
  id: string;
  agentId: string;
  workspaceId: string;
  label: string;
  cron: string;
  prompt: string;
  enabled: boolean;
  timezone?: string | null;
  sessionKey?: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ScheduleRun = {
  id: string;
  scheduleId: string;
  agentId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
};

type MemoryPluginConfig = {
  provider: string;
  model: string;
  remote: {
    baseUrl: string;
  };
  apiKeyRef: string | null;
  secretRef?: string | null;
};

type MemoryScopeSummary = {
  scope: "conversation" | "agent" | "system";
  namespace: string;
  retention: string;
  summary: string;
  readonly?: boolean;
  conversationId?: string | null;
  updatedAt?: string;
};

type MemoryState = {
  plugin: MemoryPluginConfig;
  scopes: MemoryScopeSummary[];
};

function createJsonResponse(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json"
      }
    })
  );
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createConversation(
  conversationId: string,
  title = "New conversation"
): ConversationSummary {
  return {
    id: conversationId,
    agentId: "agent-1",
    workspaceId: "ws-1",
    sessionKey: `dashboard:agent-1:${conversationId}`,
    title,
    status: "active",
    createdAt: "2026-03-10T00:00:00.000Z",
    updatedAt: "2026-03-10T00:00:00.000Z",
    archivedAt: null,
    lastMessageAt: null,
    messageCount: 0
  };
}

function createSchedule(jobId: string, overrides?: Partial<ScheduleSummary>): ScheduleSummary {
  return {
    id: jobId,
    agentId: "agent-1",
    workspaceId: "ws-1",
    label: "Daily sync",
    cron: "0 9 * * *",
    prompt: "Sync now",
    enabled: true,
    nextRunAt: "2026-03-11T09:00:00.000Z",
    lastRunAt: "2026-03-10T09:00:00.000Z",
    createdAt: "2026-03-10T08:00:00.000Z",
    updatedAt: "2026-03-10T08:00:00.000Z",
    ...overrides
  };
}

function createScheduleRun(runId: string, scheduleId: string): ScheduleRun {
  return {
    id: runId,
    scheduleId,
    agentId: "agent-1",
    status: "succeeded",
    startedAt: "2026-03-10T09:00:00.000Z",
    finishedAt: "2026-03-10T09:00:03.000Z",
    errorCode: null
  };
}

function createMemoryState(overrides?: Partial<MemoryState>): MemoryState {
  return {
    plugin: {
      provider: "openclaw-memory",
      model: "memory-default",
      remote: {
        baseUrl: "https://memory.example.com"
      },
      apiKeyRef: "secret://memory/default",
      secretRef: "secret://memory/default"
    },
    scopes: [
      {
        scope: "conversation",
        namespace: "conversation:conversation-1",
        retention: "7 days",
        summary: "Bound to the active thread.",
        conversationId: "conversation-1",
        updatedAt: "2026-03-10T00:00:00.000Z"
      },
      {
        scope: "agent",
        namespace: "agent:agent-1",
        retention: "30 days",
        summary: "Shared across agent runs.",
        updatedAt: "2026-03-10T00:00:00.000Z"
      },
      {
        scope: "system",
        namespace: "system:managed",
        retention: "daemon policy",
        summary: "Read-only defaults managed by the daemon.",
        readonly: true,
        updatedAt: "2026-03-10T00:00:00.000Z"
      }
    ],
    ...overrides
  };
}

function createMemoryBindings(memory: MemoryState) {
  return memory.scopes.map((scope, index) => ({
    id: `binding-${index + 1}`,
    agentId: "agent-1",
    workspaceId: "ws-1",
    scope: scope.scope,
    provider: memory.plugin.provider,
    secretRef: memory.plugin.apiKeyRef,
    conversationId: scope.conversationId ?? null,
    updatedAt: scope.updatedAt ?? "2026-03-10T00:00:00.000Z"
  }));
}

function installRuntimeFetchMock(options?: {
  sendGate?: Deferred<void>;
  failSend?: boolean;
  failMessage?: string;
  schedules?: ScheduleSummary[];
  scheduleRuns?: Record<string, ScheduleRun[]>;
  heartbeat?: {
    workspaceId?: string;
    every: string;
    session: string;
    lightContext: boolean;
    prompt: string;
  } | null;
  failHeartbeat?: boolean;
  memory?: MemoryState;
  failMemory?: boolean;
  failMemoryMessage?: string;
}) {
  const conversations: ConversationSummary[] = [createConversation("conversation-1")];
  const messageStore = new Map<string, ConversationMessage[]>();
  messageStore.set("conversation-1", []);
  let nextConversationIndex = 2;
  let schedules: ScheduleSummary[] = options?.schedules ?? [createSchedule("job-1")];
  let scheduleRunsByJob: Record<string, ScheduleRun[]> = options?.scheduleRuns ?? {
    "job-1": [createScheduleRun("run-1", "job-1")]
  };
  let nextScheduleIndex = 2;
  let nextRunIndex = 2;
  let heartbeat =
    options?.heartbeat ??
    ({
      workspaceId: "ws-1",
      every: "*/10 * * * *",
      session: "session-1",
      lightContext: true,
      prompt: "Ping"
    } as const);
  let memory = options?.memory ?? createMemoryState();

  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl.startsWith("/api/auth/check")) {
        return createJsonResponse(200, { ok: true, authorized: true });
      }

      if (requestUrl === "/api/agents") {
        expect(init?.headers).toMatchObject({ authorization: "Bearer dev-token" });
        return createJsonResponse(200, {
          items: [
            {
              id: "agent-1",
              name: "Alpha",
              role: "worker",
              workspacePath: "/workspace/alpha",
              status: "idle",
              updatedAt: "2026-03-10T00:00:00.000Z"
            }
          ]
        });
      }

      if (requestUrl === "/api/agents/agent-1/status") {
        return createJsonResponse(200, {
          status: "idle",
          updatedAt: "2026-03-10T00:00:00.000Z"
        });
      }

      if (requestUrl.startsWith("/api/events")) {
        return createJsonResponse(200, {
          items: [
            {
              id: "event-conversation-1-send",
              source: "daemon",
              sessionId: null,
              taskId: null,
              workspaceId: "ws-1",
              level: "info",
              kind: "control.agent-runtime.messages.send",
              payload: {
                request: {
                  content: "Hello runtime"
                },
                response: {
                  status: 200,
                  body: {
                    conversationId: "conversation-1"
                  }
                }
              },
              createdAt: "2026-03-10T00:00:02.000Z",
              dedupeKey: "control.agent-runtime.messages.send:sample"
            }
          ],
          nextCursor: null,
          limit: 120
        });
      }

      if (requestUrl.startsWith("/api/conversations/") && requestUrl.includes("/timeline")) {
        const conversationId = requestUrl
          .replace("/api/conversations/", "")
          .replace(/\/timeline(?:\?.*)?$/, "");
        return createJsonResponse(200, {
          items: [
            {
              id: `event-${conversationId}-send`,
              source: "daemon",
              sessionId: null,
              taskId: null,
              workspaceId: "ws-1",
              level: "info",
              kind: "control.agent-runtime.messages.send",
              payload: {
                request: {
                  content: "Hello runtime"
                },
                response: {
                  status: 200,
                  body: {
                    conversationId
                  }
                }
              },
              createdAt: "2026-03-10T00:00:02.000Z",
              dedupeKey: `control.agent-runtime.messages.send:${conversationId}`
            }
          ],
          limit: 120,
          conversationId
        });
      }

      if (requestUrl === "/api/control/arm" && init?.method === "POST") {
        return createJsonResponse(200, { ok: true });
      }

      if (requestUrl === "/api/agents/agent-1/conversations") {
        return createJsonResponse(200, { items: conversations });
      }

      if (
        requestUrl === "/api/control/agents/agent-1/conversations/create" &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(String(init.body ?? "{}")) as {
          title?: string;
          workspaceId?: string;
        };
        const id = `conversation-${nextConversationIndex++}`;
        const created = createConversation(
          id,
          typeof body.title === "string" ? body.title : "New conversation"
        );
        created.workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "ws-1";
        conversations.unshift(created);
        messageStore.set(id, []);
        return createJsonResponse(200, { ok: true, conversation: created });
      }

      if (requestUrl.startsWith("/api/conversations/") && !requestUrl.endsWith("/messages")) {
        const conversationId = requestUrl.replace("/api/conversations/", "");
        const conversation = conversations.find((item) => item.id === conversationId);
        if (!conversation) {
          return createJsonResponse(404, { code: "CONVERSATION_NOT_FOUND" });
        }

        return createJsonResponse(200, { conversation });
      }

      if (
        requestUrl.startsWith("/api/control/conversations/") &&
        requestUrl.endsWith("/archive") &&
        init?.method === "POST"
      ) {
        const conversationId = requestUrl
          .replace("/api/control/conversations/", "")
          .replace("/archive", "");
        const conversationIndex = conversations.findIndex((item) => item.id === conversationId);
        if (conversationIndex === -1) {
          return createJsonResponse(404, { code: "CONVERSATION_NOT_FOUND" });
        }

        conversations[conversationIndex] = {
          ...conversations[conversationIndex],
          status: "archived",
          archivedAt: new Date().toISOString()
        };

        return createJsonResponse(200, { ok: true });
      }

      if (requestUrl.startsWith("/api/conversations/") && requestUrl.endsWith("/messages")) {
        const conversationId = requestUrl
          .replace("/api/conversations/", "")
          .replace("/messages", "");
        const items = messageStore.get(conversationId) ?? [];
        return createJsonResponse(200, { items: [...items] });
      }

      if (
        requestUrl.startsWith("/api/control/conversations/") &&
        requestUrl.endsWith("/messages/send") &&
        init?.method === "POST"
      ) {
        const conversationId = requestUrl
          .replace("/api/control/conversations/", "")
          .replace("/messages/send", "");
        const body = JSON.parse(String(init.body ?? "{}")) as { content?: string };
        const now = "2026-03-10T00:00:01.000Z";
        const userMessage: ConversationMessage = {
          id: `user-${conversationId}-${Date.now()}`,
          conversationId,
          role: "user",
          state: "completed",
          content: body.content ?? "",
          errorCode: null,
          externalMessageId: null,
          createdAt: now,
          updatedAt: now
        };
        const assistantMessage: ConversationMessage = {
          id: `assistant-${conversationId}-${Date.now()}`,
          conversationId,
          role: "assistant",
          state: options?.failSend ? "failed" : "completed",
          content: options?.failSend
            ? (options.failMessage ?? "Adapter unavailable")
            : `assistant:${body.content ?? ""}`,
          errorCode: options?.failSend ? "OPENCLAW_RUNTIME_ERROR" : null,
          externalMessageId: null,
          createdAt: now,
          updatedAt: now
        };

        const runReply = async () => {
          if (options?.sendGate) {
            await options.sendGate.promise;
          }

          const existing = messageStore.get(conversationId) ?? [];
          messageStore.set(conversationId, [...existing, userMessage, assistantMessage]);

          if (options?.failSend) {
            return createJsonResponse(502, {
              code: "OPENCLAW_RUNTIME_ERROR",
              message: options.failMessage ?? "Adapter unavailable"
            });
          }

          return createJsonResponse(200, {
            ok: true,
            conversationId,
            userMessage,
            assistantMessage
          });
        };

        return runReply();
      }

      // Schedules endpoints
      if (requestUrl === "/api/agents/agent-1/schedules") {
        return createJsonResponse(200, { items: schedules });
      }

      if (
        requestUrl === "/api/control/agents/agent-1/schedules/create" &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(String(init.body ?? "{}")) as {
          label?: string;
          name?: string;
          cron?: string;
          prompt?: string;
          message?: string;
          enabled?: boolean;
          workspaceId?: string;
        };
        const id = `job-${nextScheduleIndex++}`;
        const created: ScheduleSummary = {
          id,
          agentId: "agent-1",
          workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "ws-1",
          label: typeof body.label === "string" ? body.label : (body.name ?? "New Schedule"),
          cron: typeof body.cron === "string" ? body.cron : "0 0 * * *",
          prompt:
            typeof body.prompt === "string"
              ? body.prompt
              : typeof body.message === "string"
                ? body.message
                : "",
          enabled: body.enabled ?? true,
          nextRunAt: null,
          lastRunAt: null,
          createdAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-03-10T00:00:00.000Z"
        };
        schedules = [created, ...schedules];
        scheduleRunsByJob[id] = [];
        return createJsonResponse(200, { ok: true, jobId: id });
      }

      if (
        requestUrl.match(/\/api\/control\/agents\/agent-1\/schedules\/[^/]+\/run/) &&
        init?.method === "POST"
      ) {
        const match = /\/api\/control\/agents\/agent-1\/schedules\/([^/]+)\/run/.exec(requestUrl);
        const scheduleId = match?.[1] ?? "";
        const runId = `run-${nextRunIndex++}`;
        const run = createScheduleRun(runId, scheduleId);
        scheduleRunsByJob[scheduleId] = [run, ...(scheduleRunsByJob[scheduleId] ?? [])];
        return createJsonResponse(200, { ok: true, runId });
      }

      if (requestUrl.match(/\/api\/agents\/agent-1\/schedules\/[^/]+\/runs(\?.*)?$/)) {
        const match = /\/api\/agents\/agent-1\/schedules\/([^/]+)\/runs/.exec(requestUrl);
        const scheduleId = match?.[1] ?? "";
        return createJsonResponse(200, { items: scheduleRunsByJob[scheduleId] ?? [] });
      }

      // Heartbeat endpoints
      if (requestUrl === "/api/agents/agent-1/heartbeat") {
        if (!heartbeat) {
          return createJsonResponse(200, { heartbeat: null });
        }

        return createJsonResponse(200, {
          heartbeat: {
            agentId: "agent-1",
            workspaceId: heartbeat.workspaceId ?? "ws-1",
            enabled: true,
            every: heartbeat.every,
            session: heartbeat.session,
            lightContext: heartbeat.lightContext,
            prompt: heartbeat.prompt,
            lastBeatAt: null,
            nextBeatAt: null,
            updatedAt: "2026-03-10T00:00:00.000Z"
          }
        });
      }

      if (
        requestUrl === "/api/control/agents/agent-1/heartbeat/update" &&
        init?.method === "POST"
      ) {
        if (options?.failHeartbeat) {
          return createJsonResponse(400, {
            message: "Invalid heartbeat configuration"
          });
        }

        const body = JSON.parse(String(init.body ?? "{}")) as {
          workspaceId?: string;
          every?: string;
          session?: string;
          lightContext?: boolean;
          prompt?: string;
        };
        heartbeat = {
          workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "ws-1",
          every: typeof body.every === "string" ? body.every : "*/10 * * * *",
          session: typeof body.session === "string" ? body.session : "session-1",
          lightContext: typeof body.lightContext === "boolean" ? body.lightContext : false,
          prompt: typeof body.prompt === "string" ? body.prompt : ""
        };
        return createJsonResponse(200, {
          heartbeat: {
            agentId: "agent-1",
            workspaceId: heartbeat.workspaceId,
            enabled: true,
            every: heartbeat.every,
            session: heartbeat.session,
            lightContext: heartbeat.lightContext,
            prompt: heartbeat.prompt,
            lastBeatAt: null,
            nextBeatAt: null,
            updatedAt: "2026-03-10T00:00:00.000Z"
          }
        });
      }

      // Memory endpoints
      if (requestUrl === "/api/agents/agent-1/memory") {
        return createJsonResponse(200, {
          memory: {
            agentId: "agent-1",
            plugin: memory.plugin,
            bindings: createMemoryBindings(memory),
            scopes: memory.scopes
          }
        });
      }

      if (
        requestUrl === "/api/control/agents/agent-1/memory/configure" &&
        init?.method === "POST"
      ) {
        if (options?.failMemory) {
          return createJsonResponse(400, {
            code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
            message: options.failMemoryMessage ?? "apiKeyRef must reference a secret"
          });
        }

        const body = JSON.parse(String(init.body ?? "{}")) as {
          scope?: string;
          provider?: string;
          model?: string;
          remote?: { baseUrl?: string };
          apiKeyRef?: string | null;
          secretRef?: string | null;
          conversationId?: string | null;
        };
        const scope = body.scope === "conversation" ? "conversation" : "agent";
        const apiKeyRef =
          typeof body.apiKeyRef === "string"
            ? body.apiKeyRef
            : typeof body.secretRef === "string"
              ? body.secretRef
              : null;
        memory = {
          plugin: {
            provider: typeof body.provider === "string" ? body.provider : memory.plugin.provider,
            model: typeof body.model === "string" ? body.model : memory.plugin.model,
            remote: {
              baseUrl:
                typeof body.remote?.baseUrl === "string"
                  ? body.remote.baseUrl
                  : memory.plugin.remote.baseUrl
            },
            apiKeyRef,
            secretRef: apiKeyRef
          },
          scopes: memory.scopes.map((entry) =>
            entry.scope !== scope
              ? entry
              : {
                  ...entry,
                  summary:
                    scope === "conversation"
                      ? `Uses ${typeof body.provider === "string" ? body.provider : memory.plugin.provider} for conversation memory.`
                      : `Uses ${typeof body.provider === "string" ? body.provider : memory.plugin.provider} / ${typeof body.model === "string" ? body.model : memory.plugin.model}.`,
                  conversationId:
                    typeof body.conversationId === "string"
                      ? body.conversationId
                      : entry.conversationId,
                  updatedAt: "2026-03-10T00:05:00.000Z"
                }
          )
        };

        return createJsonResponse(200, {
          ok: true,
          binding: {
            scope,
            provider: memory.plugin.provider,
            secretRef: memory.plugin.apiKeyRef,
            conversationId: scope === "conversation" ? (body.conversationId ?? null) : null
          }
        });
      }

      return Promise.reject(new Error(`Unhandled fetch URL: ${requestUrl}`));
    });

  return { fetchMock };
}

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("agent runtime routes", () => {
  it("redirects unauthenticated users to /login", async () => {
    window.history.pushState({}, "", "/agents/agent-1/runtime");

    render(<App />);

    expect(await screen.findByTestId("daemon-token-input")).toBeTruthy();
    expect(window.location.pathname).toBe("/login");
  });

  it("renders zh-CN workspace leftovers and runtime shell labels", async () => {
    installRuntimeFetchMock({ schedules: [], scheduleRuns: {} });
    localStorage.setItem("dashboard.locale", "zh-CN");

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect((await screen.findByTestId("agent-workspace-title")).textContent).toContain(
      "代理工作区"
    );

    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    expect((await screen.findByTestId("runtime-page-title")).textContent).toContain("代理运行时");
    expect(screen.getByTestId("agent-runtime-tab-conversations").textContent).toBe("对话");
    expect(screen.getByText("此代理的对话线程会显示在这里。")).toBeTruthy();
    expect(screen.getByTestId("new-conversation-button").textContent).toContain("新建对话");

    fireEvent.click(screen.getByTestId("schedules-tab"));
    expect(await screen.findByTestId("agent-runtime-panel-schedules")).toBeTruthy();
    expect(screen.getByTestId("schedules-tab").textContent).toBe("定时任务");
    expect(screen.getByTestId("new-schedule-button").textContent).toBe("新建计划");
    expect(screen.getByText("暂无计划。")).toBeTruthy();

    fireEvent.click(screen.getByTestId("heartbeat-tab"));
    expect(await screen.findByTestId("agent-runtime-panel-heartbeat")).toBeTruthy();
    expect(screen.getByText("间隔")).toBeTruthy();
    expect(screen.getByTestId("heartbeat-save-button").textContent).toBe("保存心跳配置");

    fireEvent.click(screen.getByTestId("memory-tab"));
    expect(await screen.findByTestId("agent-runtime-panel-memory")).toBeTruthy();
    expect(screen.getByText("当前插件槽位")).toBeTruthy();
    expect(screen.getByTestId("memory-save-button").textContent).toBe("保存记忆配置");
    expect(screen.getByTestId("memory-scope-row-agent").textContent).toContain("代理");
  });

  it("opens runtime from dashboard, creates a conversation, and sends a successful message", async () => {
    const sendGate = createDeferred<void>();
    installRuntimeFetchMock({ sendGate });

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    expect(await screen.findByTestId("runtime-page-title")).toBeTruthy();
    expect(await screen.findByTestId("conversation-list")).toBeTruthy();

    fireEvent.click(screen.getByTestId("new-conversation-button"));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/agents/agent-1/runtime/conversations/conversation-2");
    });

    const input = screen.getByTestId("conversation-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hello runtime" } });
    fireEvent.click(screen.getByTestId("send-message-button"));

    const thread = screen.getByTestId("conversation-thread");
    expect(await within(thread).findByText("pending")).toBeTruthy();

    sendGate.resolve();

    expect(await screen.findByText("completed")).toBeTruthy();
    expect(await screen.findByText("assistant:Hello runtime")).toBeTruthy();
    expect(screen.queryByTestId("conversation-error-banner")).toBeNull();
  });

  it("keeps draft and shows error banner when send fails", async () => {
    installRuntimeFetchMock({ failSend: true, failMessage: "Adapter unavailable" });

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    expect(await screen.findByTestId("conversation-list")).toBeTruthy();
    fireEvent.click(screen.getByTestId("conversation-row-conversation-1"));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/agents/agent-1/runtime/conversations/conversation-1");
    });

    const input = await screen.findByTestId("conversation-input");
    fireEvent.change(input, { target: { value: "Please fail" } });
    fireEvent.click(screen.getByTestId("send-message-button"));

    const banner = await screen.findByTestId("conversation-error-banner");
    expect(banner.textContent).toContain("Adapter unavailable");
    expect((screen.getByTestId("conversation-input") as HTMLTextAreaElement).value).toBe(
      "Please fail"
    );
    expect(await screen.findByText("failed")).toBeTruthy();
  });

  it("switches to detailed view and shows conversation timeline rows", async () => {
    installRuntimeFetchMock({});

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    expect(await screen.findByTestId("conversation-list")).toBeTruthy();
    fireEvent.click(screen.getByTestId("conversation-row-conversation-1"));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/agents/agent-1/runtime/conversations/conversation-1");
    });

    fireEvent.click(screen.getByTestId("conversation-view-detailed-button"));

    expect(await screen.findByText("control.agent-runtime.messages.send")).toBeTruthy();
    expect(screen.getByText("Hello runtime")).toBeTruthy();
  });

  it("does not leak unsent draft text when switching to an archived conversation", async () => {
    installRuntimeFetchMock({});

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    expect(await screen.findByTestId("conversation-list")).toBeTruthy();

    fireEvent.click(screen.getByTestId("new-conversation-button"));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/agents/agent-1/runtime/conversations/conversation-2");
    });

    fireEvent.click(await screen.findByTestId("archive-conversation-button"));

    await waitFor(() => {
      expect(screen.getByTestId("conversation-row-conversation-2").textContent).toContain(
        "archived"
      );
    });

    fireEvent.click(screen.getByTestId("conversation-row-conversation-1"));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/agents/agent-1/runtime/conversations/conversation-1");
    });

    const conversationInput = screen.getByTestId("conversation-input") as HTMLTextAreaElement;
    fireEvent.change(conversationInput, { target: { value: "draft scoped to conversation A" } });
    expect(conversationInput.value).toBe("draft scoped to conversation A");

    fireEvent.click(screen.getByTestId("conversation-row-conversation-2"));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/agents/agent-1/runtime/conversations/conversation-2");
    });

    const archivedConversationInput = screen.getByTestId(
      "conversation-input"
    ) as HTMLTextAreaElement;
    expect(archivedConversationInput.disabled).toBe(true);
    expect(archivedConversationInput.value).toBe("");
  });

  it("schedules success flow: creates schedule, runs schedule, and shows run history", async () => {
    installRuntimeFetchMock({ schedules: [], scheduleRuns: {} });

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    expect(await screen.findByTestId("runtime-page-title")).toBeTruthy();

    // Navigate to schedules tab
    fireEvent.click(screen.getByTestId("schedules-tab"));
    expect(await screen.findByTestId("agent-runtime-panel-schedules")).toBeTruthy();

    // Click new schedule button
    fireEvent.click(screen.getByTestId("new-schedule-button"));

    // Fill in schedule form
    const nameInput = screen.getByTestId("schedule-name-input");
    fireEvent.change(nameInput, { target: { value: "Test Schedule" } });

    const cronInput = screen.getByTestId("schedule-cron-input");
    fireEvent.change(cronInput, { target: { value: "0 9 * * *" } });

    const messageInput = screen.getByTestId("schedule-message-input");
    fireEvent.change(messageInput, { target: { value: "Run daily sync" } });

    // Create the schedule
    fireEvent.click(screen.getByTestId("create-schedule-button"));

    // Wait for schedule row to appear
    const scheduleRow = await screen.findByTestId("schedule-row-job-2");
    expect(scheduleRow).toBeTruthy();
    expect(scheduleRow.textContent).toContain("Test Schedule");

    // Run the schedule
    fireEvent.click(screen.getByTestId("schedule-run-button-job-2"));

    expect(await screen.findByText("run-2")).toBeTruthy();
    expect(await screen.findByText("succeeded")).toBeTruthy();
  });

  it("heartbeat illegal input: shows error when session is empty or every is invalid", async () => {
    const { fetchMock } = installRuntimeFetchMock({});

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    expect(await screen.findByTestId("runtime-page-title")).toBeTruthy();

    // Navigate to heartbeat tab
    fireEvent.click(screen.getByTestId("heartbeat-tab"));
    expect(await screen.findByTestId("agent-runtime-panel-heartbeat")).toBeTruthy();

    // Wait for heartbeat inputs to be available
    const everyInput = await screen.findByTestId("heartbeat-every-input");
    const sessionInput = await screen.findByTestId("heartbeat-session-input");

    // Test 1: Empty session should show inline error
    fireEvent.change(everyInput, { target: { value: "*/10 * * * *" } });
    fireEvent.change(sessionInput, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("heartbeat-save-button"));

    // Check for inline session error
    await waitFor(() => {
      const panel = screen.getByTestId("agent-runtime-panel-heartbeat");
      expect(panel.textContent).toContain("Session is required");
    });

    // Test 2: Invalid every format should show inline error
    fireEvent.change(everyInput, { target: { value: "invalid" } });
    fireEvent.change(sessionInput, { target: { value: "test-session" } });
    fireEvent.click(screen.getByTestId("heartbeat-save-button"));

    // Check for inline every/cron error
    await waitFor(() => {
      const panel = screen.getByTestId("agent-runtime-panel-heartbeat");
      expect(panel.textContent).toContain("Every must contain five");
    });

    const heartbeatUpdateCalls = fetchMock.mock.calls.filter(([request]) => {
      const requestUrl = typeof request === "string" ? request : request.toString();
      return requestUrl === "/api/control/agents/agent-1/heartbeat/update";
    });
    expect(heartbeatUpdateCalls).toHaveLength(0);
  });

  it("memory success flow: saves single plugin config and refreshes scope rows", async () => {
    const { fetchMock } = installRuntimeFetchMock({
      memory: createMemoryState({
        plugin: {
          provider: "openclaw-memory",
          model: "memory-v1",
          remote: { baseUrl: "https://memory.old.example.com" },
          apiKeyRef: "secret://memory/old",
          secretRef: "secret://memory/old"
        }
      })
    });

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    fireEvent.click(await screen.findByTestId("memory-tab"));

    expect(await screen.findByTestId("memory-provider-input")).toBeTruthy();
    expect(screen.getByTestId("memory-scope-row-agent").textContent).toContain(
      "Shared across agent runs."
    );

    fireEvent.change(screen.getByTestId("memory-provider-input"), {
      target: { value: "openai" }
    });
    fireEvent.change(screen.getByTestId("memory-model-input"), {
      target: { value: "gpt-4.1-mini" }
    });
    fireEvent.change(screen.getByTestId("memory-base-url-input"), {
      target: { value: "https://memory.new.example.com" }
    });
    fireEvent.change(screen.getByTestId("memory-api-key-ref-input"), {
      target: { value: "secret://memory/new" }
    });

    fireEvent.click(screen.getByTestId("memory-save-button"));

    await waitFor(() => {
      expect(screen.getByTestId("memory-scope-row-agent").textContent).toContain("openai");
    });
    expect(screen.getByTestId("memory-scope-row-agent").textContent).toContain("gpt-4.1-mini");
    expect(screen.queryByTestId("memory-error-banner")).toBeNull();

    const armCallIndex = fetchMock.mock.calls.findIndex(([request]) => {
      const requestUrl = typeof request === "string" ? request : request.toString();
      return requestUrl === "/api/control/arm";
    });
    const memoryCallIndex = fetchMock.mock.calls.findIndex(([request]) => {
      const requestUrl = typeof request === "string" ? request : request.toString();
      return requestUrl === "/api/control/agents/agent-1/memory/configure";
    });

    expect(armCallIndex).toBeGreaterThanOrEqual(0);
    expect(memoryCallIndex).toBeGreaterThan(armCallIndex);

    const memoryCall = fetchMock.mock.calls[memoryCallIndex];
    const memoryRequest = JSON.parse(String(memoryCall?.[1]?.body ?? "{}"));
    expect(memoryRequest).toMatchObject({
      scope: "agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      remote: {
        baseUrl: "https://memory.new.example.com"
      },
      apiKeyRef: "secret://memory/new",
      secretRef: "secret://memory/new"
    });
  });

  it("memory invalid config: blocks submission when apiKeyRef does not start with secret://", async () => {
    const { fetchMock } = installRuntimeFetchMock({});

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    fireEvent.click(await screen.findByTestId("memory-tab"));
    expect(await screen.findByTestId("memory-provider-input")).toBeTruthy();

    // Try to save with invalid apiKeyRef (not starting with secret://)
    fireEvent.change(screen.getByTestId("memory-api-key-ref-input"), {
      target: { value: "invalid-key" }
    });
    fireEvent.click(screen.getByTestId("memory-save-button"));

    // Should show inline validation error
    await waitFor(() => {
      const panel = screen.getByTestId("agent-runtime-panel-memory");
      expect(panel.textContent).toContain("API Key Ref must start with 'secret://'");
    });

    // Memory configure request should NOT be made
    const memoryConfigureCalls = fetchMock.mock.calls.filter(([request]) => {
      const requestUrl = typeof request === "string" ? request : request.toString();
      return requestUrl === "/api/control/agents/agent-1/memory/configure";
    });
    expect(memoryConfigureCalls).toHaveLength(0);
  });

  it("archives conversation successfully and blocks further messaging", async () => {
    const { fetchMock } = installRuntimeFetchMock({});

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("agent-runtime-link-agent-1"));

    expect(await screen.findByTestId("conversation-list")).toBeTruthy();
    fireEvent.click(screen.getByTestId("conversation-row-conversation-1"));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/agents/agent-1/runtime/conversations/conversation-1");
    });

    // Archive button should be visible
    const archiveButton = await screen.findByTestId("archive-conversation-button");
    expect(archiveButton).toBeTruthy();
    expect(archiveButton.textContent).toBe("Archive");

    // Click archive button
    fireEvent.click(archiveButton);

    // Wait for archive to complete
    await waitFor(() => {
      expect(screen.getByTestId("conversation-row-conversation-1").textContent).toContain(
        "archived"
      );
    });

    // Verify archive API was called with arm writes before it
    const armCallIndex = fetchMock.mock.calls.findIndex(([request]) => {
      const requestUrl = typeof request === "string" ? request : request.toString();
      return requestUrl === "/api/control/arm";
    });
    const archiveCallIndex = fetchMock.mock.calls.findIndex(([request]) => {
      const requestUrl = typeof request === "string" ? request : request.toString();
      return requestUrl === "/api/control/conversations/conversation-1/archive";
    });

    expect(armCallIndex).toBeGreaterThanOrEqual(0);
    expect(archiveCallIndex).toBeGreaterThan(armCallIndex);

    // Message input should be disabled
    const messageInput = screen.getByTestId("conversation-input");
    expect((messageInput as HTMLTextAreaElement).disabled).toBe(true);

    // Send button should not be present (archive button is gone, only shows when not archived)
    expect(screen.queryByTestId("archive-conversation-button")).toBeNull();

    // Should show archived notice
    expect(screen.getByText("This conversation has been archived.")).toBeTruthy();
  });
});
