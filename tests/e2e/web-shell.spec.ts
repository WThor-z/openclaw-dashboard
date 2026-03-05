import path from "node:path";

import { expect, test } from "@playwright/test";

const HAPPY_SCREENSHOT_PATH = path.join(".sisyphus", "evidence", "task-11-web-shell.png");
const ERROR_SCREENSHOT_PATH = path.join(
  ".sisyphus",
  "evidence",
  "task-11-web-shell-error.png"
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
