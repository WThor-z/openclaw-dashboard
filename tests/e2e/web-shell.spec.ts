import path from "node:path";

import { expect, test } from "@playwright/test";

const HAPPY_SCREENSHOT_PATH = path.join(".sisyphus", "evidence", "task-11-web-shell.png");
const ERROR_SCREENSHOT_PATH = path.join(
  ".sisyphus",
  "evidence",
  "task-11-web-shell-error.png"
);
const TASK12_HAPPY_SCREENSHOT_PATH = path.join(
  ".sisyphus",
  "evidence",
  "task-12-realtime.png"
);
const TASK12_ERROR_SCREENSHOT_PATH = path.join(
  ".sisyphus",
  "evidence",
  "task-12-realtime-error.png"
);
const TASK13_HAPPY_SCREENSHOT_PATH = path.join(
  ".sisyphus",
  "evidence",
  "task-13-config-cost-session.png"
);
const TASK13_ERROR_SCREENSHOT_PATH = path.join(
  ".sisyphus",
  "evidence",
  "task-13-config-cost-session-error.png"
);

test("connects with daemon token and shows dashboard navigation", async ({ page }) => {
  await page.goto("/login");

  await page.getByTestId("daemon-token-input").fill("dev-token");
  await page.getByTestId("connect-button").click();

  await expect(page.getByTestId("nav-events")).toBeVisible();
  await expect(page.getByTestId("nav-config")).toBeVisible();
  await page.screenshot({ path: HAPPY_SCREENSHOT_PATH, fullPage: true });
});

test("shows required token validation on empty submit", async ({ page }) => {
  await page.goto("/login");

  await page.getByTestId("connect-button").click();

  await expect(page.getByText("Token is required")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: ERROR_SCREENSHOT_PATH, fullPage: true });
});

test("streams events and resolves approval with confirmation", async ({ page }) => {
  await page.route("**/api/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "connected" })
    });
  });
  await page.route("**/api/events?limit=25", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "event-1",
            kind: "approval.requested",
            level: "info",
            source: "gateway",
            createdAt: "2026-03-05T00:00:00.000Z",
            payload: {
              approvalId: "approval-1",
              summary: "Approve release"
            }
          }
        ]
      })
    });
  });
  await page.route("**/api/tasks", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{ id: "task-1", state: "running", summary: "Deploy release" }]
      })
    });
  });
  await page.route("**/api/control/approvals/**/resolve", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, resolved: true })
    });
  });

  await page.goto("/login");
  await page.getByTestId("daemon-token-input").fill("dev-token");
  await page.getByTestId("connect-button").click();

  await expect(page.getByTestId("event-row")).toHaveCount(1);
  await page.getByTestId("approve-button").first().click();
  await page.getByTestId("confirm-approve-button").click();

  await expect(page.getByRole("status")).toContainText("Approval resolved");
  await page.screenshot({ path: TASK12_HAPPY_SCREENSHOT_PATH, fullPage: true });
});

test("shows approval failure and keeps retry option", async ({ page }) => {
  await page.route("**/api/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "connected" })
    });
  });
  await page.route("**/api/events?limit=25", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "event-1",
            kind: "approval.requested",
            level: "info",
            source: "gateway",
            createdAt: "2026-03-05T00:00:00.000Z",
            payload: {
              approvalId: "approval-1",
              summary: "Approve release"
            }
          }
        ]
      })
    });
  });
  await page.route("**/api/tasks", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{ id: "task-1", state: "running", summary: "Deploy release" }]
      })
    });
  });
  await page.route("**/api/control/approvals/**/resolve", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ code: "APPROVAL_FAILED" })
    });
  });

  await page.goto("/login");
  await page.getByTestId("daemon-token-input").fill("dev-token");
  await page.getByTestId("connect-button").click();

  await page.getByTestId("approve-button").first().click();
  await page.getByTestId("confirm-approve-button").click();

  await expect(page.getByRole("status")).toContainText("Approval failed");
  await expect(page.getByTestId("retry-approval-button")).toBeVisible();
  await page.screenshot({ path: TASK12_ERROR_SCREENSHOT_PATH, fullPage: true });
});

test("previews and applies config while showing costs and session drilldown", async ({ page }) => {
  await page.route("**/api/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "connected" })
    });
  });
  await page.route("**/api/events?limit=25", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
              summary: "Approve release"
            }
          }
        ]
      })
    });
  });
  await page.route("**/api/tasks", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{ id: "task-1", state: "running", summary: "Deploy release" }]
      })
    });
  });
  await page.route("**/api/costs/daily", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        days: [
          { date: "2026-03-05", amountUsd: 1.5, entryCount: 5, model: "gpt-5.3" },
          { date: "2026-03-04", amountUsd: 0.4, entryCount: 2, model: "gpt-5.3" }
        ]
      })
    });
  });
  await page.route("**/api/sessions", async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.includes("/api/sessions/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: "session-1",
            workspaceId: "ws-1",
            status: "running",
            startedAt: "2026-03-05T00:00:00.000Z",
            endedAt: null
          }
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "session-1",
            workspaceId: "ws-1",
            status: "running",
            startedAt: "2026-03-05T00:00:00.000Z",
            endedAt: null
          }
        ]
      })
    });
  });
  await page.route("**/api/control/arm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, armed: true, armWindowMs: 30000 })
    });
  });
  await page.route("**/api/control/config/diff", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        baseVersion: 3,
        diff: [{ path: "model", before: "gpt-5", after: "gpt-5.3" }]
      })
    });
  });
  await page.route("**/api/control/config/apply", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, workspaceId: "global", version: 4 })
    });
  });

  await page.goto("/login");
  await page.getByTestId("daemon-token-input").fill("dev-token");
  await page.getByTestId("connect-button").click();

  await page.getByTestId("open-session-drilldown-button").first().click();
  await expect(page.getByTestId("session-drilldown")).toBeVisible();

  await page.getByTestId("preview-diff-button").click();
  await expect(page.getByTestId("config-diff-modal")).toBeVisible();
  await page.getByTestId("apply-config-button").click();

  await expect(page.getByRole("status")).toContainText("Config applied");
  await expect(page.getByTestId("config-version-badge")).toContainText("4");
  await page.screenshot({ path: TASK13_HAPPY_SCREENSHOT_PATH, fullPage: true });
});

test("blocks invalid config and keeps apply button disabled", async ({ page }) => {
  await page.route("**/api/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "connected" })
    });
  });
  await page.route("**/api/events?limit=25", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: []
      })
    });
  });
  await page.route("**/api/tasks", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] })
    });
  });
  await page.route("**/api/costs/daily", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ days: [] })
    });
  });
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] })
    });
  });

  await page.goto("/login");
  await page.getByTestId("daemon-token-input").fill("dev-token");
  await page.getByTestId("connect-button").click();

  await page.getByTestId("config-temperature-input").fill("not-a-number");
  await page.getByTestId("preview-diff-button").click();

  await expect(page.getByText("Temperature must be numeric")).toBeVisible();
  await expect(page.getByTestId("apply-config-button")).toBeDisabled();
  await page.screenshot({ path: TASK13_ERROR_SCREENSHOT_PATH, fullPage: true });
});
