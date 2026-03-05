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
    expect(await screen.findAllByTestId("event-row")).toHaveLength(1);
    expect(await screen.findAllByTestId("task-row")).toHaveLength(1);

    fireEvent.click(await screen.findByTestId("approve-button"));
    fireEvent.click(await screen.findByTestId("confirm-approve-button"));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Approval resolved");
    });
    expect(screen.getByTestId("approval-row").textContent).toContain("resolved");
  });

  it("keeps approval pending and shows failure message when resolve fails", async () => {
    installFetchMock({ resolveStatus: 500 });
    render(<App />);

    await loginToDashboard();

    fireEvent.click(await screen.findByTestId("approve-button"));
    fireEvent.click(await screen.findByTestId("confirm-approve-button"));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Approval failed");
    });
    expect(screen.getByTestId("approval-row").textContent).toContain("pending");
    expect(screen.getByTestId("retry-approval-button")).toBeTruthy();
  });
});
