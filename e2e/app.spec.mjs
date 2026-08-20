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
    await expect(page.locator("#check-times-locations-section")).toBeVisible();
    await expect(page.locator("#schedule-times-pills")).toBeVisible();
    await expect(page.locator("#location-rules-grid .location-config-empty, #location-rules-grid .loc-rule-card").first()).toBeVisible();

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
    await expect(page.locator("#check-times-locations-section")).toBeHidden();
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
    await expect(page.locator(".loc-rule-threshold-line").first()).toContainText("Email ≥70%");
    await expect(page.locator(".loc-rule-threshold-line").first()).toContainText("Pushover Always");
    await expect(page.locator(".loc-rule-threshold-line").first()).not.toContainText("Threshold ≥");

    await page.locator(`[data-location-edit="${location.id}"]`).click();
    await expect(page.locator("#location-drawer")).toBeVisible();
    await expect(page.locator("#delete-location-drawer-btn")).toBeVisible();
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
    await expect(page.locator(".loc-rule-threshold-line").first()).toContainText("Email ≥60%");
    await expect(page.getByText(/Channel enablement status unavailable/i)).toBeVisible();

    await page.locator(`[data-location-edit="${location.id}"]`).click();
    await expect(page.locator("#location-drawer")).toBeVisible();
    await expect(page.locator("#location-drawer-rules-host .rule-control")).toHaveCount(4);
    await expect(page.locator("#location-drawer-rules-host")).not.toContainText("Off globally");
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
    await page.locator("#open-location-drawer-btn").click();
    await expect(page.locator("#location-drawer")).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    await page.locator("#close-location-drawer-btn").click();

    await page.locator("#nav-settings").click();
    await expect(page.locator("#pane-settings")).toBeVisible();
    await expectNoSeriousAxeViolations(page);
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
        if (pane === "#pane-locations") {
          await expect(page.locator("#quota-estimator .quota-label, #quota-estimator .quota-footnote").first()).toBeVisible();
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
    await expect(page.locator("#quota-estimator .quota-label, #quota-estimator .quota-footnote").first()).toBeVisible();
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
