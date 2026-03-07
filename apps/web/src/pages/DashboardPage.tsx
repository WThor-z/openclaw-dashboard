import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../app/auth.js";
import { useI18n } from "../app/i18n.js";
import { DashboardSidebar } from "../components/DashboardSidebar.js";
import { OverviewPanel } from "../components/OverviewPanel.js";
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
import { MonitoringPanel } from "../features/monitoring/MonitoringPanel.js";
import { WebhookCenterPanel } from "../features/webhooks/WebhookCenterPanel.js";

function createIdempotencyKey(seed: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${seed}-${crypto.randomUUID()}`;
  }
  return `${seed}-${Date.now()}`;
}

function parseConfigDiff(value: unknown): ConfigDiffEntry[] {
  if (!Array.isArray(value)) return [];
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
  const { t } = useI18n();
  const { token } = useAuth();
  const [activeModule, setActiveModule] = useState("overview");
  const [connectionStatus, setConnectionStatus] = useState("loading");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Data states
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
  
  // Config states
  const [configModelValue, setConfigModelValue] = useState("gpt-5.3");
  const [configTemperatureValue, setConfigTemperatureValue] = useState("0.2");
  const [configValidationError, setConfigValidationError] = useState<string | null>(null);
  const [configPreview, setConfigPreview] = useState<ConfigPreview | null>(null);
  const [configPreviewOpen, setConfigPreviewOpen] = useState(false);
  const [configPreviewDraftKey, setConfigPreviewDraftKey] = useState<string | null>(null);
  const [configVersion, setConfigVersion] = useState(0);
  const [isPreviewingConfig, setIsPreviewingConfig] = useState(false);
  const [isApplyingConfig, setIsApplyingConfig] = useState(false);
  
  // Approval states
  const [failedApprovalIds, setFailedApprovalIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submittingApprovalId, setSubmittingApprovalId] = useState<string | null>(null);

  const moduleMeta = useMemo<Record<string, { title: string; subtitle: string; category: string }>>(
    () => ({
      overview: { title: t("dashboard.page.overview.title"), subtitle: t("dashboard.page.overview.subtitle"), category: t("dashboard.group.core") },
      events: { title: t("dashboard.page.events.title"), subtitle: t("dashboard.page.events.subtitle"), category: t("dashboard.group.core") },
      tasks: { title: t("dashboard.page.tasks.title"), subtitle: t("dashboard.page.tasks.subtitle"), category: t("dashboard.group.core") },
      approvals: { title: t("dashboard.page.approvals.title"), subtitle: t("dashboard.page.approvals.subtitle"), category: t("dashboard.group.core") },
      config: { title: t("dashboard.page.config.title"), subtitle: t("dashboard.page.config.subtitle"), category: t("dashboard.group.operations") },
      costs: { title: t("dashboard.page.costs.title"), subtitle: t("dashboard.page.costs.subtitle"), category: t("dashboard.group.health") },
      sessions: { title: t("dashboard.page.sessions.title"), subtitle: t("dashboard.page.sessions.subtitle"), category: t("dashboard.group.operations") },
      webhooks: { title: t("dashboard.page.webhooks.title"), subtitle: t("dashboard.page.webhooks.subtitle"), category: t("dashboard.group.operations") },
      monitoring: { title: t("dashboard.page.monitoring.title"), subtitle: t("dashboard.page.monitoring.subtitle"), category: t("dashboard.group.health") }
    }),
    [t]
  );

  const activeModuleMeta = moduleMeta[activeModule] ?? moduleMeta.overview;

  const configDraftKey = useMemo(
    () => `${configModelValue}::${configTemperatureValue}`,
    [configModelValue, configTemperatureValue]
  );

  const authHeaders = useMemo(
    () => ({ authorization: `Bearer ${token ?? ""}` }),
    [token]
  );

  // Data fetching
  const refreshReadPanels = useCallback(async () => {
    try {
      const [statusResponse, eventsResponse, tasksResponse, costsResponse, sessionsResponse] =
        await Promise.all([
          fetch("/api/status", { headers: authHeaders }),
          fetch("/api/events?limit=25", { headers: authHeaders }),
          fetch("/api/tasks", { headers: authHeaders }),
          fetch("/api/costs/daily", { headers: authHeaders }),
          fetch("/api/sessions", { headers: authHeaders })
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
      
      setLastUpdate(new Date());
    } catch {
      setConnectionStatus("disconnected");
    }
  }, [authHeaders]);

  useEffect(() => {
    let disposed = false;
    async function runInitialLoad() {
      if (!disposed) await refreshReadPanels();
    }
    runInitialLoad();
    const intervalId = window.setInterval(() => void refreshReadPanels(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [refreshReadPanels]);

  const visibleEvents = useMemo(() => {
    const normalizedFilter = eventFilter.trim().toLowerCase();
    if (!normalizedFilter) return events;
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

        if (!response.ok) throw new Error("Approval request failed");

        setApprovals((previous) =>
          previous.map((item) =>
            item.id === approvalId ? { ...item, status: "resolved" } : item
          )
        );
        setFailedApprovalIds((previous) => previous.filter((item) => item !== approvalId));
        setStatusMessage(t("dashboard.status.approvalResolved"));
      } catch {
        setFailedApprovalIds((previous) =>
          previous.includes(approvalId) ? previous : [...previous, approvalId]
        );
        setStatusMessage(t("dashboard.status.approvalFailed"));
      } finally {
        setSubmittingApprovalId(null);
      }
    },
    [t, token]
  );

  const selectedTimeline = useMemo<SessionTimelineItem[]>(() => {
    if (!selectedSessionId) return [];
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
      setConfigValidationError(t("dashboard.status.modelRequired"));
      return null;
    }
    const temperature = Number.parseFloat(configTemperatureValue);
    if (!Number.isFinite(temperature)) {
      setConfigValidationError(t("dashboard.status.temperatureNumber"));
      return null;
    }
    setConfigValidationError(null);
    return { model, temperature };
  }, [configModelValue, configTemperatureValue, t]);

  const armWrites = useCallback(async () => {
    const response = await fetch("/api/control/arm", {
      method: "POST",
      headers: { authorization: `Bearer ${token ?? ""}` }
    });
    if (!response.ok) throw new Error(t("dashboard.status.armFailed"));
  }, [t, token]);

  const previewConfigDiff = useCallback(async () => {
    const configDraft = parseConfigDraft();
    if (!configDraft) return;
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
        body: JSON.stringify({ workspaceId: "global", config: configDraft })
      });
      if (!response.ok) throw new Error(t("dashboard.status.diffFailed"));
      const body = (await response.json()) as { baseVersion?: number; diff?: unknown };
      const nextPreview: ConfigPreview = {
        baseVersion: Number(body.baseVersion ?? 0),
        diff: parseConfigDiff(body.diff)
      };
      setConfigPreview(nextPreview);
      setConfigPreviewOpen(true);
      setConfigVersion(nextPreview.baseVersion);
      setConfigPreviewDraftKey(configDraftKey);
      setStatusMessage(t("dashboard.status.diffReady"));
    } catch {
      setStatusMessage(t("dashboard.status.previewFailed"));
    } finally {
      setIsPreviewingConfig(false);
    }
  }, [armWrites, configDraftKey, parseConfigDraft, t, token]);

  const canApplyConfig =
    Boolean(configPreview) && configPreviewDraftKey === configDraftKey && !configValidationError;

  const applyConfig = useCallback(async () => {
    if (!configPreview || !canApplyConfig) return;
    const configDraft = parseConfigDraft();
    if (!configDraft) return;
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
      if (!response.ok) throw new Error(t("dashboard.status.applyFailed"));
      const body = (await response.json()) as { version?: number };
      const nextVersion = Number(body.version ?? configPreview.baseVersion + 1);
      setConfigVersion(nextVersion);
      setConfigPreviewOpen(false);
      setStatusMessage(t("dashboard.status.applied"));
    } catch {
      setStatusMessage(t("dashboard.status.applyFailed"));
    } finally {
      setIsApplyingConfig(false);
    }
  }, [armWrites, canApplyConfig, configPreview, parseConfigDraft, t, token]);

  const openSessionDrilldown = useCallback(async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        headers: authHeaders
      });
      if (!response.ok) throw new Error(t("dashboard.status.loadSessionFailed"));
      const body = (await response.json()) as { session?: { status?: string } };
      setSelectedSessionStatus(body.session?.status ?? null);
    } catch {
      setSelectedSessionStatus(t("dashboard.status.unknown"));
    }
  }, [authHeaders, t]);

  // Calculate stats for overview
  const stats = useMemo(() => ({
    totalEvents: events.length,
    pendingTasks: tasks.filter(t => t.state === "queued" || t.state === "running").length,
    pendingApprovals: approvals.filter(a => a.status === "pending").length,
    todayCost: costDays.length > 0 ? costDays[costDays.length - 1].amountUsd : 0
  }), [events, tasks, approvals, costDays]);

  const renderModuleContent = () => {
    switch (activeModule) {
      case "overview":
        return (
          <>
            <OverviewPanel stats={stats} />
            <div className="content-grid content-grid-2">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <div className="card-icon blue">⚡</div>
                    {t("dashboard.section.recentEvents")}
                  </div>
                </div>
                <div className="card-body">
                  <EventsPanel 
                    events={visibleEvents.slice(0, 5)} 
                    filterValue={eventFilter} 
                    onFilterChange={setEventFilter} 
                  />
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <div className="card-icon orange">✅</div>
                    {t("dashboard.section.pendingApprovals")}
                  </div>
                </div>
                <div className="card-body">
                  <ApprovalsPanel
                    approvals={approvals.slice(0, 3)}
                    failedApprovalIds={new Set(failedApprovalIds)}
                    submittingId={submittingApprovalId}
                    onResolve={resolveApproval}
                  />
                </div>
              </div>
            </div>
          </>
        );
      case "events":
        return (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon blue">⚡</div>
                {t("dashboard.section.eventTimeline")}
              </div>
            </div>
            <div className="card-body">
              <EventsPanel 
                events={visibleEvents} 
                filterValue={eventFilter} 
                onFilterChange={setEventFilter} 
              />
            </div>
          </div>
        );
      case "tasks":
        return (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon orange">📋</div>
                {t("dashboard.section.taskQueue")}
              </div>
            </div>
            <div className="card-body">
              <TasksPanel tasks={tasks} />
            </div>
          </div>
        );
      case "approvals":
        return (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon green">✅</div>
                {t("dashboard.section.approvalManagement")}
              </div>
            </div>
            <div className="card-body">
              <ApprovalsPanel
                approvals={approvals}
                failedApprovalIds={new Set(failedApprovalIds)}
                submittingId={submittingApprovalId}
                onResolve={resolveApproval}
              />
            </div>
          </div>
        );
      case "config":
        return (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon blue">⚙️</div>
                {t("dashboard.section.configCenter")}
              </div>
            </div>
            <div className="card-body">
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
                onModelChange={(value) => { setConfigModelValue(value); setConfigValidationError(null); setConfigPreviewDraftKey(null); }}
                onTemperatureChange={(value) => { setConfigTemperatureValue(value); setConfigValidationError(null); setConfigPreviewDraftKey(null); }}
                onPreview={previewConfigDiff}
                onApply={applyConfig}
                onClosePreview={() => setConfigPreviewOpen(false)}
              />
            </div>
          </div>
        );
      case "costs":
        return (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon red">💰</div>
                {t("dashboard.section.costAnalytics")}
              </div>
            </div>
            <div className="card-body">
              <CostAnalyticsPanel days={costDays} />
            </div>
          </div>
        );
      case "sessions":
        return (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon blue">💬</div>
                {t("dashboard.section.sessionExplorer")}
              </div>
            </div>
            <div className="card-body">
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
                onOpenDrilldown={(id) => void openSessionDrilldown(id)}
              />
            </div>
          </div>
        );
      case "webhooks":
        return (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon orange">🔔</div>
                {t("dashboard.section.webhookManagement")}
              </div>
            </div>
            <div className="card-body">
              <WebhookCenterPanel token={token} />
            </div>
          </div>
        );
      case "monitoring":
        return (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon green">📈</div>
                {t("dashboard.section.systemMonitoring")}
              </div>
            </div>
            <div className="card-body">
              <MonitoringPanel token={token} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="dashboard-layout">
      <DashboardSidebar
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        connectionStatus={connectionStatus}
      />
      
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-left">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">{activeModuleMeta.category}</p>
              <h1 className="header-title">{activeModuleMeta.title}</h1>
              <p className="text-xs text-slate-600">{activeModuleMeta.subtitle}</p>
            </div>
          </div>
          <div className="header-actions">
            {lastUpdate && (
              <span className="text-sm text-muted">
                {t("dashboard.meta.lastUpdate", { value: lastUpdate.toLocaleTimeString() })}
              </span>
            )}
          </div>
        </header>
        
        <div className="dashboard-content">
          <div className="dashboard-content-inner dashboard-module-stack">
            {statusMessage && (
              <div
                className={`alert ${statusMessage.toLowerCase().includes("failed") || statusMessage.includes("失败") ? "alert-error" : "alert-success"}`}
              >
                {statusMessage}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setStatusMessage(null)}
                  style={{ marginLeft: "auto" }}
                >
                  ✕
                </button>
              </div>
            )}
            {renderModuleContent()}
          </div>
        </div>
      </main>
    </div>
  );
}
