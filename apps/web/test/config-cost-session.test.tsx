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

function installFetchMock() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl.startsWith("/api/auth/check")) {
        return createJsonResponse(200, { ok: true, authorized: true });
      }

      if (requestUrl.startsWith("/api/status")) {
        return createJsonResponse(200, { ok: true, status: "connected" });
      }

      if (requestUrl.startsWith("/api/events?limit=25")) {
        return createJsonResponse(200, {
          items: [
            {
              id: "event-1",
              kind: "approval.requested",
              level: "info",
              source: "gateway",
              sessionId: "session-1",
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
          days: [
            { date: "2026-03-05", amountUsd: 1.5, entryCount: 5, model: "gpt-5.3" },
            { date: "2026-03-04", amountUsd: 0.4, entryCount: 2, model: "gpt-5.3" }
          ]
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

      if (requestUrl.startsWith("/api/control/arm") && init?.method === "POST") {
        return createJsonResponse(200, { ok: true, armed: true, armWindowMs: 30000 });
      }

      if (requestUrl.startsWith("/api/control/config/diff") && init?.method === "POST") {
        return createJsonResponse(200, {
          ok: true,
          baseVersion: 3,
          diff: [
            {
              path: "model",
              before: "gpt-5",
              after: "gpt-5.3"
            }
          ]
        });
      }

      if (requestUrl.startsWith("/api/control/config/apply") && init?.method === "POST") {
        return createJsonResponse(200, {
          ok: true,
          workspaceId: "global",
          version: 4
        });
      }

      return Promise.reject(new Error(`Unhandled fetch URL: ${requestUrl}`));
    });
}

async function loginToDashboard() {
  fireEvent.change(screen.getByTestId("daemon-token-input"), {
    target: { value: "dev-token" }
  });
  fireEvent.click(screen.getByTestId("connect-button"));
  await screen.findByTestId("nav-config");
}

async function navigateToCosts() {
  fireEvent.click(screen.getByTestId("nav-costs"));
  await screen.findByTestId("cost-model-filter");
}

async function navigateToConfig() {
  fireEvent.click(screen.getByTestId("nav-config"));
  await screen.findByTestId("config-model-input");
}

async function navigateToSessions() {
  fireEvent.click(screen.getByTestId("nav-sessions"));
  await screen.findByTestId("session-search-input");
}

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});

describe("config, costs, and sessions modules", () => {
  it("shows config diff modal, applies config, and opens session drilldown", async () => {
    installFetchMock();
    render(<App />);

    await loginToDashboard();
    
    // Navigate to costs module to check cost data
    await navigateToCosts();
    expect(await screen.findAllByTestId("cost-row")).toHaveLength(2);
    expect(await screen.findByTestId("cost-anomaly-badge")).toBeTruthy();

    // Navigate to sessions module to check session drilldown
    await navigateToSessions();
    fireEvent.click(await screen.findByTestId("open-session-drilldown-button"));
    await screen.findByTestId("session-drilldown");

    // Navigate to config module to test config functionality
    await navigateToConfig();
    fireEvent.click(await screen.findByTestId("preview-diff-button"));
    await screen.findByTestId("config-diff-modal");

    const applyButton = screen.getByTestId("apply-config-button") as HTMLButtonElement;
    expect(applyButton.disabled).toBe(false);
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("配置已应用");
    });
    expect(screen.getByTestId("config-version-badge").textContent).toContain("4");
  });

  it("blocks invalid config preview and keeps apply disabled", async () => {
    const fetchSpy = installFetchMock();
    render(<App />);

    await loginToDashboard();
    await navigateToConfig();

    fireEvent.change(screen.getByTestId("config-temperature-input"), {
      target: { value: "not-a-number" }
    });
    fireEvent.click(screen.getByTestId("preview-diff-button"));

    expect(screen.getByRole("alert").textContent).toBe("温度值必须是数字");
    expect((screen.getByTestId("apply-config-button") as HTMLButtonElement).disabled).toBe(true);

    const diffCalls = fetchSpy.mock.calls.filter(([input]) => {
      const requestUrl = typeof input === "string" ? input : input.toString();
      return requestUrl.startsWith("/api/control/config/diff");
    });
    expect(diffCalls).toHaveLength(0);
  });
});
