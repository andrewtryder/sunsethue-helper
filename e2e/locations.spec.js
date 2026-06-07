// @ts-check
const { test, expect } = require("@playwright/test");
const { login, goToTab, clearFirestoreEmulator } = require("./helpers");

test.describe("Location management", () => {
  test.beforeEach(async ({ page }) => {
    await clearFirestoreEmulator();
    await login(page);
    await goToTab(page, "locations");
  });

  test("adds a location and shows it in the monitored list", async ({ page }) => {
    await expect(page.locator("#locations-count-badge")).toHaveText("0 / 10");

    await page.locator("#location-name").fill("Sandown");
    await page.locator("#location-lat").fill("42.9286");
    await page.locator("#location-lng").fill("-71.1870");
    await page.locator("#location-form").press("Enter");

    await expect(page.locator("#db-success-banner")).toContainText('Location "Sandown" added successfully');
    await expect(page.locator("#locations-count-badge")).toHaveText("1 / 10");
    await expect(page.locator(".location-card h3")).toHaveText("Sandown");
  });

  test("edits and deletes a saved location", async ({ page }) => {
    await page.locator("#location-name").fill("Sandown");
    await page.locator("#location-lat").fill("42.9286");
    await page.locator("#location-lng").fill("-71.1870");
    await page.locator("#location-form").press("Enter");
    await expect(page.locator("#locations-count-badge")).toHaveText("1 / 10");

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".delete-btn").click();

    await expect(page.locator("#db-success-banner")).toContainText('Location "Sandown" deleted');
    await expect(page.locator("#locations-count-badge")).toHaveText("0 / 10");
  });
});
