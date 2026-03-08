import path from "node:path";

import { expect, test } from "@playwright/test";

const SCREENSHOT_PATH = path.join(
  ".sisyphus",
  "evidence",
  "openclaw-agent-workspace",
  "task-11-agent-workspace.png"
);
const LOGIN_TOKEN = process.env.E2E_LOGIN_TOKEN ?? "dev-token";

test("opens agent workspace and saves README.md", async ({ page }) => {
  let fileContent = "# README\n\nInitial content.";
  let fileModifiedAt = "2026-03-06T00:00:00.000Z";
  let lastSaveHeaders: Record<string, string> | null = null;
  let saveRequestCount = 0;

  await page.route("**/api/auth/check", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, authorized: true })
    });
  });

  await page.route("**/api/agents", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "agent-1",
            name: "Alpha",
            role: "worker",
            workspacePath: "/workspace/alpha",
            status: "idle",
            updatedAt: "2026-03-06T00:00:00.000Z"
          }
        ]
      })
    });
  });

  await page.route("**/api/agents/agent-1/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "idle", updatedAt: "2026-03-06T00:00:00.000Z" })
    });
  });

  await page.route("**/api/agents/agent-1/files**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith("/files")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              name: "README.md",
              path: "README.md",
              isDirectory: false
            }
          ]
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: fileContent, modifiedAt: fileModifiedAt })
    });
  });

  await page.route("**/api/control/arm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, armed: true })
    });
  });

  await page.route("**/api/control/agents/agent-1/files/**", async (route) => {
    saveRequestCount += 1;
    lastSaveHeaders = route.request().headers();

    const payload = route.request().postDataJSON() as { content?: unknown };
    if (typeof payload.content === "string") {
      fileContent = payload.content;
    }
    fileModifiedAt = `2026-03-06T00:00:0${saveRequestCount}.000Z`;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modifiedAt: fileModifiedAt })
    });
  });

  await page.goto("/login");
  await page.getByTestId("daemon-token-input").fill(LOGIN_TOKEN);
  await page.getByTestId("connect-button").click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("agent-workspace-title")).toBeVisible();

  await page.getByTestId("agent-card-agent-1").click();

  await expect(page.getByText("Alpha").first()).toBeVisible();
  await page.locator('a[href="/agents/agent-1/pinned-files"]').click();

  await expect(page).toHaveURL(/\/agents\/agent-1\/pinned-files$/);
  await expect(page.getByRole("heading", { name: "Pinned Files" })).toBeVisible();
  await expect(page.getByText("README.md")).toBeVisible();
  await page.getByRole("checkbox").check();
  await expect(page.getByText("1 selected")).toBeVisible();

  await page.getByRole("button", { name: "Back to overview" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.locator('a[href="/agents/agent-1/workspace"]').click();

  await expect(page).toHaveURL(/\/agents\/agent-1\/workspace$/);
  await page.getByRole("listitem").getByText("README.md").click();

  await expect(page.getByText("Modified: 2026-03-06T00:00:00.000Z")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();

  const updatedContent = "# README\n\nUpdated from E2E save.";
  await page.locator("textarea").fill(updatedContent);
  await page.getByRole("button", { name: "Save" }).click();

  await expect.poll(() => saveRequestCount).toBe(1);
  expect(saveRequestCount).toBe(1);
  expect(fileContent).toBe(updatedContent);
  expect(lastSaveHeaders?.["idempotency-key"]).toBeTruthy();

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
});
