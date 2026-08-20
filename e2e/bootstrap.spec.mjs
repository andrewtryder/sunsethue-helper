import { test, expect } from "@playwright/test";

const CORE_FIXTURES = {
  locations: [
    {
      id: "loc-1",
      name: "Forecast Harbor",
      latitude: 40.7,
      longitude: -74.0,
      latestSunriseQuality: 0.7,
      latestSunriseText: "Good",
      latestSunriseTime: "2026-08-01T10:15:00.000Z",
      latestSunsetQuality: 0.8,
      latestSunsetText: "Great",
      latestSunsetTime: "2026-08-01T00:45:00.000Z"
    }
  ],
  runs: [],
  applicationSettings: {
    scheduleTimezone: "America/New_York",
    displayTimezoneMode: "schedule",
    displayTimezone: null,
    scheduleTimes: ["06:00", "12:00", "18:00"],
    weeklySelfTestEnabled: false,
    weeklySelfTestMode: "passive",
    weeklySelfTestDay: 0,
    weeklySelfTestTime: "10:00",
    scheduledReportsEnabled: false,
    scheduledReportTimes: [],
    scheduledReportChannels: [],
    quota: {
      scheduledRunsPerDay: 3,
      activeLocations: 1,
      estimatedRequestsPerDay: 3,
      estimatedRequestsPer30Days: 90,
      remainingCredits: null
    }
  }
};

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

async function stubCoreApis(page) {
  await page.route("**/api/locations", (route) => fulfillJson(route, CORE_FIXTURES.locations));
  await page.route("**/api/runs", (route) => fulfillJson(route, CORE_FIXTURES.runs));
  await page.route("**/api/application-settings**", (route) => {
    if (route.request().method() === "GET") {
      return fulfillJson(route, CORE_FIXTURES.applicationSettings);
    }
    return fulfillJson(route, {});
  });
}

test.describe("Bootstrap does not wait on optional APIs", () => {
  test("pending provider-credentials does not block Forecast loader", async ({ page }) => {
    await stubCoreApis(page);
    await page.route("**/api/provider-credentials", () => new Promise(() => {}));
    await page.route("**/api/notification-settings", (route) => fulfillJson(route, {
      emailEnabled: false,
      emailTo: null,
      pushoverEnabled: false,
      pushoverDevice: null,
      pushoverPriority: 0,
      pushoverSound: null,
      webhookEnabled: false,
      emailConfigured: false,
      pushoverConfigured: false,
      webhookConfigured: false
    }));
    await page.route("**/api/notification-health", (route) => fulfillJson(route, { state: "disabled", channels: [] }));
    await page.route("**/api/setup-status", (route) => fulfillJson(route, { databaseTables: "ready" }));
    await page.route("**/api/location-notification-rules**", (route) => fulfillJson(route, { rules: [] }));
    await page.route("**/api/web-push/**", (route) => fulfillJson(route, { subscriptions: [] }));
    await page.route("**/api/history/**", (route) => fulfillJson(route, { count: 0 }));

    await page.goto("/");
    await expect(page.locator("#loading-overlay")).toHaveClass(/fade-out/, { timeout: 8_000 });
    await expect(page.locator("#pane-main")).toBeVisible();
    await expect(page.getByText("Forecast Harbor").first()).toBeAttached();

    await page.locator("#nav-settings").click();
    await expect(page.locator("#pane-settings")).toBeVisible();
    await expect(
      page.getByText(/Credential status temporarily unavailable/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("pending notification-settings does not block Forecast loader", async ({ page }) => {
    await stubCoreApis(page);
    await page.route("**/api/notification-settings", () => new Promise(() => {}));
    await page.route("**/api/provider-credentials", (route) => fulfillJson(route, {
      email: { configured: false },
      pushover: { configured: false }
    }));
    await page.route("**/api/notification-health", () => new Promise(() => {}));
    await page.route("**/api/setup-status", () => new Promise(() => {}));

    await page.goto("/");
    await expect(page.locator("#loading-overlay")).toHaveClass(/fade-out/, { timeout: 8_000 });
    await expect(page.locator("#pane-main")).toBeVisible();
    await expect(page.getByText("Forecast Harbor").first()).toBeAttached();
  });

  test("blocked browser-notifications module does not prevent Forecast init", async ({ page }) => {
    const coreApiHits = { locations: 0, runs: 0, applicationSettings: 0 };

    await page.route("**/features/browser-notifications.js", (route) => route.abort("blockedbyclient"));
    await page.route("**/api/locations", async (route) => {
      coreApiHits.locations += 1;
      await fulfillJson(route, CORE_FIXTURES.locations);
    });
    await page.route("**/api/runs", async (route) => {
      coreApiHits.runs += 1;
      await fulfillJson(route, CORE_FIXTURES.runs);
    });
    await page.route("**/api/application-settings**", async (route) => {
      if (route.request().method() === "GET") {
        coreApiHits.applicationSettings += 1;
        await fulfillJson(route, CORE_FIXTURES.applicationSettings);
        return;
      }
      await fulfillJson(route, {});
    });
    await page.route("**/api/provider-credentials", (route) => fulfillJson(route, {
      email: { configured: false },
      pushover: { configured: false }
    }));
    await page.route("**/api/notification-settings", (route) => fulfillJson(route, {
      emailEnabled: false,
      emailTo: null,
      pushoverEnabled: false,
      pushoverDevice: null,
      pushoverPriority: 0,
      pushoverSound: null,
      webhookEnabled: false,
      emailConfigured: false,
      pushoverConfigured: false,
      webhookConfigured: false
    }));
    await page.route("**/api/notification-health", (route) => fulfillJson(route, { state: "disabled", channels: [] }));
    await page.route("**/api/setup-status", (route) => fulfillJson(route, { databaseTables: "ready" }));
    await page.route("**/api/location-notification-rules**", (route) => fulfillJson(route, { rules: [] }));
    await page.route("**/api/history/**", (route) => fulfillJson(route, { count: 0 }));

    await page.goto("/");
    await expect(page.locator("#loading-overlay")).toHaveClass(/fade-out/, { timeout: 8_000 });
    await expect(page.locator("#pane-main")).toBeVisible();
    await expect(page.getByText("Forecast Harbor").first()).toBeAttached();
    await expect(page.locator("#bootstrap-fatal-banner")).toHaveCount(0);

    expect(coreApiHits.locations).toBeGreaterThan(0);
    expect(coreApiHits.runs).toBeGreaterThan(0);
    expect(coreApiHits.applicationSettings).toBeGreaterThan(0);

    await page.locator("#nav-settings").click();
    await expect(page.locator("#pane-settings")).toBeVisible();
    await expect(
      page.getByText(/Browser notifications unavailable in this browser/i).first()
    ).toBeVisible({ timeout: 8_000 });
    await expect(page.locator("#enable-web-push-btn")).toBeDisabled();
  });

  test("manifest.webmanifest is requested successfully", async ({ page }) => {
    await stubCoreApis(page);
    await page.goto("/");
    await expect(page.locator("#loading-overlay")).toHaveClass(/fade-out/, { timeout: 8_000 });
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const response = await page.request.get(new URL(href, page.url()).href);
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(400);
    const body = await response.json();
    expect(body.name || body.short_name).toBeTruthy();
  });
});
