import { defineConfig, devices } from "@playwright/test";

/**
 * Demo-only Playwright config. Serves against the local subpath server
 * (`npm run demo:serve`), not the full app stack.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/demo.spec.mjs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } }
  ]
});
