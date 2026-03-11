import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../../app/auth.js";
import { useI18n } from "../../../app/i18n.js";
import type {
  ConversationMessage,
  ConversationSummary,
  HeartbeatSummary,
  MemoryBindingSummary,
  MemoryScope,
  ScheduleRun,
  ScheduleSummary
} from "../../../../../../packages/shared/src/types.js";

type RuntimeTabId = "conversations" | "schedules" | "heartbeat" | "memory";

type RuntimeTab = {
  id: RuntimeTabId;
  label: string;
  hint: string;
};

type AgentRuntimeShellProps = {
  agentId: string;
  conversationId?: string;
};

type SendMessageResponse = {
  userMessage?: ConversationMessage;
  assistantMessage?: ConversationMessage;
};

type RuntimeHeartbeatSummary = HeartbeatSummary & {
  every?: string;
  session?: string;
  lightContext?: boolean;
};

type ScheduleFormState = {
  name: string;
  cron: string;
  timezone: string;
  sessionKey: string;
  message: string;
};

type ScheduleFormErrors = Partial<Record<keyof ScheduleFormState, string>>;

type HeartbeatFormState = {
  every: string;
  session: string;
  lightContext: boolean;
  prompt: string;
};

type HeartbeatFormErrors = Partial<Record<"every" | "session", string>>;

type MemoryFormState = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyRef: string;
};

type MemoryFormErrors = Partial<Record<keyof MemoryFormState, string>>;

type MemoryScopeSummaryRow = {
  scope: MemoryScope;
  namespace: string;
  retention: string;
  summary: string;
  readonly: boolean;
  updatedAt: string | null;
};

type RuntimeMemoryPlugin = {
  provider?: unknown;
  model?: unknown;
  apiKeyRef?: unknown;
  secretRef?: unknown;
  baseUrl?: unknown;
  remote?: {
    baseUrl?: unknown;
  } | null;
};

type RuntimeMemoryScopeEntry = {
  scope?: unknown;
  namespace?: unknown;
  retention?: unknown;
  summary?: unknown;
  readonly?: unknown;
  updatedAt?: unknown;
};

type RuntimeMemorySummary = {
  agentId?: unknown;
  workspaceId?: unknown;
  plugin?: RuntimeMemoryPlugin | null;
  pluginSlot?: RuntimeMemoryPlugin | null;
  activePlugin?: RuntimeMemoryPlugin | null;
  bindings?: MemoryBindingSummary[];
  scopes?: RuntimeMemoryScopeEntry[] | Record<string, RuntimeMemoryScopeEntry> | null;
};

type NormalizedMemoryState = {
  workspaceId: string;
  form: MemoryFormState;
  scopes: MemoryScopeSummaryRow[];
};

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function tabClass(active: boolean) {
  return active
    ? "border-[#1f5ba6]/25 bg-[#eef5ff] text-[#123f77]"
    : "border-transparent bg-transparent text-slate-700 hover:bg-slate-50/90";
}

function formatErrorMessage(response: Response, body: unknown, t: TranslateFn) {
  if (typeof body === "object" && body !== null) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return t("runtime.request.failed", { status: response.status });
}

function resolveConversationTitle(title: string | null | undefined, t: TranslateFn) {
  if (typeof title === "string" && title.trim().length > 0) {
    return title;
  }

  return t("runtime.conversations.newTitle");
}

function summarizeUserMessage(content: string, t: TranslateFn) {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return t("runtime.conversations.newTitle");
  }

  return trimmed.length > 72 ? `${trimmed.slice(0, 72)}...` : trimmed;
}

function firstNonEmptyUserMessage(messages: ConversationMessage[], t: TranslateFn) {
  const userMessage = messages.find(
    (message) => message.role === "user" && message.content.trim().length > 0
  );
  if (!userMessage) {
    return null;
  }

  return summarizeUserMessage(userMessage.content, t);
}

function sortMessagesChronologically(messages: ConversationMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.id.localeCompare(right.id);
  });
}

function isLikelyCronExpression(value: string) {
  return /^(?:\S+\s+){4}\S+$/.test(value.trim());
}

function createDefaultScheduleFormState(): ScheduleFormState {
  return {
    name: "",
    cron: "",
    timezone: "",
    sessionKey: "",
    message: ""
  };
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function createDefaultMemoryFormState(): MemoryFormState {
  return {
    provider: "",
    model: "",
    baseUrl: "",
    apiKeyRef: ""
  };
}

function createDefaultMemoryScopes(
  agentId: string,
  conversationId: string | undefined,
  t: TranslateFn
): MemoryScopeSummaryRow[] {
  return [
    {
      scope: "conversation",
      namespace: conversationId ? `conversation:${conversationId}` : "conversation:inactive",
      retention: conversationId
        ? t("runtime.memory.retention.conversation")
        : t("runtime.memory.retention.conversationInactive"),
      summary: conversationId
        ? t("runtime.memory.summary.conversationEmpty")
        : t("runtime.memory.summary.conversationNeedsThread"),
      readonly: false,
      updatedAt: null
    },
    {
      scope: "agent",
      namespace: `agent:${agentId}`,
      retention: t("runtime.memory.retention.agent"),
      summary: t("runtime.memory.summary.agentEmpty"),
      readonly: false,
      updatedAt: null
    },
    {
      scope: "system",
      namespace: "system:managed",
      retention: t("runtime.memory.retention.system"),
      summary: t("runtime.memory.summary.systemDefault"),
      readonly: true,
      updatedAt: null
    }
  ];
}

function resolveMemoryPlugin(memory?: RuntimeMemorySummary | null) {
  return memory?.pluginSlot ?? memory?.activePlugin ?? memory?.plugin ?? null;
}

function describeMemorySummary(
  provider: string | null,
  model: string | null,
  baseUrl: string | null,
  fallback: string
) {
  if (!provider && !model && !baseUrl) {
    return fallback;
  }

  const details = [provider, model].filter(Boolean).join(" / ");
  if (baseUrl) {
    return details.length > 0 ? `${details} @ ${baseUrl}` : baseUrl;
  }

  return details.length > 0 ? details : fallback;
}

function normalizeMemoryState(
  agentId: string,
  conversationId: string | undefined,
  memory: RuntimeMemorySummary | null | undefined,
  t: TranslateFn
): NormalizedMemoryState {
  const defaults = createDefaultMemoryScopes(agentId, conversationId, t);
  const defaultRows = new Map<MemoryScope, MemoryScopeSummaryRow>(
    defaults.map((entry) => [entry.scope, entry])
  );
  const plugin = resolveMemoryPlugin(memory);
  const provider = readNonEmptyString(plugin?.provider);
  const model = readNonEmptyString(plugin?.model);
  const baseUrl =
    readNonEmptyString(plugin?.remote?.baseUrl) ?? readNonEmptyString(plugin?.baseUrl);
  const apiKeyRef =
    readNonEmptyString(plugin?.apiKeyRef) ?? readNonEmptyString(plugin?.secretRef) ?? "";

  const scopeEntries = Array.isArray(memory?.scopes)
    ? memory?.scopes
    : memory?.scopes && typeof memory.scopes === "object"
      ? Object.values(memory.scopes)
      : [];
  const scopesWithExplicitSummary = new Set<MemoryScope>();

  for (const scopeEntry of scopeEntries) {
    if (!scopeEntry || typeof scopeEntry !== "object") {
      continue;
    }

    const scopeValue = scopeEntry.scope;
    if (scopeValue !== "conversation" && scopeValue !== "agent" && scopeValue !== "system") {
      continue;
    }

    const defaultRow = defaultRows.get(scopeValue);
    if (!defaultRow) {
      continue;
    }

    defaultRows.set(scopeValue, {
      scope: scopeValue,
      namespace: readNonEmptyString(scopeEntry.namespace) ?? defaultRow.namespace,
      retention: readNonEmptyString(scopeEntry.retention) ?? defaultRow.retention,
      summary:
        readNonEmptyString(scopeEntry.summary) ??
        describeMemorySummary(provider, model, baseUrl, defaultRow.summary),
      readonly: scopeValue === "system" ? true : scopeEntry.readonly === true,
      updatedAt: readNonEmptyString(scopeEntry.updatedAt)
    });
    if (readNonEmptyString(scopeEntry.summary)) {
      scopesWithExplicitSummary.add(scopeValue);
    }
  }

  if (Array.isArray(memory?.bindings)) {
    for (const binding of memory.bindings) {
      const defaultRow = defaultRows.get(binding.scope);
      if (!defaultRow) {
        continue;
      }

      defaultRows.set(binding.scope, {
        scope: binding.scope,
        namespace:
          binding.scope === "conversation"
            ? `conversation:${binding.conversationId ?? conversationId ?? "inactive"}`
            : binding.scope === "agent"
              ? `agent:${binding.agentId}`
              : defaultRow.namespace,
        retention: defaultRow.retention,
        summary: scopesWithExplicitSummary.has(binding.scope)
          ? defaultRow.summary
          : describeMemorySummary(
              readNonEmptyString(binding.provider) ?? provider,
              model,
              baseUrl,
              defaultRow.summary
            ),
        readonly: binding.scope === "system" ? true : defaultRow.readonly,
        updatedAt: readNonEmptyString(binding.updatedAt)
      });
    }
  }

  const workspaceId =
    readNonEmptyString(memory?.workspaceId) ?? memory?.bindings?.[0]?.workspaceId ?? agentId;

  return {
    workspaceId,
    form: {
      provider: provider ?? "",
      model: model ?? "",
      baseUrl: baseUrl ?? "",
      apiKeyRef
    },
    scopes: defaults.map((entry) => defaultRows.get(entry.scope) ?? entry)
  };
}

function validateScheduleForm(form: ScheduleFormState, t: TranslateFn): ScheduleFormErrors {
  const errors: ScheduleFormErrors = {};

  if (form.name.trim().length === 0) {
    errors.name = t("runtime.validation.nameRequired");
  }

  if (!isLikelyCronExpression(form.cron)) {
    errors.cron = t("runtime.validation.cronFiveFields");
  }

  if (form.message.trim().length === 0) {
    errors.message = t("runtime.validation.messageRequired");
  }

  return errors;
}

function validateHeartbeatForm(form: HeartbeatFormState, t: TranslateFn): HeartbeatFormErrors {
  const errors: HeartbeatFormErrors = {};

  if (!isLikelyCronExpression(form.every)) {
    errors.every = t("runtime.validation.everyFiveFields");
  }

  if (form.session.trim().length === 0) {
    errors.session = t("runtime.validation.sessionRequired");
  }

  return errors;
}

function validateMemoryForm(form: MemoryFormState, t: TranslateFn): MemoryFormErrors {
  const errors: MemoryFormErrors = {};

  const apiKeyRef = form.apiKeyRef.trim();
  if (apiKeyRef.length > 0 && !apiKeyRef.startsWith("secret://")) {
    errors.apiKeyRef = t("runtime.validation.apiKeyRefSecret");
  }

  return errors;
}

function translateConversationStatus(status: string, t: TranslateFn) {
  if (status === "archived") {
    return t("runtime.conversations.status.archived");
  }

  if (status === "active") {
    return t("runtime.conversations.status.active");
  }

  return status;
}

function translateMessageRole(role: ConversationMessage["role"], t: TranslateFn) {
  return role === "assistant"
    ? t("runtime.messages.role.assistant")
    : t("runtime.messages.role.user");
}

function translateMessageState(state: ConversationMessage["state"], t: TranslateFn) {
  if (state === "pending") {
    return t("runtime.messages.state.pending");
  }

  if (state === "failed") {
    return t("runtime.messages.state.failed");
  }

  return t("runtime.messages.state.completed");
}

function translateScheduleEnabled(enabled: boolean, t: TranslateFn) {
  return enabled ? t("runtime.schedules.enabled") : t("runtime.schedules.paused");
}

function translateRunStatus(status: ScheduleRun["status"], t: TranslateFn) {
  switch (status) {
    case "succeeded":
      return t("runtime.runStatus.succeeded");
    case "failed":
      return t("runtime.runStatus.failed");
    case "running":
      return t("runtime.runStatus.running");
    case "cancelled":
      return t("runtime.runStatus.cancelled");
    default:
      return status;
  }
}

function translateMemoryScope(scope: MemoryScope, t: TranslateFn) {
  if (scope === "conversation") {
    return t("runtime.memory.scope.conversation");
  }

  if (scope === "agent") {
    return t("runtime.memory.scope.agent");
  }

  return t("runtime.memory.scope.system");
}

export function AgentRuntimeShell({ agentId, conversationId }: AgentRuntimeShellProps) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<RuntimeTabId>("conversations");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [threadMessages, setThreadMessages] = useState<ConversationMessage[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [isConversationsLoading, setIsConversationsLoading] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [scheduleRuns, setScheduleRuns] = useState<ScheduleRun[]>([]);
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(false);
  const [isScheduleRunsLoading, setIsScheduleRunsLoading] = useState(false);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);
  const [isScheduleRunningId, setIsScheduleRunningId] = useState<string | null>(null);
  const [isScheduleRemovingId, setIsScheduleRemovingId] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(
    createDefaultScheduleFormState
  );
  const [scheduleFormErrors, setScheduleFormErrors] = useState<ScheduleFormErrors>({});
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [heartbeatWorkspaceId, setHeartbeatWorkspaceId] = useState(agentId);
  const [heartbeatForm, setHeartbeatForm] = useState<HeartbeatFormState>({
    every: "",
    session: "",
    lightContext: false,
    prompt: ""
  });
  const [heartbeatFormErrors, setHeartbeatFormErrors] = useState<HeartbeatFormErrors>({});
  const [isHeartbeatLoading, setIsHeartbeatLoading] = useState(false);
  const [isHeartbeatSaving, setIsHeartbeatSaving] = useState(false);
  const [heartbeatError, setHeartbeatError] = useState<string | null>(null);
  const [memoryWorkspaceId, setMemoryWorkspaceId] = useState(agentId);
  const [memoryForm, setMemoryForm] = useState<MemoryFormState>(createDefaultMemoryFormState);
  const [memoryFormErrors, setMemoryFormErrors] = useState<MemoryFormErrors>({});
  const [memoryScopes, setMemoryScopes] = useState<MemoryScopeSummaryRow[]>(() =>
    createDefaultMemoryScopes(agentId, conversationId, t)
  );
  const [isMemoryLoading, setIsMemoryLoading] = useState(false);
  const [isMemorySaving, setIsMemorySaving] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const runtimeTabs = useMemo<RuntimeTab[]>(
    () => [
      {
        id: "conversations",
        label: t("runtime.tabs.conversations"),
        hint: t("runtime.tabs.conversations.hint")
      },
      {
        id: "schedules",
        label: t("runtime.tabs.schedules"),
        hint: t("runtime.tabs.schedules.hint")
      },
      {
        id: "heartbeat",
        label: t("runtime.tabs.heartbeat"),
        hint: t("runtime.tabs.heartbeat.hint")
      },
      {
        id: "memory",
        label: t("runtime.tabs.memory"),
        hint: t("runtime.tabs.memory.hint")
      }
    ],
    [t]
  );

  const armWrites = useCallback(async () => {
    const response = await fetch("/api/control/arm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token ?? ""}`
      }
    });

    if (!response.ok) {
      throw new Error(t("runtime.armWritesFailed"));
    }
  }, [t, token]);

  const archiveConversation = useCallback(
    async (targetConversationId: string) => {
      if (!token) {
        return;
      }

      setConversationError(null);
      setIsArchiving(true);
      try {
        await armWrites();
        const response = await fetch(
          `/api/control/conversations/${encodeURIComponent(targetConversationId)}/archive`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
              "idempotency-key": `${Date.now()}-runtime-conversation-archive`
            },
            body: JSON.stringify({})
          }
        );

        const body = (await response.json()) as { ok?: boolean; message?: string };

        if (!response.ok) {
          throw new Error(formatErrorMessage(response, body, t));
        }

        // Update conversation status in the list
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === targetConversationId
              ? {
                  ...conversation,
                  status: "archived" as const,
                  archivedAt: new Date().toISOString()
                }
              : conversation
          )
        );
      } catch (error) {
        setConversationError(
          error instanceof Error ? error.message : t("runtime.conversations.archiveFailed")
        );
      } finally {
        setIsArchiving(false);
      }
    },
    [armWrites, t, token]
  );

  const loadConversations = useCallback(async () => {
    if (!token) {
      setConversations([]);
      return;
    }

    setIsConversationsLoading(true);
    setConversationError(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/conversations`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(t("runtime.conversations.loadFailed", { status: response.status }));
      }

      const body = (await response.json()) as { items?: ConversationSummary[] };
      setConversations(Array.isArray(body.items) ? body.items : []);
    } catch {
      setConversations([]);
      setConversationError(t("runtime.conversations.loadFailed"));
    } finally {
      setIsConversationsLoading(false);
    }
  }, [agentId, t, token]);

  const loadConversationThread = useCallback(async () => {
    if (!token || !conversationId) {
      setThreadMessages([]);
      return;
    }

    setIsThreadLoading(true);
    setConversationError(null);
    try {
      const [detailResponse, messagesResponse] = await Promise.all([
        fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
          headers: {
            authorization: `Bearer ${token}`
          }
        }),
        fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
          headers: {
            authorization: `Bearer ${token}`
          }
        })
      ]);

      if (!detailResponse.ok) {
        throw new Error(t("runtime.conversations.loadOneFailed"));
      }

      const detailBody = (await detailResponse.json()) as {
        conversation?: ConversationSummary;
      };
      const detailConversation = detailBody.conversation;
      if (!detailConversation || detailConversation.agentId !== agentId) {
        throw new Error(t("runtime.conversations.belongsMismatch"));
      }

      if (!messagesResponse.ok) {
        throw new Error(t("runtime.conversations.loadMessagesFailed"));
      }

      const messagesBody = (await messagesResponse.json()) as { items?: ConversationMessage[] };
      const messages = Array.isArray(messagesBody.items) ? messagesBody.items : [];
      setThreadMessages(sortMessagesChronologically(messages));
    } catch (error) {
      setThreadMessages([]);
      setConversationError(
        error instanceof Error ? error.message : t("runtime.conversations.loadOneFailed")
      );
    } finally {
      setIsThreadLoading(false);
    }
  }, [agentId, conversationId, t, token]);

  const applyScheduleToForm = useCallback((schedule: ScheduleSummary) => {
    setScheduleForm({
      name: schedule.label,
      cron: schedule.cron,
      timezone: "",
      sessionKey: "",
      message: schedule.prompt
    });
    setScheduleFormErrors({});
  }, []);

  const loadSchedules = useCallback(async () => {
    if (!token) {
      setSchedules([]);
      setSelectedScheduleId(null);
      setScheduleRuns([]);
      return;
    }

    setIsSchedulesLoading(true);
    setScheduleError(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/schedules`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      const body = (await response.json()) as {
        items?: ScheduleSummary[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(formatErrorMessage(response, body, t));
      }

      const items = Array.isArray(body.items) ? body.items : [];
      setSchedules(items);
      setSelectedScheduleId((previous) => {
        const hasPrevious = previous && items.some((schedule) => schedule.id === previous);
        if (hasPrevious) {
          return previous;
        }

        return items[0]?.id ?? null;
      });
      if (items.length === 0) {
        setScheduleRuns([]);
      }
    } catch (error) {
      setSchedules([]);
      setSelectedScheduleId(null);
      setScheduleRuns([]);
      setScheduleError(error instanceof Error ? error.message : t("runtime.schedules.loadFailed"));
    } finally {
      setIsSchedulesLoading(false);
    }
  }, [agentId, t, token]);

  const loadScheduleRuns = useCallback(
    async (jobId: string) => {
      if (!token) {
        setScheduleRuns([]);
        return;
      }

      setIsScheduleRunsLoading(true);
      try {
        const response = await fetch(
          `/api/agents/${encodeURIComponent(agentId)}/schedules/${encodeURIComponent(jobId)}/runs?limit=8`,
          {
            headers: {
              authorization: `Bearer ${token}`
            }
          }
        );

        const body = (await response.json()) as {
          items?: ScheduleRun[];
          message?: string;
        };

        if (!response.ok) {
          throw new Error(formatErrorMessage(response, body, t));
        }

        setScheduleRuns(Array.isArray(body.items) ? body.items : []);
      } catch (error) {
        setScheduleRuns([]);
        setScheduleError(
          error instanceof Error ? error.message : t("runtime.schedules.loadRunsFailed")
        );
      } finally {
        setIsScheduleRunsLoading(false);
      }
    },
    [agentId, t, token]
  );

  const loadHeartbeat = useCallback(async () => {
    if (!token) {
      setHeartbeatWorkspaceId(agentId);
      setHeartbeatForm({
        every: "",
        session: "",
        lightContext: false,
        prompt: ""
      });
      return;
    }

    setIsHeartbeatLoading(true);
    setHeartbeatError(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/heartbeat`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      const body = (await response.json()) as {
        heartbeat?: RuntimeHeartbeatSummary;
        message?: string;
      };

      if (!response.ok || !body.heartbeat) {
        throw new Error(formatErrorMessage(response, body, t));
      }

      setHeartbeatWorkspaceId(body.heartbeat.workspaceId || agentId);
      setHeartbeatForm({
        every: typeof body.heartbeat.every === "string" ? body.heartbeat.every : "",
        session: typeof body.heartbeat.session === "string" ? body.heartbeat.session : "",
        lightContext: body.heartbeat.lightContext === true,
        prompt: typeof body.heartbeat.prompt === "string" ? body.heartbeat.prompt : ""
      });
      setHeartbeatFormErrors({});
    } catch (error) {
      setHeartbeatError(error instanceof Error ? error.message : t("runtime.heartbeat.loadFailed"));
    } finally {
      setIsHeartbeatLoading(false);
    }
  }, [agentId, t, token]);

  const loadMemory = useCallback(async () => {
    if (!token) {
      setMemoryWorkspaceId(agentId);
      setMemoryForm(createDefaultMemoryFormState());
      setMemoryScopes(createDefaultMemoryScopes(agentId, conversationId, t));
      return;
    }

    setIsMemoryLoading(true);
    setMemoryError(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/memory`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      const body = (await response.json()) as {
        memory?: RuntimeMemorySummary;
        message?: string;
      };

      if (!response.ok || !body.memory) {
        throw new Error(formatErrorMessage(response, body, t));
      }

      const normalized = normalizeMemoryState(agentId, conversationId, body.memory, t);
      setMemoryWorkspaceId(normalized.workspaceId || agentId);
      setMemoryForm(normalized.form);
      setMemoryScopes(normalized.scopes);
    } catch (error) {
      setMemoryWorkspaceId(agentId);
      setMemoryForm(createDefaultMemoryFormState());
      setMemoryScopes(createDefaultMemoryScopes(agentId, conversationId, t));
      setMemoryError(error instanceof Error ? error.message : t("runtime.memory.loadFailed"));
    } finally {
      setIsMemoryLoading(false);
    }
  }, [agentId, conversationId, t, token]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadConversationThread();
  }, [loadConversationThread]);

  useEffect(() => {
    if (activeTab === "schedules") {
      void loadSchedules();
    }
  }, [activeTab, loadSchedules]);

  useEffect(() => {
    if (activeTab === "heartbeat") {
      void loadHeartbeat();
    }
  }, [activeTab, loadHeartbeat]);

  useEffect(() => {
    if (activeTab === "memory") {
      void loadMemory();
    }
  }, [activeTab, loadMemory]);

  useEffect(() => {
    if (activeTab !== "schedules") {
      return;
    }

    if (isCreatingSchedule) {
      return;
    }

    const selectedSchedule =
      schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null;
    if (selectedSchedule) {
      applyScheduleToForm(selectedSchedule);
      return;
    }

    const fallback = schedules[0] ?? null;
    if (fallback) {
      setSelectedScheduleId(fallback.id);
      applyScheduleToForm(fallback);
      return;
    }

    setScheduleForm(createDefaultScheduleFormState());
    setScheduleRuns([]);
  }, [activeTab, applyScheduleToForm, isCreatingSchedule, schedules, selectedScheduleId]);

  useEffect(() => {
    if (activeTab !== "schedules" || !selectedScheduleId || isCreatingSchedule) {
      if (isCreatingSchedule || !selectedScheduleId) {
        setScheduleRuns([]);
      }
      return;
    }

    void loadScheduleRuns(selectedScheduleId);
  }, [activeTab, isCreatingSchedule, loadScheduleRuns, selectedScheduleId]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId) ?? null,
    [conversationId, conversations]
  );
  const activeConversationDerivedTitle = useMemo(
    () => firstNonEmptyUserMessage(threadMessages, t),
    [t, threadMessages]
  );

  const activeTabMeta = useMemo(
    () => runtimeTabs.find((tab) => tab.id === activeTab) ?? runtimeTabs[0],
    [activeTab, runtimeTabs]
  );

  const selectedSchedule = useMemo(
    () => schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null,
    [schedules, selectedScheduleId]
  );

  const submitSchedule = useCallback(async () => {
    if (!token) {
      return;
    }

    const errors = validateScheduleForm(scheduleForm, t);
    setScheduleFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      workspaceId: selectedSchedule?.workspaceId ?? conversations[0]?.workspaceId ?? agentId,
      name: scheduleForm.name.trim(),
      cron: scheduleForm.cron.trim(),
      ...(scheduleForm.timezone.trim().length > 0
        ? { timezone: scheduleForm.timezone.trim() }
        : {}),
      ...(scheduleForm.sessionKey.trim().length > 0
        ? { sessionKey: scheduleForm.sessionKey.trim() }
        : {}),
      message: scheduleForm.message.trim(),
      label: scheduleForm.name.trim(),
      prompt: scheduleForm.message.trim(),
      enabled: true
    };

    const isUpdate = !isCreatingSchedule && !!selectedScheduleId;
    const endpoint = isUpdate
      ? `/api/control/agents/${encodeURIComponent(agentId)}/schedules/${encodeURIComponent(
          selectedScheduleId
        )}/update`
      : `/api/control/agents/${encodeURIComponent(agentId)}/schedules/create`;

    setScheduleError(null);
    setIsScheduleSaving(true);
    try {
      await armWrites();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "idempotency-key": `${Date.now()}-runtime-schedule-${isUpdate ? "update" : "create"}`
        },
        body: JSON.stringify(payload)
      });

      const body = (await response.json()) as {
        jobId?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(formatErrorMessage(response, body, t));
      }

      const createdJobId =
        typeof body.jobId === "string" && body.jobId.length > 0 ? body.jobId : null;
      if (createdJobId) {
        setSelectedScheduleId(createdJobId);
      }
      setIsCreatingSchedule(false);
      await loadSchedules();
      if (isUpdate && selectedScheduleId) {
        await loadScheduleRuns(selectedScheduleId);
      } else if (createdJobId) {
        await loadScheduleRuns(createdJobId);
      }
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : t("runtime.schedules.saveFailed"));
    } finally {
      setIsScheduleSaving(false);
    }
  }, [
    agentId,
    armWrites,
    conversations,
    isCreatingSchedule,
    loadScheduleRuns,
    loadSchedules,
    scheduleForm,
    selectedSchedule,
    selectedScheduleId,
    t,
    token
  ]);

  const runScheduleNow = useCallback(
    async (jobId: string) => {
      if (!token) {
        return;
      }

      setScheduleError(null);
      setIsScheduleRunningId(jobId);
      try {
        await armWrites();
        const response = await fetch(
          `/api/control/agents/${encodeURIComponent(agentId)}/schedules/${encodeURIComponent(
            jobId
          )}/run`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
              "idempotency-key": `${Date.now()}-runtime-schedule-run-${jobId}`
            },
            body: JSON.stringify({})
          }
        );

        const body = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(formatErrorMessage(response, body, t));
        }

        setSelectedScheduleId(jobId);
        await Promise.all([loadSchedules(), loadScheduleRuns(jobId)]);
      } catch (error) {
        setScheduleError(error instanceof Error ? error.message : t("runtime.schedules.runFailed"));
      } finally {
        setIsScheduleRunningId(null);
      }
    },
    [agentId, armWrites, loadScheduleRuns, loadSchedules, t, token]
  );

  const removeSchedule = useCallback(
    async (jobId: string) => {
      if (!token) {
        return;
      }

      setScheduleError(null);
      setIsScheduleRemovingId(jobId);
      try {
        await armWrites();
        const response = await fetch(
          `/api/control/agents/${encodeURIComponent(agentId)}/schedules/${encodeURIComponent(
            jobId
          )}/remove`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
              "idempotency-key": `${Date.now()}-runtime-schedule-remove-${jobId}`
            },
            body: JSON.stringify({})
          }
        );

        const body = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(formatErrorMessage(response, body, t));
        }

        if (selectedScheduleId === jobId) {
          setSelectedScheduleId(null);
          setScheduleRuns([]);
        }
        await loadSchedules();
      } catch (error) {
        setScheduleError(
          error instanceof Error ? error.message : t("runtime.schedules.removeFailed")
        );
      } finally {
        setIsScheduleRemovingId(null);
      }
    },
    [agentId, armWrites, loadSchedules, selectedScheduleId, t, token]
  );

  const saveHeartbeat = useCallback(async () => {
    if (!token) {
      return;
    }

    const errors = validateHeartbeatForm(heartbeatForm, t);
    setHeartbeatFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setHeartbeatError(null);
    setIsHeartbeatSaving(true);
    try {
      await armWrites();
      const response = await fetch(
        `/api/control/agents/${encodeURIComponent(agentId)}/heartbeat/update`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "idempotency-key": `${Date.now()}-runtime-heartbeat-update`
          },
          body: JSON.stringify({
            workspaceId: heartbeatWorkspaceId || agentId,
            every: heartbeatForm.every.trim(),
            session: heartbeatForm.session.trim(),
            lightContext: heartbeatForm.lightContext,
            prompt: heartbeatForm.prompt.trim()
          })
        }
      );

      const body = (await response.json()) as {
        heartbeat?: RuntimeHeartbeatSummary;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(formatErrorMessage(response, body, t));
      }

      if (body.heartbeat) {
        setHeartbeatWorkspaceId(body.heartbeat.workspaceId || heartbeatWorkspaceId || agentId);
        setHeartbeatForm((previous) => ({
          every:
            typeof body.heartbeat?.every === "string" && body.heartbeat.every.length > 0
              ? body.heartbeat.every
              : previous.every,
          session:
            typeof body.heartbeat?.session === "string" && body.heartbeat.session.length > 0
              ? body.heartbeat.session
              : previous.session,
          lightContext:
            typeof body.heartbeat?.lightContext === "boolean"
              ? body.heartbeat.lightContext
              : previous.lightContext,
          prompt:
            typeof body.heartbeat?.prompt === "string" ? body.heartbeat.prompt : previous.prompt
        }));
      }
    } catch (error) {
      setHeartbeatError(
        error instanceof Error ? error.message : t("runtime.heartbeat.updateFailed")
      );
    } finally {
      setIsHeartbeatSaving(false);
    }
  }, [agentId, armWrites, heartbeatForm, heartbeatWorkspaceId, t, token]);

  const saveMemory = useCallback(async () => {
    if (!token) {
      return;
    }

    const errors = validateMemoryForm(memoryForm, t);
    setMemoryFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setMemoryError(null);
    setIsMemorySaving(true);
    try {
      const scope: MemoryScope = conversationId ? "conversation" : "agent";
      const apiKeyRef = memoryForm.apiKeyRef.trim();
      await armWrites();
      const response = await fetch(
        `/api/control/agents/${encodeURIComponent(agentId)}/memory/configure`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "idempotency-key": `${Date.now()}-runtime-memory-configure`
          },
          body: JSON.stringify({
            workspaceId: memoryWorkspaceId || agentId,
            scope,
            provider: memoryForm.provider.trim(),
            model: memoryForm.model.trim(),
            remote: {
              baseUrl: memoryForm.baseUrl.trim()
            },
            apiKeyRef,
            secretRef: apiKeyRef,
            ...(conversationId ? { conversationId } : {})
          })
        }
      );

      const body = (await response.json()) as {
        binding?: unknown;
        memory?: RuntimeMemorySummary;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(formatErrorMessage(response, body, t));
      }

      if (body.memory) {
        const normalized = normalizeMemoryState(agentId, conversationId, body.memory, t);
        setMemoryWorkspaceId(normalized.workspaceId || agentId);
        setMemoryForm(normalized.form);
        setMemoryScopes(normalized.scopes);
      } else {
        await loadMemory();
      }
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : t("runtime.memory.saveFailed"));
    } finally {
      setIsMemorySaving(false);
    }
  }, [agentId, armWrites, conversationId, loadMemory, memoryForm, memoryWorkspaceId, t, token]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent text-slate-800 selection:bg-[#dbe9ff]">
      <aside className="hidden w-[17.5rem] shrink-0 border-r border-slate-200 bg-gradient-to-b from-[#fcfdff] to-[#f4f7fb] p-4 lg:flex lg:flex-col lg:gap-3.5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">
            {t("runtime.sidebar.badge")}
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
            {t("runtime.page.title")}
          </h2>
          <p className="mt-2 truncate text-[11px] uppercase tracking-[0.25em] text-slate-500">
            {agentId}
          </p>
        </div>

        <nav className="rounded-2xl border border-slate-200 bg-white px-2.5 py-3 shadow-sm">
          <div className="grid gap-1.5">
            <Link
              to="/dashboard"
              className="flex min-h-[2.2rem] items-center rounded-lg border px-2.5 py-2 text-[13px] font-semibold text-slate-700 transition-all duration-200 hover:translate-x-[1px] hover:bg-slate-50/90"
            >
              {t("runtime.nav.dashboard")}
            </Link>
            <Link
              to={`/agents/${encodeURIComponent(agentId)}/workspace`}
              className="flex min-h-[2.2rem] items-center rounded-lg border px-2.5 py-2 text-[13px] font-semibold text-slate-700 transition-all duration-200 hover:translate-x-[1px] hover:bg-slate-50/90"
            >
              {t("runtime.nav.workspace")}
            </Link>
            <Link
              to={`/agents/${encodeURIComponent(agentId)}/runtime`}
              className="flex min-h-[2.2rem] items-center rounded-lg border px-2.5 py-2 text-[13px] font-semibold transition-all duration-200 hover:translate-x-[1px] hover:bg-slate-50/90"
            >
              {t("runtime.nav.home")}
            </Link>
          </div>
        </nav>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-slate-200 bg-white/80 px-10 py-5 backdrop-blur-md">
          <h1
            data-testid="runtime-page-title"
            className="text-2xl font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {t("runtime.page.title")}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
            {t("runtime.meta.agent", { agentId })}
          </p>
          {conversationId ? (
            <p data-testid="agent-runtime-conversation-id" className="mt-1 text-xs text-slate-600">
              {t("runtime.meta.conversation", { conversationId })}
            </p>
          ) : null}
        </header>

        <div className="flex-1 overflow-y-auto p-10">
          <div className="mx-auto max-w-[1120px] space-y-6">
            <nav
              data-testid="agent-runtime-tabs"
              className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
            >
              {runtimeTabs.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={
                      tab.id === "schedules"
                        ? "schedules-tab"
                        : tab.id === "heartbeat"
                          ? "heartbeat-tab"
                          : tab.id === "memory"
                            ? "memory-tab"
                            : `agent-runtime-tab-${tab.id}`
                    }
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors ${tabClass(active)}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            <section
              data-testid={`agent-runtime-panel-${activeTabMeta.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">
                {t("runtime.panel.badge")}
              </p>
              <h2
                className="mt-3 text-2xl font-semibold text-slate-900"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {activeTabMeta.label}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {activeTabMeta.hint}
              </p>

              {activeTabMeta.id === "conversations" ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
                  <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <button
                      type="button"
                      data-testid="new-conversation-button"
                      onClick={async () => {
                        if (!token) {
                          return;
                        }

                        setConversationError(null);
                        setIsCreatingConversation(true);
                        try {
                          await armWrites();
                          const response = await fetch(
                            `/api/control/agents/${encodeURIComponent(agentId)}/conversations/create`,
                            {
                              method: "POST",
                              headers: {
                                authorization: `Bearer ${token}`,
                                "content-type": "application/json",
                                "idempotency-key": `${Date.now()}-runtime-conversation-create`
                              },
                              body: JSON.stringify({
                                workspaceId: conversations[0]?.workspaceId ?? agentId,
                                title: t("runtime.conversations.newTitle")
                              })
                            }
                          );

                          const body = (await response.json()) as {
                            conversation?: ConversationSummary;
                            message?: string;
                          };

                          if (!response.ok || !body.conversation) {
                            throw new Error(formatErrorMessage(response, body, t));
                          }

                          setConversations((previous) => [
                            body.conversation as ConversationSummary,
                            ...previous
                          ]);
                          navigate(
                            `/agents/${encodeURIComponent(agentId)}/runtime/conversations/${encodeURIComponent(
                              body.conversation.id
                            )}`
                          );
                        } catch (error) {
                          setConversationError(
                            error instanceof Error
                              ? error.message
                              : t("runtime.conversations.createFailed")
                          );
                        } finally {
                          setIsCreatingConversation(false);
                        }
                      }}
                      disabled={isCreatingConversation}
                      className="inline-flex w-full items-center justify-center rounded-lg border border-[#1f5ba6]/25 bg-[#eef5ff] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#123f77] transition-colors hover:bg-[#deebff] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingConversation
                        ? t("runtime.conversations.creatingButton")
                        : t("runtime.conversations.newButton")}
                    </button>

                    <ul data-testid="conversation-list" className="mt-3 space-y-1.5">
                      {isConversationsLoading ? (
                        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                          {t("runtime.conversations.listLoading")}
                        </li>
                      ) : conversations.length === 0 ? (
                        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                          {t("runtime.conversations.listEmpty")}
                        </li>
                      ) : (
                        conversations.map((conversation) => {
                          const isActive = conversation.id === conversationId;
                          const displayTitle =
                            isActive && activeConversationDerivedTitle
                              ? resolveConversationTitle(activeConversationDerivedTitle, t)
                              : resolveConversationTitle(conversation.title, t);
                          const isArchived = conversation.status === "archived";
                          return (
                            <li key={conversation.id}>
                              <button
                                type="button"
                                data-testid={`conversation-row-${conversation.id}`}
                                onClick={() => {
                                  setConversationError(null);
                                  navigate(
                                    `/agents/${encodeURIComponent(
                                      agentId
                                    )}/runtime/conversations/${encodeURIComponent(conversation.id)}`
                                  );
                                }}
                                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                                  isActive
                                    ? "border-[#1f5ba6]/30 bg-[#eef5ff] text-[#123f77]"
                                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                }`}
                              >
                                <p className="truncate font-semibold">{displayTitle}</p>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                  {translateConversationStatus(conversation.status, t)}
                                </p>
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </section>

                  <section
                    data-testid="conversation-thread"
                    className="flex min-h-[28rem] flex-col rounded-xl border border-slate-200 bg-white"
                  >
                    <div className="flex-1 space-y-2 overflow-y-auto p-4">
                      {isThreadLoading ? (
                        <p className="text-xs text-slate-500">
                          {t("runtime.conversations.threadLoading")}
                        </p>
                      ) : !conversationId ? (
                        <p className="text-xs text-slate-500">
                          {t("runtime.conversations.selectPrompt")}
                        </p>
                      ) : activeConversation?.status === "archived" ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <p className="text-xs font-semibold text-amber-800">
                            {t("runtime.conversations.archivedTitle")}
                          </p>
                          <p className="text-[11px] text-amber-700">
                            {t("runtime.conversations.archivedHint")}
                          </p>
                        </div>
                      ) : null}
                      {threadMessages.length === 0 &&
                      conversationId &&
                      activeConversation?.status !== "archived" ? (
                        <p className="text-xs text-slate-500">
                          {t("runtime.conversations.emptyThread")}
                        </p>
                      ) : (
                        threadMessages.map((message) => (
                          <article
                            key={message.id}
                            className={`rounded-lg border px-3 py-2 ${
                              message.role === "user"
                                ? "border-slate-200 bg-slate-50"
                                : "border-[#1f5ba6]/20 bg-[#eef5ff]/55"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                {translateMessageRole(message.role, t)}
                              </p>
                              {message.role === "assistant" ? (
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
                                    message.state === "failed"
                                      ? "text-rose-700"
                                      : message.state === "pending"
                                        ? "text-amber-700"
                                        : "text-emerald-700"
                                  }`}
                                >
                                  {translateMessageState(message.state, t)}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {message.content.length > 0
                                ? message.content
                                : message.role === "assistant" && message.state === "pending"
                                  ? "..."
                                  : t("runtime.messages.empty")}
                            </p>
                          </article>
                        ))
                      )}
                    </div>

                    <div className="border-t border-slate-200 p-4">
                      <textarea
                        data-testid="conversation-input"
                        value={composerValue}
                        onChange={(event) => setComposerValue(event.target.value)}
                        disabled={!conversationId || activeConversation?.status === "archived"}
                        className="h-24 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50 disabled:cursor-not-allowed disabled:bg-slate-100"
                        placeholder={
                          activeConversation?.status === "archived"
                            ? t("runtime.conversations.input.archived")
                            : t("runtime.conversations.input.placeholder")
                        }
                      />

                      <div className="mt-3 flex items-center justify-between gap-3">
                        {conversationError ? (
                          <p
                            data-testid="conversation-error-banner"
                            className="text-xs text-rose-700"
                          >
                            {conversationError}
                          </p>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {activeConversation
                              ? resolveConversationTitle(
                                  activeConversationDerivedTitle ?? activeConversation.title,
                                  t
                                )
                              : t("runtime.conversations.noActive")}
                          </span>
                        )}

                        <div className="flex items-center gap-2">
                          {conversationId && activeConversation?.status !== "archived" ? (
                            <button
                              type="button"
                              data-testid="archive-conversation-button"
                              disabled={isArchiving}
                              onClick={() => {
                                void archiveConversation(conversationId);
                              }}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isArchiving
                                ? t("runtime.conversations.archivingButton")
                                : t("runtime.conversations.archiveButton")}
                            </button>
                          ) : null}

                          <button
                            type="button"
                            data-testid="send-message-button"
                            disabled={
                              !conversationId ||
                              isSendingMessage ||
                              composerValue.trim().length === 0 ||
                              activeConversation?.status === "archived"
                            }
                            onClick={async () => {
                              if (!token || !conversationId) {
                                return;
                              }

                              const draft = composerValue;
                              const content = draft.trim();
                              if (content.length === 0) {
                                return;
                              }

                              const now = new Date().toISOString();
                              const optimisticUserId = `temp-user-${Date.now()}`;
                              const optimisticAssistantId = `temp-assistant-${Date.now()}`;

                              const optimisticUserMessage: ConversationMessage = {
                                id: optimisticUserId,
                                conversationId,
                                role: "user",
                                state: "completed",
                                content,
                                errorCode: null,
                                externalMessageId: null,
                                createdAt: now,
                                updatedAt: now
                              };
                              const optimisticAssistantMessage: ConversationMessage = {
                                id: optimisticAssistantId,
                                conversationId,
                                role: "assistant",
                                state: "pending",
                                content: "",
                                errorCode: null,
                                externalMessageId: null,
                                createdAt: now,
                                updatedAt: now
                              };

                              setComposerValue("");
                              setConversationError(null);
                              setIsSendingMessage(true);
                              setThreadMessages((previous) =>
                                sortMessagesChronologically([
                                  ...previous,
                                  optimisticUserMessage,
                                  optimisticAssistantMessage
                                ])
                              );
                              setConversations((previous) =>
                                previous.map((conversation) =>
                                  conversation.id !== conversationId
                                    ? conversation
                                    : {
                                        ...conversation,
                                        title:
                                          resolveConversationTitle(conversation.title, t) ===
                                          t("runtime.conversations.newTitle")
                                            ? summarizeUserMessage(content, t)
                                            : conversation.title,
                                        updatedAt: now,
                                        lastMessageAt: now
                                      }
                                )
                              );

                              try {
                                await armWrites();
                                const response = await fetch(
                                  `/api/control/conversations/${encodeURIComponent(
                                    conversationId
                                  )}/messages/send`,
                                  {
                                    method: "POST",
                                    headers: {
                                      authorization: `Bearer ${token}`,
                                      "content-type": "application/json",
                                      "idempotency-key": `${Date.now()}-runtime-send-message`
                                    },
                                    body: JSON.stringify({ content })
                                  }
                                );

                                const body = (await response.json()) as SendMessageResponse & {
                                  message?: string;
                                };

                                if (!response.ok) {
                                  throw new Error(formatErrorMessage(response, body, t));
                                }

                                setThreadMessages((previous) => {
                                  const withoutOptimistic = previous.filter(
                                    (message) =>
                                      message.id !== optimisticUserId &&
                                      message.id !== optimisticAssistantId
                                  );

                                  const resolvedUser: ConversationMessage =
                                    body.userMessage ?? optimisticUserMessage;
                                  const resolvedAssistant: ConversationMessage =
                                    body.assistantMessage ?? {
                                      ...optimisticAssistantMessage,
                                      state: "completed",
                                      content: ""
                                    };

                                  return sortMessagesChronologically([
                                    ...withoutOptimistic,
                                    resolvedUser,
                                    resolvedAssistant
                                  ]);
                                });
                              } catch (error) {
                                const message =
                                  error instanceof Error
                                    ? error.message
                                    : t("runtime.conversations.sendFailed");
                                setConversationError(message);
                                setComposerValue(draft);
                                setThreadMessages((previous) =>
                                  sortMessagesChronologically(
                                    previous.map((messageEntry) => {
                                      if (messageEntry.id === optimisticAssistantId) {
                                        return {
                                          ...messageEntry,
                                          state: "failed",
                                          content: message,
                                          errorCode: "SEND_FAILED",
                                          updatedAt: new Date().toISOString()
                                        };
                                      }

                                      return messageEntry;
                                    })
                                  )
                                );
                              } finally {
                                setIsSendingMessage(false);
                              }
                            }}
                            className="rounded-lg bg-[#1f5ba6] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#174d92] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSendingMessage
                              ? t("runtime.conversations.sendingButton")
                              : t("runtime.conversations.sendButton")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}

              {activeTabMeta.id === "schedules" ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(17rem,22rem)_1fr]">
                  <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                        {t("runtime.schedules.sectionTitle")}
                      </h3>
                      <button
                        type="button"
                        data-testid="new-schedule-button"
                        onClick={() => {
                          setIsCreatingSchedule(true);
                          setSelectedScheduleId(null);
                          setScheduleRuns([]);
                          setScheduleForm(createDefaultScheduleFormState());
                          setScheduleFormErrors({});
                          setScheduleError(null);
                        }}
                        className="rounded-lg border border-[#1f5ba6]/25 bg-[#eef5ff] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#123f77] transition-colors hover:bg-[#deebff]"
                      >
                        {t("runtime.schedules.newButton")}
                      </button>
                    </div>

                    <ul data-testid="schedule-list" className="mt-3 space-y-1.5">
                      {isSchedulesLoading ? (
                        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                          {t("runtime.schedules.listLoading")}
                        </li>
                      ) : schedules.length === 0 ? (
                        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                          {t("runtime.schedules.listEmpty")}
                        </li>
                      ) : (
                        schedules.map((schedule) => {
                          const isSelected =
                            !isCreatingSchedule && selectedScheduleId === schedule.id;
                          return (
                            <li key={schedule.id}>
                              <div
                                className={`rounded-lg border px-3 py-2 transition-colors ${
                                  isSelected
                                    ? "border-[#1f5ba6]/30 bg-[#eef5ff]"
                                    : "border-slate-200 bg-white"
                                }`}
                              >
                                <button
                                  type="button"
                                  data-testid={`schedule-row-${schedule.id}`}
                                  onClick={() => {
                                    setIsCreatingSchedule(false);
                                    setSelectedScheduleId(schedule.id);
                                    setScheduleError(null);
                                    applyScheduleToForm(schedule);
                                  }}
                                  className="w-full text-left"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-semibold text-slate-800">
                                        {schedule.label}
                                      </p>
                                      <p className="mt-0.5 text-[11px] text-slate-600">
                                        {schedule.cron}
                                      </p>
                                    </div>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                        schedule.enabled
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-slate-200 text-slate-600"
                                      }`}
                                    >
                                      {translateScheduleEnabled(schedule.enabled, t)}
                                    </span>
                                  </div>
                                </button>

                                <div className="mt-2 flex items-center gap-2">
                                  <button
                                    type="button"
                                    data-testid={`schedule-run-button-${schedule.id}`}
                                    onClick={() => {
                                      void runScheduleNow(schedule.id);
                                    }}
                                    disabled={
                                      isScheduleRunningId === schedule.id ||
                                      isScheduleRemovingId === schedule.id
                                    }
                                    className="rounded-md border border-[#1f5ba6]/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#123f77] transition-colors hover:bg-[#eef5ff] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isScheduleRunningId === schedule.id
                                      ? t("runtime.schedules.runningButton")
                                      : t("runtime.schedules.runButton")}
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`schedule-remove-button-${schedule.id}`}
                                    onClick={() => {
                                      void removeSchedule(schedule.id);
                                    }}
                                    disabled={
                                      isScheduleRemovingId === schedule.id ||
                                      isScheduleRunningId === schedule.id
                                    }
                                    className="rounded-md border border-rose-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isScheduleRemovingId === schedule.id
                                      ? t("runtime.schedules.removingButton")
                                      : t("runtime.schedules.removeButton")}
                                  </button>
                                </div>
                              </div>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </section>

                  <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {isCreatingSchedule
                          ? t("runtime.schedules.formCreateTitle")
                          : t("runtime.schedules.formUpdateTitle")}
                      </h3>
                      <div className="mt-3 grid gap-3">
                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                          {t("runtime.schedules.field.name")}
                          <input
                            data-testid="schedule-name-input"
                            value={scheduleForm.name}
                            onChange={(event) => {
                              setScheduleForm((previous) => ({
                                ...previous,
                                name: event.target.value
                              }));
                              setScheduleFormErrors((previous) => ({
                                ...previous,
                                name: undefined
                              }));
                            }}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50"
                          />
                          {scheduleFormErrors.name ? (
                            <span className="text-[11px] normal-case tracking-normal text-rose-700">
                              {scheduleFormErrors.name}
                            </span>
                          ) : null}
                        </label>

                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                          {t("runtime.schedules.field.cron")}
                          <input
                            data-testid="schedule-cron-input"
                            value={scheduleForm.cron}
                            onChange={(event) => {
                              setScheduleForm((previous) => ({
                                ...previous,
                                cron: event.target.value
                              }));
                              setScheduleFormErrors((previous) => ({
                                ...previous,
                                cron: undefined
                              }));
                            }}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50"
                            placeholder="*/10 * * * *"
                          />
                          {scheduleFormErrors.cron ? (
                            <span className="text-[11px] normal-case tracking-normal text-rose-700">
                              {scheduleFormErrors.cron}
                            </span>
                          ) : null}
                        </label>

                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                          {t("runtime.schedules.field.timezone")}
                          <input
                            value={scheduleForm.timezone}
                            onChange={(event) =>
                              setScheduleForm((previous) => ({
                                ...previous,
                                timezone: event.target.value
                              }))
                            }
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50"
                            placeholder="UTC"
                          />
                        </label>

                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                          {t("runtime.schedules.field.sessionKey")}
                          <input
                            value={scheduleForm.sessionKey}
                            onChange={(event) =>
                              setScheduleForm((previous) => ({
                                ...previous,
                                sessionKey: event.target.value
                              }))
                            }
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50"
                            placeholder="dashboard:agent-1:daily-sync"
                          />
                        </label>

                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                          {t("runtime.schedules.field.message")}
                          <textarea
                            data-testid="schedule-message-input"
                            value={scheduleForm.message}
                            onChange={(event) => {
                              setScheduleForm((previous) => ({
                                ...previous,
                                message: event.target.value
                              }));
                              setScheduleFormErrors((previous) => ({
                                ...previous,
                                message: undefined
                              }));
                            }}
                            className="h-24 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50"
                          />
                          {scheduleFormErrors.message ? (
                            <span className="text-[11px] normal-case tracking-normal text-rose-700">
                              {scheduleFormErrors.message}
                            </span>
                          ) : null}
                        </label>

                        {scheduleError ? (
                          <p className="text-xs text-rose-700">{scheduleError}</p>
                        ) : null}

                        <button
                          type="button"
                          data-testid="create-schedule-button"
                          disabled={isScheduleSaving}
                          onClick={() => {
                            void submitSchedule();
                          }}
                          className="rounded-lg bg-[#1f5ba6] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#174d92] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isScheduleSaving
                            ? isCreatingSchedule
                              ? t("runtime.schedules.creatingAction")
                              : t("runtime.schedules.savingAction")
                            : isCreatingSchedule
                              ? t("runtime.schedules.createAction")
                              : t("runtime.schedules.saveAction")}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {t("runtime.schedules.recentRuns")}
                      </h3>
                      {selectedScheduleId ? (
                        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          {selectedSchedule?.label ?? selectedScheduleId}
                        </p>
                      ) : null}

                      <div className="mt-3 space-y-2">
                        {isScheduleRunsLoading ? (
                          <p className="text-xs text-slate-500">
                            {t("runtime.schedules.loadingRuns")}
                          </p>
                        ) : !selectedScheduleId ? (
                          <p className="text-xs text-slate-500">
                            {t("runtime.schedules.selectPrompt")}
                          </p>
                        ) : scheduleRuns.length === 0 ? (
                          <p className="text-xs text-slate-500">{t("runtime.schedules.noRuns")}</p>
                        ) : (
                          scheduleRuns.map((run) => (
                            <article
                              key={run.id}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  {run.id}
                                </p>
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                    run.status === "succeeded"
                                      ? "text-emerald-700"
                                      : run.status === "failed"
                                        ? "text-rose-700"
                                        : "text-amber-700"
                                  }`}
                                >
                                  {translateRunStatus(run.status, t)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-600">
                                {t("runtime.schedules.startedAt", { value: run.startedAt })}
                              </p>
                              {run.finishedAt ? (
                                <p className="text-xs text-slate-600">
                                  {t("runtime.schedules.finishedAt", { value: run.finishedAt })}
                                </p>
                              ) : null}
                              {run.errorCode ? (
                                <p className="text-xs text-rose-700">
                                  {t("runtime.schedules.errorPrefix", { value: run.errorCode })}
                                </p>
                              ) : null}
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}

              {activeTabMeta.id === "heartbeat" ? (
                <section className="mt-4 max-w-3xl rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="grid gap-3">
                    {heartbeatError ? (
                      <p data-testid="heartbeat-error-banner" className="text-xs text-rose-700">
                        {heartbeatError}
                      </p>
                    ) : null}

                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                      {t("runtime.heartbeat.field.every")}
                      <input
                        data-testid="heartbeat-every-input"
                        value={heartbeatForm.every}
                        onChange={(event) => {
                          setHeartbeatForm((previous) => ({
                            ...previous,
                            every: event.target.value
                          }));
                          setHeartbeatFormErrors((previous) => ({ ...previous, every: undefined }));
                        }}
                        disabled={isHeartbeatLoading}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50 disabled:cursor-not-allowed disabled:bg-slate-100"
                        placeholder="*/10 * * * *"
                      />
                      {heartbeatFormErrors.every ? (
                        <span className="text-[11px] normal-case tracking-normal text-rose-700">
                          {heartbeatFormErrors.every}
                        </span>
                      ) : null}
                    </label>

                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                      {t("runtime.heartbeat.field.session")}
                      <input
                        data-testid="heartbeat-session-input"
                        value={heartbeatForm.session}
                        onChange={(event) => {
                          setHeartbeatForm((previous) => ({
                            ...previous,
                            session: event.target.value
                          }));
                          setHeartbeatFormErrors((previous) => ({
                            ...previous,
                            session: undefined
                          }));
                        }}
                        disabled={isHeartbeatLoading}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50 disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                      {heartbeatFormErrors.session ? (
                        <span className="text-[11px] normal-case tracking-normal text-rose-700">
                          {heartbeatFormErrors.session}
                        </span>
                      ) : null}
                    </label>

                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                      {t("runtime.heartbeat.field.prompt")}
                      <textarea
                        value={heartbeatForm.prompt}
                        onChange={(event) =>
                          setHeartbeatForm((previous) => ({
                            ...previous,
                            prompt: event.target.value
                          }))
                        }
                        disabled={isHeartbeatLoading}
                        className="h-24 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50 disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </label>

                    <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                      <input
                        type="checkbox"
                        data-testid="heartbeat-light-context-toggle"
                        checked={heartbeatForm.lightContext}
                        onChange={(event) =>
                          setHeartbeatForm((previous) => ({
                            ...previous,
                            lightContext: event.target.checked
                          }))
                        }
                        disabled={isHeartbeatLoading}
                        className="h-4 w-4 rounded border-slate-300 text-[#1f5ba6] focus:ring-[#1f5ba6]/30"
                      />
                      {t("runtime.heartbeat.lightContext")}
                    </label>

                    <button
                      type="button"
                      data-testid="heartbeat-save-button"
                      onClick={() => {
                        void saveHeartbeat();
                      }}
                      disabled={isHeartbeatSaving || isHeartbeatLoading}
                      className="inline-flex w-fit items-center rounded-lg bg-[#1f5ba6] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#174d92] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isHeartbeatSaving
                        ? t("runtime.heartbeat.savingButton")
                        : t("runtime.heartbeat.saveButton")}
                    </button>
                  </div>
                </section>
              ) : null}

              {activeTabMeta.id === "memory" ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(19rem,1.05fr)_minmax(18rem,0.95fr)]">
                  <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {t("runtime.memory.activePluginSlot")}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {t("runtime.memory.activePluginHint")}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {t("runtime.memory.scoped")}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {memoryError ? (
                        <p data-testid="memory-error-banner" className="text-xs text-rose-700">
                          {memoryError}
                        </p>
                      ) : null}

                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                        {t("runtime.memory.field.provider")}
                        <input
                          data-testid="memory-provider-input"
                          value={memoryForm.provider}
                          onChange={(event) =>
                            setMemoryForm((previous) => ({
                              ...previous,
                              provider: event.target.value
                            }))
                          }
                          disabled={isMemoryLoading || isMemorySaving}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50 disabled:cursor-not-allowed disabled:bg-slate-100"
                          placeholder="openclaw-memory"
                        />
                      </label>

                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                        {t("runtime.memory.field.model")}
                        <input
                          data-testid="memory-model-input"
                          value={memoryForm.model}
                          onChange={(event) =>
                            setMemoryForm((previous) => ({
                              ...previous,
                              model: event.target.value
                            }))
                          }
                          disabled={isMemoryLoading || isMemorySaving}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50 disabled:cursor-not-allowed disabled:bg-slate-100"
                          placeholder="memory-default"
                        />
                      </label>

                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                        {t("runtime.memory.field.baseUrl")}
                        <input
                          data-testid="memory-base-url-input"
                          value={memoryForm.baseUrl}
                          onChange={(event) =>
                            setMemoryForm((previous) => ({
                              ...previous,
                              baseUrl: event.target.value
                            }))
                          }
                          disabled={isMemoryLoading || isMemorySaving}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50 disabled:cursor-not-allowed disabled:bg-slate-100"
                          placeholder="https://memory.example.com"
                        />
                      </label>

                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                        {t("runtime.memory.field.apiKeyRef")}
                        <input
                          data-testid="memory-api-key-ref-input"
                          value={memoryForm.apiKeyRef}
                          onChange={(event) => {
                            setMemoryForm((previous) => ({
                              ...previous,
                              apiKeyRef: event.target.value
                            }));
                            setMemoryFormErrors((previous) => ({
                              ...previous,
                              apiKeyRef: undefined
                            }));
                          }}
                          disabled={isMemoryLoading || isMemorySaving}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition-colors focus:border-[#1f5ba6]/50 disabled:cursor-not-allowed disabled:bg-slate-100"
                          placeholder="secret://memory/default"
                        />
                        {memoryFormErrors.apiKeyRef ? (
                          <span className="text-[11px] normal-case tracking-normal text-rose-700">
                            {memoryFormErrors.apiKeyRef}
                          </span>
                        ) : null}
                      </label>

                      <button
                        type="button"
                        data-testid="memory-save-button"
                        onClick={() => {
                          void saveMemory();
                        }}
                        disabled={isMemoryLoading || isMemorySaving}
                        className="inline-flex w-fit items-center rounded-lg bg-[#1f5ba6] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#174d92] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isMemorySaving
                          ? t("runtime.memory.savingButton")
                          : t("runtime.memory.saveButton")}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {t("runtime.memory.scopeSummary")}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {t("runtime.memory.scopeSummaryHint")}
                        </p>
                      </div>
                      {isMemoryLoading ? (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t("runtime.memory.loading")}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2.5">
                      {memoryScopes.map((scope) => (
                        <article
                          key={scope.scope}
                          data-testid={`memory-scope-row-${scope.scope}`}
                          className={`rounded-xl border px-3 py-3 ${
                            scope.scope === "system"
                              ? "border-slate-200 bg-slate-50"
                              : "border-[#1f5ba6]/15 bg-[#eef5ff]/45"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                {translateMemoryScope(scope.scope, t)}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {scope.namespace}
                              </p>
                            </div>
                            {scope.readonly ? (
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {t("runtime.memory.readOnly")}
                              </span>
                            ) : null}
                          </div>
                          <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                            <div>
                              <dt className="font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {t("runtime.memory.retentionLabel")}
                              </dt>
                              <dd className="mt-1 leading-5">{scope.retention}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {t("runtime.memory.updatedLabel")}
                              </dt>
                              <dd className="mt-1 leading-5">
                                {scope.updatedAt ?? t("runtime.memory.notConfigured")}
                              </dd>
                            </div>
                            <div className="sm:col-span-2">
                              <dt className="font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {t("runtime.memory.summaryLabel")}
                              </dt>
                              <dd className="mt-1 leading-5 text-slate-700">{scope.summary}</dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
