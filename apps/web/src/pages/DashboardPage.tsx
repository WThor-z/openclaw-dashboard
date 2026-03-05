import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../app/auth.js";
import { ApprovalsPanel, type ApprovalItem } from "../features/approvals/ApprovalsPanel.js";
import {
  ConfigCenterPanel,
  type ConfigDiffEntry,
  type ConfigPreview
} from "../features/config/ConfigCenterPanel.js";
import { CostAnalyticsPanel, type CostDay } from "../features/costs/CostAnalyticsPanel.js";
import { EventsPanel, type EventItem } from "../features/events/EventsPanel.js";
import {
  SessionExplorerPanel,
  type SessionItem,
  type SessionTimelineItem
} from "../features/sessions/SessionExplorerPanel.js";
import { TasksPanel, type TaskItem } from "../features/tasks/TasksPanel.js";

const MODULE_NAV = [
  { id: "events", label: "Events" },
  { id: "tasks", label: "Tasks" },
  { id: "approvals", label: "Approvals" },
  { id: "config", label: "Config" },
  { id: "costs", label: "Costs" },
  { id: "sessions", label: "Sessions" },
  { id: "webhooks", label: "Webhooks" },
  { id: "monitoring", label: "Monitoring" }
];

function createIdempotencyKey(seed: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${seed}-${crypto.randomUUID()}`;
  }

  return `${seed}-${Date.now()}`;
}

function parseConfigDiff(value: unknown): ConfigDiffEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => entry !== null && typeof entry === "object")
    .map((entry) => {
      const candidate = entry as { path?: string; before?: unknown; after?: unknown };
      return {
        path: typeof candidate.path === "string" ? candidate.path : "(unknown)",
        before: candidate.before,
        after: candidate.after
      };
    });
}

export function DashboardPage() {
  const { signOut, token } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState("loading");
  const [eventFilter, setEventFilter] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [costDays, setCostDays] = useState<CostDay[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionFromDate, setSessionFromDate] = useState("");
  const [sessionToDate, setSessionToDate] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionStatus, setSelectedSessionStatus] = useState<string | null>(null);

  const [configModelValue, setConfigModelValue] = useState("gpt-5.3");
  const [configTemperatureValue, setConfigTemperatureValue] = useState("0.2");
  const [configValidationError, setConfigValidationError] = useState<string | null>(null);
  const [configPreview, setConfigPreview] = useState<ConfigPreview | null>(null);
  const [configPreviewOpen, setConfigPreviewOpen] = useState(false);
  const [configPreviewDraftKey, setConfigPreviewDraftKey] = useState<string | null>(null);
  const [configVersion, setConfigVersion] = useState(0);
  const [isPreviewingConfig, setIsPreviewingConfig] = useState(false);
  const [isApplyingConfig, setIsApplyingConfig] = useState(false);

  const [failedApprovalIds, setFailedApprovalIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submittingApprovalId, setSubmittingApprovalId] = useState<string | null>(null);

  const configDraftKey = useMemo(
    () => `${configModelValue}::${configTemperatureValue}`,
    [configModelValue, configTemperatureValue]
  );

  const refreshReadPanels = useCallback(async () => {
    try {
      const [statusResponse, eventsResponse, tasksResponse, costsResponse, sessionsResponse] =
        await Promise.all([
        fetch("/api/status"),
        fetch("/api/events?limit=25"),
        fetch("/api/tasks"),
        fetch("/api/costs/daily"),
        fetch("/api/sessions")
      ]);

      if (statusResponse.ok) {
        const statusBody = (await statusResponse.json()) as { status?: string };
        setConnectionStatus(statusBody.status ?? "connected");
      } else {
        setConnectionStatus("degraded");
      }

      if (eventsResponse.ok) {
        const eventsBody = (await eventsResponse.json()) as {
          items?: Array<{
            id: string;
            createdAt: string;
            kind: string;
            level: string;
            source: string;
            sessionId?: string | null;
            payload?: { approvalId?: string; summary?: string };
          }>;
        };
        const nextEvents = (eventsBody.items ?? []).map((entry) => ({
          id: entry.id,
          createdAt: entry.createdAt,
          kind: entry.kind,
          level: entry.level,
          source: entry.source,
          sessionId: entry.sessionId ?? null
        }));
        setEvents(nextEvents);

        const nextApprovals: ApprovalItem[] = (eventsBody.items ?? [])
          .filter((entry) => entry.kind.toLowerCase().includes("approval"))
          .map((entry) => ({
            id: entry.payload?.approvalId ?? entry.id,
            summary: entry.payload?.summary ?? entry.kind,
            status: "pending"
          }));
        setApprovals((previous) => {
          const resolvedMap = new Map(previous.map((item) => [item.id, item.status]));
          return nextApprovals.map((item) => ({
            ...item,
            status: resolvedMap.get(item.id) ?? item.status
          }));
        });
        setFailedApprovalIds((previous) =>
          previous.filter((approvalId) => nextApprovals.some((item) => item.id === approvalId))
        );
      }

      if (tasksResponse.ok) {
        const tasksBody = (await tasksResponse.json()) as {
          items?: Array<{ id: string; state: string; summary: string | null }>;
        };
        setTasks(tasksBody.items ?? []);
      }

      if (costsResponse.ok) {
        const costsBody = (await costsResponse.json()) as {
          days?: Array<{ date: string; amountUsd: number; entryCount: number; model?: string }>;
        };
        setCostDays(
          (costsBody.days ?? []).map((day) => ({
            date: day.date,
            amountUsd: Number(day.amountUsd),
            entryCount: Number(day.entryCount),
            model: day.model ?? "all"
          }))
        );
      }

      if (sessionsResponse.ok) {
        const sessionsBody = (await sessionsResponse.json()) as {
          items?: Array<SessionItem>;
        };
        setSessions(sessionsBody.items ?? []);
      }
    } catch {
      setConnectionStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    setConfigPreviewDraftKey(null);
  }, [configDraftKey]);

  useEffect(() => {
    let disposed = false;

    async function runInitialLoad() {
      if (!disposed) {
        await refreshReadPanels();
      }
    }

    runInitialLoad();

    const intervalId = window.setInterval(() => {
      void refreshReadPanels();
    }, 3000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [refreshReadPanels]);

  const visibleEvents = useMemo(() => {
    const normalizedFilter = eventFilter.trim().toLowerCase();
    if (!normalizedFilter) {
      return events;
    }

    return events.filter((entry) => {
      const searchable = `${entry.kind} ${entry.level} ${entry.source}`.toLowerCase();
      return searchable.includes(normalizedFilter);
    });
  }, [eventFilter, events]);

  const resolveApproval = useCallback(
    async (approvalId: string, decision: "approve" | "reject") => {
      setSubmittingApprovalId(approvalId);
      try {
        const idempotencyKey =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${approvalId}`;

        const response = await fetch(`/api/control/approvals/${encodeURIComponent(approvalId)}/resolve`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token ?? ""}`,
            "content-type": "application/json",
            "idempotency-key": idempotencyKey
          },
          body: JSON.stringify({ decision })
        });

        if (!response.ok) {
          throw new Error("Approval request failed");
        }

        setApprovals((previous) =>
          previous.map((item) =>
            item.id === approvalId
              ? {
                ...item,
                status: "resolved"
              }
              : item
          )
        );
        setFailedApprovalIds((previous) => previous.filter((item) => item !== approvalId));
        setStatusMessage("Approval resolved");
      } catch {
        setFailedApprovalIds((previous) =>
          previous.includes(approvalId) ? previous : [...previous, approvalId]
        );
        setStatusMessage("Approval failed");
      } finally {
        setSubmittingApprovalId(null);
      }
    },
    [token]
  );

  const selectedTimeline = useMemo<SessionTimelineItem[]>(() => {
    if (!selectedSessionId) {
      return [];
    }

    return events
      .filter((entry) => entry.sessionId === selectedSessionId)
      .map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        level: entry.level,
        createdAt: entry.createdAt
      }));
  }, [events, selectedSessionId]);

  const parseConfigDraft = useCallback(() => {
    const model = configModelValue.trim();
    if (!model) {
      setConfigValidationError("Model is required");
      return null;
    }

    const temperature = Number.parseFloat(configTemperatureValue);
    if (!Number.isFinite(temperature)) {
      setConfigValidationError("Temperature must be numeric");
      return null;
    }

    setConfigValidationError(null);
    return {
      model,
      temperature
    };
  }, [configModelValue, configTemperatureValue]);

  const armWrites = useCallback(async () => {
    const response = await fetch("/api/control/arm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token ?? ""}`
      }
    });

    if (!response.ok) {
      throw new Error("Failed to arm writes");
    }
  }, [token]);

  const previewConfigDiff = useCallback(async () => {
    const configDraft = parseConfigDraft();
    if (!configDraft) {
      return;
    }

    setIsPreviewingConfig(true);
    try {
      await armWrites();

      const response = await fetch("/api/control/config/diff", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token ?? ""}`,
          "content-type": "application/json",
          "idempotency-key": createIdempotencyKey("config-diff")
        },
        body: JSON.stringify({
          workspaceId: "global",
          config: configDraft
        })
      });

      if (!response.ok) {
        throw new Error("Failed config diff");
      }

      const body = (await response.json()) as {
        baseVersion?: number;
        diff?: unknown;
      };
      const nextPreview: ConfigPreview = {
        baseVersion: Number(body.baseVersion ?? 0),
        diff: parseConfigDiff(body.diff)
      };

      setConfigPreview(nextPreview);
      setConfigPreviewOpen(true);
      setConfigVersion(nextPreview.baseVersion);
      setConfigPreviewDraftKey(configDraftKey);
      setStatusMessage("Config diff ready");
    } catch {
      setStatusMessage("Config preview failed");
    } finally {
      setIsPreviewingConfig(false);
    }
  }, [armWrites, configDraftKey, parseConfigDraft, token]);

  const canApplyConfig =
    Boolean(configPreview) && configPreviewDraftKey === configDraftKey && !configValidationError;

  const applyConfig = useCallback(async () => {
    if (!configPreview || !canApplyConfig) {
      return;
    }

    const configDraft = parseConfigDraft();
    if (!configDraft) {
      return;
    }

    setIsApplyingConfig(true);
    try {
      await armWrites();

      const response = await fetch("/api/control/config/apply", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token ?? ""}`,
          "content-type": "application/json",
          "idempotency-key": createIdempotencyKey("config-apply")
        },
        body: JSON.stringify({
          workspaceId: "global",
          baseVersion: configPreview.baseVersion,
          config: configDraft
        })
      });

      if (!response.ok) {
        throw new Error("Failed config apply");
      }

      const body = (await response.json()) as { version?: number };
      const nextVersion = Number(body.version ?? configPreview.baseVersion + 1);
      setConfigVersion(nextVersion);
      setConfigPreviewOpen(false);
      setStatusMessage("Config applied");
    } catch {
      setStatusMessage("Config apply failed");
    } finally {
      setIsApplyingConfig(false);
    }
  }, [armWrites, canApplyConfig, configPreview, parseConfigDraft, token]);

  const openSessionDrilldown = useCallback(async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
      if (!response.ok) {
        throw new Error("Failed to load session detail");
      }
      const body = (await response.json()) as { session?: { status?: string } };
      setSelectedSessionStatus(body.session?.status ?? null);
    } catch {
      setSelectedSessionStatus("unknown");
    }
  }, []);

  return (
    <main>
      <header>
        <h1>Control Plane</h1>
        <p data-testid="connection-status">Connection: {connectionStatus}</p>
        <button onClick={signOut} type="button">
          Sign out
        </button>
      </header>
      <nav aria-label="Dashboard modules">
        <ul>
          {MODULE_NAV.map((entry) => (
            <li key={entry.id}>
              <a data-testid={`nav-${entry.id}`} href="#" onClick={(event) => event.preventDefault()}>
                {entry.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <EventsPanel events={visibleEvents} filterValue={eventFilter} onFilterChange={setEventFilter} />
      <TasksPanel tasks={tasks} />
      <ApprovalsPanel
        approvals={approvals}
        failedApprovalIds={new Set(failedApprovalIds)}
        submittingId={submittingApprovalId}
        onResolve={resolveApproval}
      />

      <ConfigCenterPanel
        modelValue={configModelValue}
        temperatureValue={configTemperatureValue}
        currentVersion={configVersion}
        validationError={configValidationError}
        preview={configPreview}
        previewOpen={configPreviewOpen}
        canApply={canApplyConfig}
        isPreviewing={isPreviewingConfig}
        isApplying={isApplyingConfig}
        onModelChange={(nextValue) => {
          setConfigModelValue(nextValue);
          setConfigValidationError(null);
        }}
        onTemperatureChange={(nextValue) => {
          setConfigTemperatureValue(nextValue);
          setConfigValidationError(null);
        }}
        onPreview={previewConfigDiff}
        onApply={applyConfig}
        onClosePreview={() => setConfigPreviewOpen(false)}
      />

      <CostAnalyticsPanel days={costDays} />

      <SessionExplorerPanel
        sessions={sessions}
        searchValue={sessionSearch}
        fromDate={sessionFromDate}
        toDate={sessionToDate}
        selectedSessionId={selectedSessionId}
        selectedSessionStatus={selectedSessionStatus}
        selectedTimeline={selectedTimeline}
        onSearchChange={setSessionSearch}
        onFromDateChange={setSessionFromDate}
        onToDateChange={setSessionToDate}
        onOpenDrilldown={(sessionId) => {
          void openSessionDrilldown(sessionId);
        }}
      />

      {statusMessage ? <p role="status">{statusMessage}</p> : null}
    </main>
  );
}
