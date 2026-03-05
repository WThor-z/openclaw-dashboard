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
