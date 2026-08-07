import { defineConfig, devices } from "@playwright/test";

/**
 * Local-only browser E2E. Never point at production.
 * Start the stack first: `npm run e2e:stack` (or `DEV_AUTH_BYPASS=true npm run dev`).
 */
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/demo.spec.mjs"],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5010",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
