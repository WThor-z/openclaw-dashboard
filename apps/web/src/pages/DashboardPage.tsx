import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../app/auth.js";
import { ApprovalsPanel, type ApprovalItem } from "../features/approvals/ApprovalsPanel.js";
import { EventsPanel, type EventItem } from "../features/events/EventsPanel.js";
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

export function DashboardPage() {
  const { signOut, token } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState("loading");
  const [eventFilter, setEventFilter] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [failedApprovalIds, setFailedApprovalIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [submittingApprovalId, setSubmittingApprovalId] = useState<string | null>(null);

  const refreshReadPanels = useCallback(async () => {
    try {
      const [statusResponse, eventsResponse, tasksResponse] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/events?limit=25"),
        fetch("/api/tasks")
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
            payload?: { approvalId?: string; summary?: string };
          }>;
        };
        const nextEvents = (eventsBody.items ?? []).map((entry) => ({
          id: entry.id,
          createdAt: entry.createdAt,
          kind: entry.kind,
          level: entry.level,
          source: entry.source
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
    } catch {
      setConnectionStatus("disconnected");
    }
  }, []);

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
        setToastMessage("Approval resolved");
      } catch {
        setFailedApprovalIds((previous) =>
          previous.includes(approvalId) ? previous : [...previous, approvalId]
        );
        setToastMessage("Approval failed");
      } finally {
        setSubmittingApprovalId(null);
      }
    },
    [token]
  );

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
      {toastMessage ? <p role="status">{toastMessage}</p> : null}
    </main>
  );
}
