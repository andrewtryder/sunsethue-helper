import { test, expect } from "@playwright/test";

const SUBPATH = "/sunsethue-helper/";

test.describe("Static Demo", () => {
  test.use({
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3001"
  });

  test("loads the application shell via subpath", async ({ page, baseURL }) => {
    const response = await page.goto(`${baseURL}${SUBPATH}`);
    expect(response?.status()).toBe(200);

    const banner = page.locator("#demo-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Static demo — read-only fixtures");

    const pushBtn = page.locator("#enable-web-push-btn");
    if (await pushBtn.isVisible()) {
      await expect(pushBtn).toBeDisabled();
    }

    await expect(page).toHaveTitle(/Sunsethue Helper/);

    const harborText = page.getByText("Demo Harbor").first();
    await expect(harborText).toBeAttached();
  });

  test("blocks mutations", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}${SUBPATH}`);

    const triggerBtn = page.locator("#trigger-test-btn");
    await triggerBtn.click();

    const dbError = page.locator("#db-error-banner");
    await expect(dbError).toBeVisible();
    await expect(dbError).toContainText("Manual report execution is disabled in the static demo.");
  });

  test("does not attempt to load manifest from root", async ({ page, baseURL }) => {
    const failedUrls = [];
    page.on("requestfailed", (request) => {
      failedUrls.push(request.url());
    });

    await page.goto(`${baseURL}${SUBPATH}`);
    await page.waitForTimeout(500);

    const rootManifestRequest = failedUrls.find(
      (u) => u.endsWith("/manifest.webmanifest") && !u.includes(SUBPATH)
    );
    expect(rootManifestRequest).toBeUndefined();
  });
});
