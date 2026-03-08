import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_EXTERNAL_BASE_URL;
const baseURL = externalBaseUrl && externalBaseUrl.length > 0 ? externalBaseUrl : "http://127.0.0.1:4173";
const useExternalServer = Boolean(externalBaseUrl && externalBaseUrl.length > 0);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/playwright",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  webServer: useExternalServer
    ? undefined
    : {
        command: "pnpm --filter @apps/web dev --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 120_000
      },
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  }
});
