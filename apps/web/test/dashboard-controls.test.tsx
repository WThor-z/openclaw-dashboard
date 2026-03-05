import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/app/App.js";

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

function installFetchMock({ resolveStatus = 200 }: { resolveStatus?: number } = {}) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl.startsWith("/api/status")) {
        return createJsonResponse(200, { ok: true, status: "connected" });
      }

      if (requestUrl.startsWith("/api/events")) {
        return createJsonResponse(200, {
          items: [
            {
              id: "event-1",
              kind: "approval.requested",
              level: "info",
              source: "gateway",
              createdAt: "2026-03-05T00:00:00.000Z",
              payload: {
                approvalId: "approval-1",
                summary: "Approve deployment"
              }
            }
          ]
        });
      }

      if (requestUrl.startsWith("/api/tasks")) {
        return createJsonResponse(200, {
          items: [{ id: "task-1", state: "running", summary: "Deploy build" }]
        });
      }

      if (requestUrl.startsWith("/api/costs/daily")) {
        return createJsonResponse(200, {
          days: [{ date: "2026-03-05", amountUsd: 1.2, entryCount: 3, model: "gpt-5.3" }]
        });
      }

      if (requestUrl.startsWith("/api/sessions/") && !requestUrl.startsWith("/api/sessions?")) {
        return createJsonResponse(200, {
          session: {
            id: "session-1",
            workspaceId: "ws-1",
            status: "running",
            startedAt: "2026-03-05T00:00:00.000Z",
            endedAt: null
          }
        });
      }

      if (requestUrl.startsWith("/api/sessions")) {
        return createJsonResponse(200, {
          items: [
            {
              id: "session-1",
              workspaceId: "ws-1",
              status: "running",
              startedAt: "2026-03-05T00:00:00.000Z",
              endedAt: null
            }
          ]
        });
      }

      if (requestUrl.startsWith("/api/control/approvals/") && init?.method === "POST") {
        if (resolveStatus >= 400) {
          return createJsonResponse(resolveStatus, { code: "APPROVAL_FAILED" });
        }
        return createJsonResponse(200, { ok: true, resolved: true });
      }

      return Promise.reject(new Error(`Unhandled fetch URL: ${requestUrl}`));
    });
}

async function loginToDashboard() {
  fireEvent.change(screen.getByTestId("daemon-token-input"), {
    target: { value: "dev-token" }
  });
  fireEvent.click(screen.getByTestId("connect-button"));
  await screen.findByTestId("nav-events");
}

async function navigateToEvents() {
  fireEvent.click(screen.getByTestId("nav-events"));
  await screen.findByTestId("events-filter-input");
}

async function navigateToTasks() {
  fireEvent.click(screen.getByTestId("nav-tasks"));
  // Wait for tasks to load - look for any task-related element
  await screen.findAllByTestId("task-row");
}

async function navigateToApprovals() {
  fireEvent.click(screen.getByTestId("nav-approvals"));
  // Wait for approvals to load - look for the approval-row element
  await screen.findByTestId("approval-row");
}

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});

describe("dashboard realtime panels", () => {
  it("renders status, events, tasks, and resolves approval successfully", async () => {
    installFetchMock();
    render(<App />);

    await loginToDashboard();

    expect((await screen.findByTestId("connection-status")).textContent).toContain("connected");
    
    // Navigate to events module to check events
    await navigateToEvents();
    expect(await screen.findAllByTestId("event-row")).toHaveLength(1);
    
    // Navigate to tasks module to check tasks
    await navigateToTasks();
    expect(await screen.findAllByTestId("task-row")).toHaveLength(1);

    // Navigate to approvals module to resolve approval
    await navigateToApprovals();
    fireEvent.click(await screen.findByTestId("approve-button"));
    fireEvent.click(await screen.findByTestId("confirm-approve-button"));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("审批已处理");
    });
    expect(screen.getByTestId("approval-row").textContent).toContain("已处理");
  });

  it("keeps approval pending and shows failure message when resolve fails", async () => {
    installFetchMock({ resolveStatus: 500 });
    render(<App />);

    await loginToDashboard();

    // Navigate to approvals module
    await navigateToApprovals();
    fireEvent.click(await screen.findByTestId("approve-button"));
    fireEvent.click(await screen.findByTestId("confirm-approve-button"));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("审批处理失败");
    });
    expect(screen.getByTestId("approval-row").textContent).toContain("待审批");
    expect(screen.getByTestId("retry-approval-button")).toBeTruthy();
  });
});
