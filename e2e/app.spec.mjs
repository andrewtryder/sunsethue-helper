import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Horizon app smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/provider-credentials**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            email: { configured: false },
            pushover: { configured: false }
          })
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.route("**/api/operational-status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          lastScheduledRunAt: null,
          lastSuccessfulRunAt: null,
          oldestPendingDeliveryAgeSeconds: 0,
          pendingDeliveries: 0,
          failedDeliveries: 0,
          emailTransport: "not_configured",
          pushoverTransport: "not_configured",
          requiredTablesPresent: true
        })
      });
    });
  });

  test("initializes and switches tabs", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#loading-overlay")).toHaveClass(/fade-out/, { timeout: 30_000 });
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator("#nav-locations").click();
    await expect(page.locator("#pane-locations")).toBeVisible();
    await page.locator("#nav-activity").click();
    await expect(page.locator("#pane-activity")).toBeVisible();
    await page.locator("#nav-settings").click();
    await expect(page.locator("#pane-settings")).toBeVisible();
    await expect(page.locator("#channel-card-email")).toBeVisible();
    await expect(page.locator("#notification-email-enabled")).toBeAttached();
    await expect(page.locator("#channel-card-pushover")).toBeVisible();
    await expect(page.locator("#channel-card-webpush")).toBeVisible();
    await expect(page.locator("#channel-card-webhook")).toBeVisible();
    await expect(page.locator("#check-times-locations-section")).toBeVisible();
    await expect(page.locator("#schedule-times-pills")).toBeVisible();
  });

  test("location drawer opens and closes with focus restore", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    await page.locator("#nav-locations").click();
    const openBtn = page.locator("#open-location-drawer-btn");
    await openBtn.click();
    await expect(page.locator("#location-drawer")).toBeVisible();
    await page.locator("#close-location-drawer-btn").click();
    await expect(page.locator("#location-drawer")).toBeHidden();
  });

  test("axe has no serious violations on Forecast", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#pane-main")).toBeVisible({ timeout: 30_000 });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("screenshot panes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop screenshots only");
    await page.goto("/");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 30_000 });
    for (const [tab, pane] of [
      ["#nav-main", "#pane-main"],
      ["#nav-locations", "#pane-locations"],
      ["#nav-activity", "#pane-activity"],
      ["#nav-settings", "#pane-settings"]
    ]) {
      await page.locator(tab).click();
      await expect(page.locator(pane)).toBeVisible();
      await expect(page.locator(pane)).toHaveScreenshot(`${pane.slice(1)}.png`, {
        maxDiffPixelRatio: 0.05
      });
    }
  });
});
