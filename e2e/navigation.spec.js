// @ts-check
const { test, expect } = require("@playwright/test");
const { login, goToTab } = require("./helpers");

test.describe("Dashboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("switches between main, locations, and logs tabs", async ({ page }) => {
    await expect(page.locator("#pane-main")).toHaveClass(/active/);

    await goToTab(page, "locations");
    await expect(page.locator("#pane-locations")).toHaveClass(/active/);
    await expect(page.locator("#pane-main")).not.toHaveClass(/active/);

    await goToTab(page, "logs");
    await expect(page.locator("#pane-logs")).toHaveClass(/active/);
    await expect(page.locator("#logs-list-container")).toBeVisible();

    await goToTab(page, "main");
    await expect(page.locator("#pane-main")).toHaveClass(/active/);
    await expect(page.locator("#forecast-cards-container")).toBeVisible();
  });
});
