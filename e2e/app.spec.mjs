import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

test.describe("Horizon app smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/provider-credentials**", async (route) => {
      if (route.request().method() === "GET") {
        await fulfillJson(route, {
          email: { configured: false },
          pushover: { configured: false }
        });
        return;
      }
      await fulfillJson(route, {});
    });
  });

  test("initializes and switches tabs", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#loading-overlay")).toHaveClass(/fade-out/, { timeout: 30_000 });
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });

    await page.locator('[data-tab="locations"]:visible').first().click();
    await expect(page.locator("#pane-locations")).toBeVisible();
    await expect(page.locator("#check-times-locations-section")).toHaveCount(0);
    await expect(page.locator("#pane-locations #check-times-block")).toHaveCount(0);
    await expect(page.locator("#location-rules-grid")).toBeVisible();
    await expect(page.locator("#location-rules-grid .location-config-empty, #location-rules-grid .loc-rule-card").first()).toBeVisible();
    const locationsHeading = page.locator("#pane-locations h2");
    await expect(locationsHeading).toBeVisible();
    const headingBox = await locationsHeading.boundingBox();
    const listBox = await page.locator("#location-rules-grid").boundingBox();
    expect(headingBox && listBox && listBox.y > headingBox.y).toBeTruthy();

    await page.locator('[data-tab="activity"]:visible').first().click();
    await expect(page.locator("#pane-activity")).toBeVisible();

    await page.locator("#nav-settings").click();
    await expect(page.locator("#pane-settings")).toBeVisible();
    await expect(page.locator("#channel-card-email")).toBeVisible();
    await expect(page.locator("#notification-email-enabled")).toBeAttached();
    await expect(page.locator("#email-enabled-pill")).toBeVisible();
    await expect(page.locator("#channel-card-pushover")).toBeVisible();
    await expect(page.locator("#channel-card-webpush")).toBeVisible();
    await expect(page.locator("#channel-card-webhook")).toBeVisible();
    await expect(page.locator("#pane-settings #check-times-block")).toBeVisible();
    await expect(page.locator("#schedule-times-pills")).toBeVisible();
    await expect(page.locator("#schedule-timezone")).toBeVisible();
    await expect(page.locator("#schedule-timezone")).toHaveJSProperty("tagName", "SELECT");
    await expect(page.locator('input[name="display-timezone-mode"]')).toHaveCount(0);
    await expect(page.locator("#display-timezone")).toHaveCount(0);
    await expect(page.locator("#iana-timezone-list")).toHaveCount(0);
    await expect(page.locator("#schedule-timezone")).toHaveValue("America/New_York");
    const optionLabels = await page.locator("#schedule-timezone option").allTextContents();
    expect(optionLabels.some((label) => /America\/New_York \(UTC[−+-]/.test(label))).toBeTruthy();
    expect(optionLabels.some((label) => label.includes("Europe/London"))).toBeTruthy();
    expect(optionLabels.some((label) => label.includes("Asia/Tokyo"))).toBeTruthy();
    const groupLabels = await page.locator("#schedule-timezone optgroup").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("label"))
    );
    expect(groupLabels[0]).toBe("United States");
    expect(groupLabels[1]).toBe("Europe");
    expect(groupLabels[2]).toBe("Other time zones");
  });

  test("settings timezone select validates before PUT", async ({ page }) => {
    let putCount = 0;
    let lastBody = null;
    await page.route("**/api/application-settings", async (route) => {
      if (route.request().method() === "GET") {
        await fulfillJson(route, {
          scheduleTimezone: "America/New_York",
          displayTimezoneMode: "schedule",
          displayTimezone: null,
          scheduleTimes: ["06:00", "12:00", "18:00"],
          weeklySelfTestEnabled: true,
          weeklySelfTestMode: "passive",
          weeklySelfTestDay: 0,
          weeklySelfTestTime: "10:00",
          scheduledReportsEnabled: false,
          scheduledReportTimes: [],
          scheduledReportChannels: [],
          quota: {
            estimatedRequestsPer30Days: 540,
            scheduledRunsPerDay: 3,
            activeLocations: 6,
            estimatedRequestsPerDay: 18
          }
        });
        return;
      }
      if (route.request().method() === "PUT") {
        putCount += 1;
        lastBody = route.request().postDataJSON();
        await fulfillJson(route, lastBody);
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator("#nav-settings").click();
    await expect(page.locator("#schedule-timezone")).toBeVisible();

    await page.evaluate(() => {
      const select = document.getElementById("schedule-timezone");
      select.innerHTML = '<option value="">Select…</option>';
      select.value = "";
    });
    await page.locator("#save-application-settings-btn").click();
    await expect(page.locator("#db-error-banner")).toBeVisible();
    expect(putCount).toBe(0);

    await page.evaluate(() => {
      const select = document.getElementById("schedule-timezone");
      select.innerHTML = '<option value="Europe/Berlin">Europe/Berlin (UTC+01:00)</option>';
      select.value = "Europe/Berlin";
    });
    await page.locator("#save-application-settings-btn").click();
    await expect.poll(() => putCount).toBe(1);
    expect(lastBody).toMatchObject({
      scheduleTimezone: "Europe/Berlin",
      displayTimezoneMode: "schedule",
      displayTimezone: null
    });
  });

  test("desktop locations render as full-width rows", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop layout only");
    const location = {
      id: "loc-row-1",
      name: "Sandown",
      latitude: 42.9287,
      longitude: -71.187,
      scheduleTimes: null
    };
    await page.route("**/api/locations", (route) => fulfillJson(route, [location]));
    await page.route("**/api/location-notification-rules", (route) => fulfillJson(route, { rules: [] }));
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-tab="locations"]:visible').first().click();
    const card = page.locator(".loc-rule-card").first();
    await expect(card).toBeVisible();
    const gridCols = await card.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    expect(gridCols.split(" ").length).toBeGreaterThanOrEqual(4);
    await expect(card.locator(".loc-rule-edit-btn")).toBeVisible();
  });

  test("forecast desktop columns share spaced grid", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop layout only");
    await page.route("**/api/locations", (route) => fulfillJson(route, [{
      id: "loc-forecast-1",
      name: "Harbor",
      latitude: 40.7,
      longitude: -74.0,
      scheduleTimes: null,
      latestSunriseQuality: 0.7,
      latestSunriseText: "Good",
      latestSunriseTime: "2026-08-09T10:00:00.000Z",
      latestSunsetQuality: 0.8,
      latestSunsetText: "Great",
      latestSunsetTime: "2026-08-09T23:00:00.000Z"
    }]));
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".forecast-table-row").first()).toBeVisible({ timeout: 30_000 });
    const metrics = await page.evaluate(() => {
      const header = document.querySelector(".forecast-table-header");
      const row = document.querySelector(".forecast-table-row");
      if (!header || !row) return null;
      const hs = getComputedStyle(header);
      const rs = getComputedStyle(row);
      return {
        headerDisplay: hs.display,
        rowDisplay: rs.display,
        headerGap: hs.columnGap,
        rowGap: rs.columnGap,
        headerTrackCount: hs.gridTemplateColumns.trim().split(/\s+/).length,
        rowTrackCount: rs.gridTemplateColumns.trim().split(/\s+/).length,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    });
    expect(metrics).toBeTruthy();
    expect(metrics.headerDisplay).toBe("grid");
    expect(metrics.rowDisplay).toBe("grid");
    expect(metrics.headerTrackCount).toBe(3);
    expect(metrics.rowTrackCount).toBe(3);
    expect(Number.parseFloat(metrics.headerGap)).toBeGreaterThanOrEqual(40);
    expect(Number.parseFloat(metrics.rowGap)).toBeGreaterThanOrEqual(40);
    expect(metrics.overflowX).toBeFalsy();
  });

  test("location drawer opens and closes with focus restore", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-tab="locations"]:visible').first().click();
    const openBtn = page.locator("#open-location-drawer-btn");
    await openBtn.focus();
    await openBtn.click();
    await expect(page.locator("#location-drawer")).toBeVisible();
    await expect(page.locator("#location-drawer-schedule-host")).toBeAttached();
    await expect(page.locator("#location-drawer-rules-host")).toBeAttached();
    await expect(page.locator("#cancel-edit-btn")).toHaveText(/Close/i);
    await expect(page.locator("#delete-location-drawer-btn")).toHaveAttribute("hidden", "");
    await page.locator("#close-location-drawer-btn").click();
    await expect(page.locator("#location-drawer")).toBeHidden();
    await expect(openBtn).toBeFocused();
  });

  test("locations respects enabled notification channels without visiting Settings", async ({ page }) => {
    const location = {
      id: "loc-e2e-1",
      name: "Harbor Point",
      latitude: 40.7,
      longitude: -74.0,
      scheduleTimes: null
    };
    await page.route("**/api/notification-settings", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          emailEnabled: true,
          emailTo: "owner@example.com",
          emailConfigured: true,
          pushoverEnabled: true,
          pushoverConfigured: true,
          pushoverDevice: null,
          pushoverPriority: 0,
          pushoverSound: null,
          webhookEnabled: true,
          webhookConfigured: false
        });
      }
      return fulfillJson(route, {});
    });
    await page.route("**/api/locations", (route) => fulfillJson(route, [location]));
    await page.route("**/api/location-notification-rules", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          rules: [
            { locationId: location.id, channel: "email", enabled: true, thresholdPercent: 70, eventScope: "either" },
            { locationId: location.id, channel: "pushover", enabled: true, thresholdPercent: null, eventScope: "either" },
            { locationId: location.id, channel: "webpush", enabled: true, thresholdPercent: 40, eventScope: "either" },
            { locationId: location.id, channel: "webhook", enabled: false, thresholdPercent: null, eventScope: "either" }
          ]
        });
      }
      return fulfillJson(route, {});
    });

    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-tab="locations"]:visible').first().click();
    await expect(page.locator(".loc-rule-card").first()).toBeVisible();
    await expect(page.locator(".loc-rule-threshold-line").first()).toContainText("Mixed");
    await expect(page.locator(".loc-rule-threshold-line").first()).not.toContainText("Alerts:");
    await expect(page.locator(".loc-rule-threshold-line").first()).not.toContainText("Threshold ≥");

    await page.locator(`[data-location-edit="${location.id}"]`).click();
    await expect(page.locator("#location-drawer")).toBeVisible();
    await expect(page.locator("#delete-location-drawer-btn")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quality alerts" })).toBeVisible();
    await expect(page.locator("#location-drawer-rules-host .rule-control")).toHaveCount(4);
    await expect(page.locator("#location-drawer-rules-host")).not.toContainText("Off globally");
  });

  test("locations still loads rules when notification-settings fails", async ({ page }) => {
    const location = {
      id: "loc-e2e-settings-fail",
      name: "Fault Harbor",
      latitude: 41.2,
      longitude: -73.9,
      scheduleTimes: null
    };
    await page.route("**/api/notification-settings", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "INTERNAL", message: "settings boom" } })
        });
        return;
      }
      await fulfillJson(route, {});
    });
    await page.route("**/api/locations", (route) => fulfillJson(route, [location]));
    await page.route("**/api/location-notification-rules", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          rules: [
            { locationId: location.id, channel: "email", enabled: true, thresholdPercent: 60, eventScope: "either" },
            { locationId: location.id, channel: "pushover", enabled: true, thresholdPercent: 50, eventScope: "either" },
            { locationId: location.id, channel: "webpush", enabled: true, thresholdPercent: null, eventScope: "either" },
            { locationId: location.id, channel: "webhook", enabled: true, thresholdPercent: 40, eventScope: "either" }
          ]
        });
      }
      return fulfillJson(route, {});
    });

    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-tab="locations"]:visible').first().click();
    await expect(page.locator(".loc-rule-card").first()).toBeVisible();
    await expect(page.locator(".loc-rule-threshold-line").first()).toContainText("Mixed");
    await expect(page.locator(".loc-rule-threshold-line").first()).not.toContainText("Alerts:");
    await expect(page.getByText(/Channel enablement status unavailable/i)).toBeVisible();

    await page.locator(`[data-location-edit="${location.id}"]`).click();
    await expect(page.locator("#location-drawer")).toBeVisible();
    await expect(page.locator("#location-drawer-rules-host .rule-control")).toHaveCount(4);
    await expect(page.locator("#location-drawer-rules-host")).not.toContainText("Off globally");
  });

  test("settings exposes forecast checks and scheduled reports controls", async ({ page }) => {
    let putBody = null;
    await page.route("**/api/application-settings", async (route) => {
      if (route.request().method() === "GET") {
        await fulfillJson(route, {
          scheduleTimezone: "America/New_York",
          displayTimezoneMode: "schedule",
          displayTimezone: null,
          scheduleTimes: ["06:00", "12:00", "18:00"],
          weeklySelfTestEnabled: true,
          weeklySelfTestMode: "passive",
          weeklySelfTestDay: 0,
          weeklySelfTestTime: "10:00",
          scheduledReportsEnabled: false,
          scheduledReportTimes: [],
          scheduledReportChannels: [],
          quota: {
            estimatedRequestsPer30Days: 90,
            scheduledRunsPerDay: 3,
            activeLocations: 1,
            estimatedRequestsPerDay: 3
          }
        });
        return;
      }
      if (route.request().method() === "PUT") {
        putBody = route.request().postDataJSON();
        await fulfillJson(route, putBody);
        return;
      }
      await fulfillJson(route, {});
    });
    await page.route("**/api/notification-settings", (route) => fulfillJson(route, {
      emailEnabled: true,
      emailTo: "owner@example.com",
      emailConfigured: true,
      pushoverEnabled: false,
      pushoverConfigured: true,
      webhookEnabled: false,
      webhookConfigured: false
    }));

    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator("#nav-settings").click();
    await expect(page.getByRole("heading", { name: "Forecast checks" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scheduled reports" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Delivery channels" })).toBeVisible();
    await expect(page.locator("#scheduled-reports-options")).toBeHidden();

    await page.locator("#scheduled-reports-enabled").check();
    await expect(page.locator("#scheduled-reports-options")).toBeVisible();
    await page.locator("#save-application-settings-btn").click();
    await expect(page.locator("#db-error-banner")).toBeVisible();
    expect(putBody).toBeNull();

    await page.locator('[data-scheduled-report-time="06:00"]').check();
    await page.locator('[data-scheduled-report-channel="email"]').check();
    await page.locator("#save-application-settings-btn").click();
    await expect.poll(() => putBody).not.toBeNull();
    expect(putBody).toMatchObject({
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: ["email"]
    });
    await expect(page.locator("#scheduled-report-channels")).toContainText("Pushover — enable this channel above first");
  });

  test("activity shows forecast checks filter and delivery purpose labels", async ({ page }) => {
    await page.route("**/api/notification-deliveries", (route) => fulfillJson(route, [
      {
        id: "d1",
        channel: "email",
        status: "sent",
        attempts: 1,
        createdAt: "2026-08-01T10:00:05.000Z",
        deliveryPurpose: "scheduled_report"
      },
      {
        id: "d2",
        channel: "pushover",
        status: "skipped",
        attempts: 0,
        createdAt: "2026-08-01T12:00:05.000Z",
        lastErrorCode: "NO_LOCATION_ABOVE_THRESHOLD",
        deliveryPurpose: "quality_alert"
      }
    ]));
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-tab="activity"]:visible').first().click();
    await expect(page.locator("#activity-filter-runs")).toHaveText("Forecast checks");
    await page.locator("#activity-filter-deliveries").click();
    await expect(page.locator("#logs-list-container")).toContainText("Scheduled report");
    await expect(page.locator("#logs-list-container")).toContainText("Quality alert");
    await expect(page.locator("#logs-list-container")).toContainText("No location met its threshold");
  });

  test("settings keeps provider credentials collapsed by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator("#nav-settings").click();
    const gmailEditor = page.locator("#gmail-credentials-form").locator("xpath=..");
    const pushoverEditor = page.locator("#pushover-credentials-form").locator("xpath=..");
    const webhookEditor = page.locator("#webhook-credentials-form").locator("xpath=..");
    await expect(gmailEditor).not.toHaveAttribute("open", "");
    await expect(pushoverEditor).not.toHaveAttribute("open", "");
    await expect(webhookEditor).not.toHaveAttribute("open", "");
    await expect(page.locator("#test-email-btn")).toBeVisible();
    await expect(page.locator("#test-pushover-btn")).toBeVisible();
  });

  async function expectNoSeriousAxeViolations(page) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  }

  test("axe has no serious violations on Forecast", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#pane-main")).toBeVisible({ timeout: 30_000 });
    await expectNoSeriousAxeViolations(page);
  });

  test("axe has no serious violations on Locations drawer and Settings", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });

    await page.locator('[data-tab="locations"]:visible').first().click();
    await expect(page.locator("#pane-locations")).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    await page.locator("#open-location-drawer-btn").click();
    await expect(page.locator("#location-drawer")).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    await page.locator("#close-location-drawer-btn").click();

    await page.locator("#nav-settings").click();
    await expect(page.locator("#pane-settings")).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  });

  test("locations table columns and bulk alert popover stay anchored", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop alignment coverage");
    const locations = [
      {
        id: "loc-align-1",
        name: "Sandown",
        latitude: 42.9287,
        longitude: -71.187,
        scheduleTimes: null
      },
      {
        id: "loc-align-2",
        name: "Portland Head Light",
        latitude: 43.6231,
        longitude: -70.2079,
        scheduleTimes: ["06:00", "18:00"]
      }
    ];
    await page.route("**/api/locations", (route) => fulfillJson(route, locations));
    await page.route("**/api/location-notification-rules", async (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          rules: locations.flatMap((loc) => [
            { locationId: loc.id, channel: "email", enabled: true, thresholdPercent: null, eventScope: "either" },
            { locationId: loc.id, channel: "pushover", enabled: true, thresholdPercent: null, eventScope: "either" },
            { locationId: loc.id, channel: "webpush", enabled: true, thresholdPercent: null, eventScope: "either" },
            { locationId: loc.id, channel: "webhook", enabled: true, thresholdPercent: null, eventScope: "either" }
          ])
        });
      }
      return fulfillJson(route, {});
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-tab="locations"]:visible').first().click();
    await expect(page.locator("#pane-locations")).toBeVisible();

    const head = page.locator(".locations-table-head");
    await expect(head).toBeVisible();
    await expect(head).toHaveText(/Location\s+Checks\s+Channels\s+Alert rule\s+Action/);

    const cards = page.locator(".loc-rule-card");
    await expect(cards).toHaveCount(2);
    await expect(page.locator(".loc-rule-threshold-line").first()).toHaveText("Always");
    await expect(page.locator(".loc-rule-threshold-line").first()).not.toContainText("Alerts:");

    const firstCard = await cards.first().boundingBox();
    expect(firstCard).toBeTruthy();
    const firstListTop = firstCard.y;

    const bulk = page.locator(".bulk-alert-menu");
    await bulk.locator("summary").click();
    await expect(bulk).toHaveAttribute("open", "");
    await expect(page.locator(".bulk-alert-menu-panel")).toBeVisible();

    const afterOpen = await cards.first().boundingBox();
    expect(Math.abs((afterOpen?.y || 0) - firstListTop)).toBeLessThan(2);

    await expect(page.locator("#pane-locations")).toHaveScreenshot("pane-locations-bulk-open.png", {
      maxDiffPixelRatio: 0.08
    });

    await page.keyboard.press("Escape");
    await expect(bulk).not.toHaveAttribute("open", "");

    await bulk.locator("summary").click();
    await page.locator("#rules-copy-all-btn").click();
    await expect(bulk).not.toHaveAttribute("open", "");

    await bulk.locator("summary").click();
    await page.locator("body").click({ position: { x: 8, y: 8 } });
    await expect(bulk).not.toHaveAttribute("open", "");

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator(".locations-table-head")).toBeVisible();
    await expect(page.locator("#pane-locations")).toHaveScreenshot("pane-locations-1920.png", {
      maxDiffPixelRatio: 0.08
    });
  });

  test("locations mobile stacks without horizontal scroll and hides table head", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile Locations layout only");
    await page.route("**/api/locations", (route) => fulfillJson(route, [{
      id: "loc-mobile-1",
      name: "Sandown",
      latitude: 42.9287,
      longitude: -71.187,
      scheduleTimes: null
    }]));
    await page.route("**/api/location-notification-rules", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          rules: [
            { locationId: "loc-mobile-1", channel: "email", enabled: true, thresholdPercent: null, eventScope: "either" },
            { locationId: "loc-mobile-1", channel: "pushover", enabled: true, thresholdPercent: null, eventScope: "either" },
            { locationId: "loc-mobile-1", channel: "webpush", enabled: true, thresholdPercent: null, eventScope: "either" },
            { locationId: "loc-mobile-1", channel: "webhook", enabled: true, thresholdPercent: null, eventScope: "either" }
          ]
        });
      }
      return fulfillJson(route, {});
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-tab="locations"]:visible').first().click();
    await expect(page.locator("#pane-locations")).toBeVisible();
    await expect(page.locator(".locations-table-head")).toBeHidden();
    await expect(page.locator(".loc-rule-field-label").first()).toBeVisible();

    const scrollWidth = await page.locator("#pane-locations").evaluate((el) => el.scrollWidth);
    const clientWidth = await page.locator("#pane-locations").evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    const bulk = page.locator(".bulk-alert-menu");
    await bulk.locator("summary").click();
    await expect(page.locator(".bulk-alert-menu-panel")).toBeVisible();
    const panelBox = await page.locator(".bulk-alert-menu-panel").boundingBox();
    expect(panelBox).toBeTruthy();
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(390 + 1);
  });

  test("screenshot panes", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });

    if (testInfo.project.name === "desktop") {
      for (const [tab, pane] of [
        ['[data-tab="main"]:visible', "#pane-main"],
        ['[data-tab="locations"]:visible', "#pane-locations"],
        ['[data-tab="activity"]:visible', "#pane-activity"],
        ["#nav-settings", "#pane-settings"]
      ]) {
        await page.locator(tab).first().click();
        await expect(page.locator(pane)).toBeVisible();
        if (pane === "#pane-settings") {
          await expect(page.locator("#quota-estimator .quota-label, #quota-estimator .quota-footnote").first()).toBeVisible();
          await expect(page.locator("#schedule-timezone")).toBeVisible();
        }
        await expect(page.locator(pane)).toHaveScreenshot(`${pane.slice(1)}.png`, {
          maxDiffPixelRatio: 0.08
        });
      }
      return;
    }

    test.skip(testInfo.project.name !== "mobile", "mobile Locations visual only");
    await page.locator('[data-tab="locations"]:visible').first().click();
    await expect(page.locator("#pane-locations")).toBeVisible();
    await expect(page.locator("#location-rules-grid")).toBeVisible();
    await expect(page.locator("#pane-locations")).toHaveScreenshot("pane-locations-mobile.png", {
      maxDiffPixelRatio: 0.08
    });
    await page.locator("#open-location-drawer-btn").click();
    await expect(page.locator("#location-drawer")).toBeVisible();
    await expect(page.locator("#location-drawer")).toHaveScreenshot("location-drawer-mobile.png", {
      maxDiffPixelRatio: 0.08
    });
  });
});
