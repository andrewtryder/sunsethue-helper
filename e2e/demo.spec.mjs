import { test, expect } from "@playwright/test";

test.describe("Static Demo", () => {
  const SUBPATH = "/sunsethue-helper/";

  test("loads the application shell via subpath", async ({ page }) => {
    const response = await page.goto(`http://localhost:3001${SUBPATH}`);
    expect(response?.status()).toBe(200);

    // Wait for demo banner
    const banner = page.locator("#demo-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Static demo — read-only fixtures");

    // Check capabilities model properly disabled the Push button
    const pushBtn = page.locator("#enable-web-push-btn");
    if (await pushBtn.isVisible()) {
      await expect(pushBtn).toBeDisabled();
    }
    
    // Test the network requests to verify no root-relative leaks occur
    // (We don't do full interception here because fixtures are injected via window.__SUNSETHUE_DEMO_FIXTURES__)
    // Verify the page title
    await expect(page).toHaveTitle(/Sunsethue Helper/);

    // Check if some fixture data loaded (may be in a hidden tab)
    const harborText = page.getByText("Demo Harbor").first();
    await expect(harborText).toBeAttached();
  });

  test("blocks mutations", async ({ page }) => {
    await page.goto(`http://localhost:3001${SUBPATH}`);
    
    // Attempt to manually trigger a report
    const triggerBtn = page.locator("#trigger-test-btn");
    await triggerBtn.click();
    
    // Assert error banner appears
    const dbError = page.locator("#db-error-banner");
    await expect(dbError).toBeVisible();
    await expect(dbError).toContainText("Manual report execution is disabled in the static demo.");
  });

  test("does not attempt to load manifest from root", async ({ page }) => {
    const errors = [];
    page.on("requestfailed", request => {
      errors.push(request.url());
    });
    
    await page.goto(`http://localhost:3001${SUBPATH}`);
    
    // Wait a short time for network requests
    await page.waitForTimeout(500);

    const rootManifestRequest = errors.find(u => u.endsWith("/manifest.webmanifest") && !u.includes(SUBPATH));
    expect(rootManifestRequest).toBeUndefined();
  });
});
