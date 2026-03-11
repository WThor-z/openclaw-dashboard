import path from "node:path";

import { expect, test } from "@playwright/test";

const SCREENSHOT_PATH = path.join(
  ".sisyphus",
  "evidence",
  "openclaw-agent-runtime",
  "task-9-agent-runtime.png"
);
const LOGIN_TOKEN = process.env.E2E_LOGIN_TOKEN ?? "dev-token";

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
  messageCount: number;
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

type HeartbeatSummary = {
  agentId: string;
  workspaceId: string;
  enabled: boolean;
  every: string;
  session: string;
  lightContext: boolean;
  prompt: string;
  lastBeatAt: string | null;
  nextBeatAt: string | null;
  updatedAt: string;
};

type MemoryState = {
  agentId: string;
  workspaceId: string;
  plugin: {
    provider: string;
    model: string;
    remote: {
      baseUrl: string;
    };
    apiKeyRef: string | null;
    secretRef: string | null;
  };
  bindings: Array<{
    id: string;
    agentId: string;
    workspaceId: string;
    scope: "conversation" | "agent" | "system";
    provider: string;
    secretRef: string | null;
    conversationId: string | null;
    updatedAt: string;
  }>;
  scopes: Array<{
    scope: "conversation" | "agent" | "system";
    namespace: string;
    retention: string;
    summary: string;
    readonly?: boolean;
    conversationId?: string | null;
    updatedAt?: string;
  }>;
};

test("logs in and completes the agent runtime flow", async ({ page }) => {
  let conversationCount = 0;
  let messageCount = 0;
  let scheduleCount = 0;
  let scheduleRunCount = 0;
  let armCallCount = 0;
  let lastHeartbeatUpdate: Record<string, unknown> | null = null;

  const conversations: ConversationSummary[] = [];
  const messagesByConversation = new Map<string, ConversationMessage[]>();
  const schedules: ScheduleSummary[] = [];
  const scheduleRunsById = new Map<string, ScheduleRun[]>();
  const heartbeat: HeartbeatSummary = {
    agentId: "agent-1",
    workspaceId: "ws-1",
    enabled: true,
    every: "*/10 * * * *",
    session: "session-1",
    lightContext: true,
    prompt: "Ping",
    lastBeatAt: null,
    nextBeatAt: null,
    updatedAt: "2026-03-10T00:00:00.000Z"
  };
  const memory: MemoryState = {
    agentId: "agent-1",
    workspaceId: "ws-1",
    plugin: {
      provider: "openclaw-memory",
      model: "memory-default",
      remote: {
        baseUrl: "https://memory.example.com"
      },
      apiKeyRef: "secret://memory/default",
      secretRef: "secret://memory/default"
    },
    bindings: [
      {
        id: "binding-agent",
        agentId: "agent-1",
        workspaceId: "ws-1",
        scope: "agent",
        provider: "openclaw-memory",
        secretRef: "secret://memory/default",
        conversationId: null,
        updatedAt: "2026-03-10T00:00:00.000Z"
      }
    ],
    scopes: [
      {
        scope: "conversation",
        namespace: "conversation:inactive",
        retention: "Per conversation",
        summary: "Open a conversation to attach conversation memory.",
        conversationId: null,
        updatedAt: "2026-03-10T00:00:00.000Z"
      },
      {
        scope: "agent",
        namespace: "agent:agent-1",
        retention: "Agent lifetime",
        summary: "Shared across agent runs.",
        updatedAt: "2026-03-10T00:00:00.000Z"
      },
      {
        scope: "system",
        namespace: "system:managed",
        retention: "Daemon policy",
        summary: "Read-only defaults managed by the daemon.",
        readonly: true,
        updatedAt: "2026-03-10T00:00:00.000Z"
      }
    ]
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const { pathname, searchParams } = requestUrl;
    const method = request.method();

    if (pathname === "/api/auth/check") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, authorized: true })
      });
      return;
    }

    if (pathname === "/api/agents") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
        })
      });
      return;
    }

    if (pathname === "/api/agents/agent-1/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "idle", updatedAt: "2026-03-10T00:00:00.000Z" })
      });
      return;
    }

    if (pathname === "/api/control/arm" && method === "POST") {
      armCallCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, armed: true })
      });
      return;
    }

    if (pathname === "/api/agents/agent-1/conversations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: conversations })
      });
      return;
    }

    if (pathname === "/api/control/agents/agent-1/conversations/create" && method === "POST") {
      conversationCount += 1;
      const payload = request.postDataJSON() as { workspaceId?: string; title?: string };
      const conversationId = `conversation-${conversationCount}`;
      const createdAt = "2026-03-10T00:00:00.000Z";
      const conversation: ConversationSummary = {
        id: conversationId,
        agentId: "agent-1",
        workspaceId:
          typeof payload.workspaceId === "string" && payload.workspaceId.length > 0
            ? payload.workspaceId
            : "ws-1",
        sessionKey: `dashboard:agent-1:${conversationId}`,
        title:
          typeof payload.title === "string" && payload.title.length > 0
            ? payload.title
            : "New conversation",
        status: "active",
        createdAt,
        updatedAt: createdAt,
        archivedAt: null,
        lastMessageAt: null,
        messageCount: 0
      };
      conversations.unshift(conversation);
      messagesByConversation.set(conversationId, []);
      memory.scopes = memory.scopes.map((scope) =>
        scope.scope !== "conversation"
          ? scope
          : {
              ...scope,
              namespace: `conversation:${conversationId}`,
              summary: "Bound to the active thread.",
              conversationId,
              updatedAt: createdAt
            }
      );

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, conversation })
      });
      return;
    }

    if (pathname.startsWith("/api/conversations/") && !pathname.endsWith("/messages")) {
      const conversationId = pathname.replace("/api/conversations/", "");
      const conversation = conversations.find((entry) => entry.id === conversationId);
      await route.fulfill({
        status: conversation ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(conversation ? { conversation } : { code: "CONVERSATION_NOT_FOUND" })
      });
      return;
    }

    if (pathname.startsWith("/api/conversations/") && pathname.endsWith("/messages")) {
      const conversationId = pathname.replace("/api/conversations/", "").replace("/messages", "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: messagesByConversation.get(conversationId) ?? [] })
      });
      return;
    }

    if (pathname.startsWith("/api/control/conversations/") && pathname.endsWith("/messages/send")) {
      const conversationId = pathname
        .replace("/api/control/conversations/", "")
        .replace("/messages/send", "");
      const payload = request.postDataJSON() as { content?: string };
      const content = typeof payload.content === "string" ? payload.content : "";
      messageCount += 1;

      const userMessage: ConversationMessage = {
        id: `user-${messageCount}`,
        conversationId,
        role: "user",
        state: "completed",
        content,
        errorCode: null,
        externalMessageId: null,
        createdAt: "2026-03-10T00:00:01.000Z",
        updatedAt: "2026-03-10T00:00:01.000Z"
      };
      const assistantMessage: ConversationMessage = {
        id: `assistant-${messageCount}`,
        conversationId,
        role: "assistant",
        state: "completed",
        content: `assistant:${content}`,
        errorCode: null,
        externalMessageId: `openclaw-msg-${messageCount}`,
        createdAt: "2026-03-10T00:00:02.000Z",
        updatedAt: "2026-03-10T00:00:02.000Z"
      };

      messagesByConversation.set(conversationId, [userMessage, assistantMessage]);
      const conversation = conversations.find((entry) => entry.id === conversationId);
      if (conversation) {
        conversation.title = content;
        conversation.messageCount = 2;
        conversation.lastMessageAt = assistantMessage.createdAt;
        conversation.updatedAt = assistantMessage.updatedAt;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          conversationId,
          userMessage,
          assistantMessage
        })
      });
      return;
    }

    if (pathname === "/api/agents/agent-1/schedules") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: schedules })
      });
      return;
    }

    if (pathname === "/api/control/agents/agent-1/schedules/create" && method === "POST") {
      scheduleCount += 1;
      const payload = request.postDataJSON() as {
        workspaceId?: string;
        label?: string;
        cron?: string;
        prompt?: string;
        enabled?: boolean;
      };
      const scheduleId = `job-${scheduleCount}`;
      const schedule: ScheduleSummary = {
        id: scheduleId,
        agentId: "agent-1",
        workspaceId:
          typeof payload.workspaceId === "string" && payload.workspaceId.length > 0
            ? payload.workspaceId
            : "ws-1",
        label: typeof payload.label === "string" ? payload.label : "Runtime schedule",
        cron: typeof payload.cron === "string" ? payload.cron : "0 9 * * *",
        prompt: typeof payload.prompt === "string" ? payload.prompt : "Run daily sync",
        enabled: payload.enabled !== false,
        nextRunAt: null,
        lastRunAt: null,
        createdAt: "2026-03-10T00:00:00.000Z",
        updatedAt: "2026-03-10T00:00:00.000Z"
      };
      schedules.unshift(schedule);
      scheduleRunsById.set(scheduleId, []);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, jobId: scheduleId })
      });
      return;
    }

    if (pathname.match(/^\/api\/control\/agents\/agent-1\/schedules\/[^/]+\/run$/)) {
      const scheduleId = pathname.split("/")[6] ?? "";
      scheduleRunCount += 1;
      const run: ScheduleRun = {
        id: `run-${scheduleRunCount}`,
        scheduleId,
        agentId: "agent-1",
        status: "succeeded",
        startedAt: "2026-03-10T00:10:00.000Z",
        finishedAt: "2026-03-10T00:10:03.000Z",
        errorCode: null
      };
      scheduleRunsById.set(scheduleId, [run, ...(scheduleRunsById.get(scheduleId) ?? [])]);
      const schedule = schedules.find((entry) => entry.id === scheduleId);
      if (schedule) {
        schedule.lastRunAt = run.finishedAt;
        schedule.updatedAt = run.finishedAt ?? schedule.updatedAt;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, runId: run.id })
      });
      return;
    }

    if (pathname.match(/^\/api\/agents\/agent-1\/schedules\/[^/]+\/runs$/)) {
      const scheduleId = pathname.split("/")[5] ?? "";
      const limit = Number.parseInt(searchParams.get("limit") ?? "8", 10);
      const items = (scheduleRunsById.get(scheduleId) ?? []).slice(
        0,
        Number.isNaN(limit) ? 8 : limit
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items })
      });
      return;
    }

    if (pathname === "/api/agents/agent-1/heartbeat") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ heartbeat })
      });
      return;
    }

    if (pathname === "/api/control/agents/agent-1/heartbeat/update" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      lastHeartbeatUpdate = payload;
      heartbeat.workspaceId =
        typeof payload.workspaceId === "string" && payload.workspaceId.length > 0
          ? payload.workspaceId
          : heartbeat.workspaceId;
      heartbeat.every = typeof payload.every === "string" ? payload.every : heartbeat.every;
      heartbeat.session = typeof payload.session === "string" ? payload.session : heartbeat.session;
      heartbeat.lightContext = payload.lightContext === true;
      heartbeat.prompt = typeof payload.prompt === "string" ? payload.prompt : heartbeat.prompt;
      heartbeat.updatedAt = "2026-03-10T00:20:00.000Z";

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ heartbeat })
      });
      return;
    }

    if (pathname === "/api/agents/agent-1/memory") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ memory })
      });
      return;
    }

    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: `Unhandled API route: ${method} ${pathname}` })
    });
  });

  await page.goto("/login");
  await page.getByTestId("daemon-token-input").fill(LOGIN_TOKEN);
  await page.getByTestId("connect-button").click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("agent-workspace-title")).toBeVisible();

  await page.getByTestId("agent-runtime-link-agent-1").click();
  await expect(page).toHaveURL(/\/agents\/agent-1\/runtime$/);
  await expect(page.getByTestId("runtime-page-title")).toBeVisible();

  await page.getByTestId("new-conversation-button").click();
  await expect(page).toHaveURL(/\/agents\/agent-1\/runtime\/conversations\/conversation-1$/);
  await expect(page.getByTestId("conversation-row-conversation-1")).toBeVisible();

  await page.getByTestId("conversation-input").fill("Hello runtime");
  await page.getByTestId("send-message-button").click();
  await expect(page.getByTestId("conversation-thread")).toContainText("assistant:Hello runtime");

  await page.getByTestId("schedules-tab").click();
  await expect(page.getByTestId("new-schedule-button")).toBeVisible();
  await page.getByTestId("schedule-name-input").fill("Runtime schedule");
  await page.getByTestId("schedule-cron-input").fill("0 9 * * *");
  await page.getByTestId("schedule-message-input").fill("Run daily sync");
  await page.getByTestId("create-schedule-button").click();
  await expect(page.getByTestId("schedule-row-job-1")).toBeVisible();

  await page.getByTestId("schedule-run-button-job-1").click();
  await expect.poll(() => scheduleRunCount).toBe(1);
  await expect(page.locator("article").filter({ hasText: "run-1" })).toBeVisible();

  await page.getByTestId("heartbeat-tab").click();
  await expect(page.getByTestId("heartbeat-every-input")).toHaveValue("*/10 * * * *");
  await page.getByTestId("heartbeat-every-input").fill("*/5 * * * *");
  await page.getByTestId("heartbeat-session-input").fill("runtime-session");
  await page.getByTestId("heartbeat-light-context-toggle").uncheck();
  await page.getByTestId("heartbeat-save-button").click();
  await expect.poll(() => lastHeartbeatUpdate?.session).toBe("runtime-session");
  await expect(page.getByTestId("heartbeat-every-input")).toHaveValue("*/5 * * * *");
  await expect(page.getByTestId("heartbeat-session-input")).toHaveValue("runtime-session");
  await expect(page.getByTestId("heartbeat-light-context-toggle")).not.toBeChecked();

  await page.getByTestId("memory-tab").click();
  await expect(page.getByTestId("memory-provider-input")).toHaveValue("openclaw-memory");
  await expect(page.getByTestId("memory-model-input")).toHaveValue("memory-default");
  await expect(page.getByTestId("memory-base-url-input")).toHaveValue("https://memory.example.com");
  await expect(page.getByTestId("memory-api-key-ref-input")).toHaveValue("secret://memory/default");
  await expect(page.getByTestId("memory-scope-row-conversation")).toContainText(
    "conversation:conversation-1"
  );
  await expect(page.getByTestId("memory-scope-row-agent")).toContainText(
    "Shared across agent runs."
  );

  expect(armCallCount).toBe(5);
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
});
