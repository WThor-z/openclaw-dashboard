import { describe, expect, it } from "vitest";

import {
  isConversationStatus,
  isMemoryScope,
  isMessageRole,
  type ArchiveConversationRequest,
  type ConfigureHeartbeatRequest,
  type ConfigureMemoryBindingRequest,
  type ConversationDetail,
  type ConversationListResponse,
  type ConversationMessagesResponse,
  type CreateConversationRequest,
  type CreateScheduleRequest,
  type HeartbeatResponse,
  type HeartbeatSummary,
  type MemoryBindingSummary,
  type MemoryPluginConfig,
  type MemoryResponse,
  type MemoryScopeSummary,
  type ScheduleListResponse,
  type ScheduleRun,
  type ScheduleRunsResponse,
  type ScheduleSummary,
  type SendConversationMessageRequest
} from "../../packages/shared/src/index.js";

describe("v2 runtime contracts", () => {
  it("accepts valid runtime enum values", () => {
    expect(isConversationStatus("active")).toBe(true);
    expect(isConversationStatus("archived")).toBe(true);

    expect(isMessageRole("user")).toBe(true);
    expect(isMessageRole("assistant")).toBe(true);
    expect(isMessageRole("system")).toBe(true);

    expect(isMemoryScope("conversation")).toBe(true);
    expect(isMemoryScope("agent")).toBe(true);
    expect(isMemoryScope("system")).toBe(true);
  });

  it("rejects invalid runtime enum values", () => {
    expect(isConversationStatus("paused")).toBe(false);
    expect(isConversationStatus("")).toBe(false);

    expect(isMessageRole("tool")).toBe(false);
    expect(isMessageRole("operator")).toBe(false);

    expect(isMemoryScope("workspace")).toBe(false);
    expect(isMemoryScope("global")).toBe(false);
  });

  it("exports compile-time conversation payload contracts", () => {
    const createConversationRequest: CreateConversationRequest = {
      workspaceId: "workspace-1",
      title: "Weekly review"
    };
    const sendConversationMessageRequest: SendConversationMessageRequest = {
      content: "Summarize the latest changes."
    };
    const archiveConversationRequest: ArchiveConversationRequest = {
      reason: "completed"
    };
    const conversationDetail: ConversationDetail = {
      id: "conversation-1",
      agentId: "agent-1",
      workspaceId: "workspace-1",
      sessionKey: "dashboard:agent-1:conversation-1",
      title: "Weekly review",
      status: "active",
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:01:00.000Z",
      archivedAt: null,
      lastMessageAt: "2026-03-10T10:01:00.000Z",
      messageCount: 2
    };
    const conversationListResponse: ConversationListResponse = {
      items: [conversationDetail]
    };
    const conversationMessagesResponse: ConversationMessagesResponse = {
      items: [
        {
          id: "message-1",
          conversationId: "conversation-1",
          role: "assistant",
          state: "completed",
          content: "Latest changes are summarized here.",
          errorCode: null,
          externalMessageId: "openclaw-msg-1",
          createdAt: "2026-03-10T10:01:00.000Z",
          updatedAt: "2026-03-10T10:01:00.000Z"
        }
      ]
    };

    expect(createConversationRequest.title).toBe("Weekly review");
    expect(sendConversationMessageRequest.content).toContain("Summarize");
    expect(archiveConversationRequest.reason).toBe("completed");
    expect(conversationListResponse.items).toHaveLength(1);
    expect(conversationMessagesResponse.items[0]?.role).toBe("assistant");
  });

  it("exports compile-time schedule payload contracts", () => {
    const createScheduleRequest: CreateScheduleRequest = {
      label: "Daily sync",
      cron: "0 9 * * *",
      prompt: "Prepare a daily sync summary.",
      enabled: true,
      timezone: "Asia/Shanghai",
      sessionKey: "dashboard:agent-1:schedule-1"
    };
    const scheduleSummary: ScheduleSummary = {
      id: "schedule-1",
      agentId: "agent-1",
      workspaceId: "workspace-1",
      label: "Daily sync",
      cron: "0 9 * * *",
      prompt: "Prepare a daily sync summary.",
      enabled: true,
      nextRunAt: "2026-03-11T09:00:00.000Z",
      lastRunAt: "2026-03-10T09:00:00.000Z",
      createdAt: "2026-03-10T08:00:00.000Z",
      updatedAt: "2026-03-10T08:00:00.000Z"
    };
    const scheduleRun: ScheduleRun = {
      id: "run-1",
      scheduleId: "schedule-1",
      agentId: "agent-1",
      status: "succeeded",
      startedAt: "2026-03-10T09:00:00.000Z",
      finishedAt: "2026-03-10T09:00:05.000Z",
      errorCode: null
    };
    const scheduleListResponse: ScheduleListResponse = {
      items: [scheduleSummary]
    };
    const scheduleRunsResponse: ScheduleRunsResponse = {
      items: [scheduleRun]
    };

    expect(createScheduleRequest.enabled).toBe(true);
    expect(scheduleListResponse.items[0]?.label).toBe("Daily sync");
    expect(scheduleRunsResponse.items[0]?.status).toBe("succeeded");
  });

  it("exports compile-time heartbeat payload contracts using every semantics", () => {
    const configureHeartbeatRequest: ConfigureHeartbeatRequest = {
      workspaceId: "workspace-1",
      every: "*/10 * * * *",
      session: "session-1",
      lightContext: true,
      prompt: "Report system health."
    };
    const heartbeatSummary: HeartbeatSummary = {
      agentId: "agent-1",
      workspaceId: "workspace-1",
      enabled: true,
      every: "*/10 * * * *",
      session: "session-1",
      lightContext: true,
      prompt: "Report system health.",
      lastBeatAt: "2026-03-10T10:00:00.000Z",
      nextBeatAt: "2026-03-10T10:10:00.000Z",
      updatedAt: "2026-03-10T10:00:00.000Z"
    };
    const heartbeatResponse: HeartbeatResponse = {
      heartbeat: heartbeatSummary
    };

    expect(configureHeartbeatRequest.every).toBe("*/10 * * * *");
    expect(configureHeartbeatRequest.session).toBe("session-1");
    expect(heartbeatResponse.heartbeat?.lightContext).toBe(true);
  });

  it("exports compile-time memory payload contracts", () => {
    const configureMemoryBindingRequest: ConfigureMemoryBindingRequest = {
      workspaceId: "workspace-1",
      scope: "conversation",
      provider: "openclaw-memory",
      secretRef: "secret://memory/default",
      conversationId: "conversation-1",
      model: "memory-pro",
      remote: { baseUrl: "https://memory.example.com" },
      apiKeyRef: "secret://memory/api-key"
    };
    const memoryPluginConfig: MemoryPluginConfig = {
      provider: "openclaw-memory",
      model: "memory-default",
      remote: {
        baseUrl: "https://memory.example.com"
      },
      apiKeyRef: "secret://memory/default",
      secretRef: "secret://memory/default"
    };
    const memoryBindingSummary: MemoryBindingSummary = {
      id: "binding-1",
      agentId: "agent-1",
      workspaceId: "workspace-1",
      scope: "conversation",
      provider: "openclaw-memory",
      secretRef: "secret://memory/default",
      conversationId: "conversation-1",
      updatedAt: "2026-03-10T10:00:00.000Z"
    };
    const memoryScopeSummary: MemoryScopeSummary = {
      scope: "conversation",
      namespace: "conversation:conversation-1",
      retention: "7 days",
      summary: "Bound to the active thread.",
      conversationId: "conversation-1",
      updatedAt: "2026-03-10T10:00:00.000Z"
    };
    const memoryResponse: MemoryResponse = {
      memory: {
        agentId: "agent-1",
        workspaceId: "workspace-1",
        plugin: memoryPluginConfig,
        bindings: [memoryBindingSummary],
        scopes: [memoryScopeSummary]
      }
    };

    expect(configureMemoryBindingRequest.scope).toBe("conversation");
    expect(memoryResponse.memory.plugin?.provider).toBe("openclaw-memory");
    expect(memoryResponse.memory.bindings[0]?.conversationId).toBe("conversation-1");
    expect(memoryResponse.memory.scopes?.[0]?.namespace).toBe("conversation:conversation-1");
  });
});
