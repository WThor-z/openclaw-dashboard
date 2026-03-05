import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/app/App.js";

type MockOptions = {
  failingDeliveries?: boolean;
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

function installFetchMock({ failingDeliveries = false }: MockOptions = {}) {
  const webhooks: Array<{
    id: string;
    endpointUrl: string;
    secretRef: string;
    enabled: number;
    lastStatus?: string | null;
  }> = [];
  const deliveriesByWebhook = new Map<
    string,
    Array<{
      id: string;
      status: string;
      attemptCount: number;
      responseCode: number | null;
      nextAttemptAt: string | null;
      lastError: string | null;
    }>
  >();
  let enqueueCount = 0;

  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl.startsWith("/api/status")) {
        return createJsonResponse(200, { ok: true, status: "connected" });
      }
      if (requestUrl.startsWith("/api/events?limit=25")) {
        return createJsonResponse(200, { items: [] });
      }
      if (requestUrl.startsWith("/api/tasks")) {
        return createJsonResponse(200, { items: [] });
      }
      if (requestUrl.startsWith("/api/costs/daily")) {
        return createJsonResponse(200, { days: [] });
      }
      if (requestUrl.startsWith("/api/sessions/")) {
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
      if (requestUrl.startsWith("/api/monitors/workspaces")) {
        return createJsonResponse(200, {
          items: [
            {
              workspace: "agent-a",
              fileCount: 8,
              totalBytes: 4096,
              hotFileCount: 2,
              hotFiles: [{ path: "logs/error.log", sizeBytes: 200, modifiedAt: "2026-03-05T00:00:00.000Z" }],
              failureMarkers: ["logs/error.log"]
            }
          ]
        });
      }
      if (requestUrl.startsWith("/api/monitors/openclaw")) {
        return createJsonResponse(200, {
          snapshot: {
            status: "ok",
            exists: true,
            expectedFiles: [
              { path: "errors.json", exists: true },
              { path: "state/session-registry.json", exists: true }
            ]
          }
        });
      }
      if (requestUrl.startsWith("/api/webhooks?workspaceId=global")) {
        return createJsonResponse(200, {
          workspaceId: "global",
          items: webhooks
        });
      }
      if (requestUrl.startsWith("/api/webhooks/") && requestUrl.endsWith("/deliveries")) {
        const webhookId = decodeURIComponent(requestUrl.split("/api/webhooks/")[1].split("/deliveries")[0]);
        return createJsonResponse(200, {
          webhook: webhooks.find((entry) => entry.id === webhookId) ?? null,
          items: deliveriesByWebhook.get(webhookId) ?? []
        });
      }
      if (requestUrl.startsWith("/api/control/arm") && init?.method === "POST") {
        return createJsonResponse(200, { ok: true, armed: true, armWindowMs: 30000 });
      }
      if (requestUrl.startsWith("/api/control/webhooks/create") && init?.method === "POST") {
        const parsed = JSON.parse(String(init.body ?? "{}")) as {
          endpointUrl?: string;
          secretRef?: string;
        };
        const webhookId = `wh-${webhooks.length + 1}`;
        webhooks.unshift({
          id: webhookId,
          endpointUrl: parsed.endpointUrl ?? "",
          secretRef: parsed.secretRef ?? "",
          enabled: 1,
          lastStatus: null
        });
        return createJsonResponse(200, { ok: true, webhookId, enabled: true });
      }
      if (
        requestUrl.includes("/api/control/webhooks/") &&
        requestUrl.endsWith("/update") &&
        init?.method === "POST"
      ) {
        const webhookId = decodeURIComponent(requestUrl.split("/api/control/webhooks/")[1].split("/update")[0]);
        const parsed = JSON.parse(String(init.body ?? "{}")) as {
          endpointUrl?: string;
          secretRef?: string;
          enabled?: boolean;
        };
        const target = webhooks.find((entry) => entry.id === webhookId);
        if (target) {
          target.endpointUrl = parsed.endpointUrl ?? target.endpointUrl;
          target.secretRef = parsed.secretRef ?? target.secretRef;
          target.enabled = parsed.enabled === false ? 0 : 1;
        }
        return createJsonResponse(200, { ok: true, webhookId, enabled: target?.enabled === 1 });
      }
      if (
        requestUrl.includes("/api/control/webhooks/") &&
        requestUrl.endsWith("/disable") &&
        init?.method === "POST"
      ) {
        const webhookId = decodeURIComponent(requestUrl.split("/api/control/webhooks/")[1].split("/disable")[0]);
        const target = webhooks.find((entry) => entry.id === webhookId);
        if (target) {
          target.enabled = 0;
        }
        return createJsonResponse(200, { ok: true, webhookId, enabled: false });
      }
      if (
        requestUrl.includes("/api/control/webhooks/") &&
        requestUrl.endsWith("/enqueue") &&
        init?.method === "POST"
      ) {
        const webhookId = decodeURIComponent(requestUrl.split("/api/control/webhooks/")[1].split("/enqueue")[0]);
        const target = webhooks.find((entry) => entry.id === webhookId);
        enqueueCount += 1;

        if (failingDeliveries && enqueueCount === 1) {
          deliveriesByWebhook.set(webhookId, [
            {
              id: "delivery-1",
              status: "failed",
              attemptCount: 1,
              responseCode: 500,
              nextAttemptAt: null,
              lastError: "upstream unavailable"
            }
          ]);
          if (target) {
            target.lastStatus = "failed";
          }
        } else if (failingDeliveries) {
          deliveriesByWebhook.set(webhookId, [
            {
              id: "delivery-1",
              status: "retrying",
              attemptCount: 2,
              responseCode: 500,
              nextAttemptAt: "2026-03-05T00:05:00.000Z",
              lastError: "upstream unavailable"
            }
          ]);
          if (target) {
            target.lastStatus = "retrying";
          }
        } else {
          deliveriesByWebhook.set(webhookId, [
            {
              id: "delivery-1",
              status: "delivered",
              attemptCount: 1,
              responseCode: 200,
              nextAttemptAt: null,
              lastError: null
            }
          ]);
          if (target) {
            target.lastStatus = "delivered";
          }
        }

        return createJsonResponse(200, {
          ok: true,
          webhookId,
          deliveryId: "delivery-1",
          status: "pending"
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
  await screen.findByTestId("nav-webhooks");
}

async function createWebhookViaUi() {
  fireEvent.click(screen.getByTestId("add-webhook-button"));
  fireEvent.change(screen.getByTestId("webhook-endpoint-input"), {
    target: { value: "https://receiver.test/webhook" }
  });
  fireEvent.change(screen.getByTestId("webhook-secret-ref-input"), {
    target: { value: "WH_SECRET_ALIAS" }
  });
  fireEvent.click(screen.getByTestId("save-webhook-button"));

  await waitFor(() => {
    expect(screen.getAllByTestId("webhook-card")).toHaveLength(1);
  });
}

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});

describe("webhook center and monitoring", () => {
  it("creates webhook, sends test event, and shows monitoring cards", async () => {
    installFetchMock();
    render(<App />);

    await loginToDashboard();
    await createWebhookViaUi();

    expect(await screen.findByTestId("workspace-monitor-card")).toBeTruthy();
    expect((await screen.findByTestId("openclaw-status-indicator")).textContent).toContain("ok");

    fireEvent.click(screen.getByTestId("send-test-event-button"));
    fireEvent.click(screen.getByText("View deliveries"));

    await waitFor(() => {
      expect(screen.getByTestId("delivery-row").textContent).toContain("succeeded");
    });
    expect(screen.getAllByTestId("redaction-indicator").length).toBeGreaterThan(0);
  });

  it("shows failed delivery reason and transitions to retrying", async () => {
    installFetchMock({ failingDeliveries: true });
    render(<App />);

    await loginToDashboard();
    await createWebhookViaUi();

    fireEvent.click(screen.getByTestId("send-test-event-button"));
    fireEvent.click(screen.getByText("View deliveries"));

    await waitFor(() => {
      expect(screen.getByTestId("delivery-row").textContent).toContain("failed");
    });
    expect(screen.getByTestId("delivery-error-reason").textContent).toContain("upstream unavailable");

    fireEvent.click(screen.getByTestId("retry-delivery-button"));

    await waitFor(() => {
      expect(screen.getByTestId("delivery-row").textContent).toContain("retrying");
    });
  });
});
