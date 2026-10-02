import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL=https://<deployment> npm run e2e   -> runs against a deployed app
// npm run e2e                                      -> local dev server (started if not running)
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" },
  projects: [{ name: "android-phone", use: { ...devices["Pixel 7"] } }],
  // Locally: the web app plus the portal worker (which starts the mock portal).
  // Against a deployment, the worker is expected to be running on its VPS.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
        { command: "npm run worker", url: "http://127.0.0.1:4010/healthz", reuseExistingServer: true, timeout: 120_000 },
      ],
});
