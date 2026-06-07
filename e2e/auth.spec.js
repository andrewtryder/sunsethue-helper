// @ts-check
const { test, expect } = require("@playwright/test");
const { TEST_EMAIL, TEST_PASSWORD, waitForAppReady } = require("./helpers");

test.describe("Authentication", () => {
  test("shows the login screen on first load", async ({ page }) => {
    await waitForAppReady(page);
    await expect(page.locator("#auth-container")).toBeVisible();
    await expect(page.locator("#app-container")).toHaveClass(/hidden/);
    await expect(page.locator("#login-form")).toBeVisible();
  });

  test("blocks unauthorized email addresses before sign-in", async ({ page }) => {
    await waitForAppReady(page);
    await page.locator("#login-email").fill("other@gmail.com");
    await page.locator("#login-password").fill(TEST_PASSWORD);
    await page.locator("#login-form").press("Enter");

    await expect(page.locator("#auth-error-banner")).toContainText("Access Denied");
    await expect(page.locator("#app-container")).toHaveClass(/hidden/);
  });

  test("signs in with the authorized emulator user and logs out", async ({ page }) => {
    await waitForAppReady(page);
    await page.locator("#login-email").fill(TEST_EMAIL);
    await page.locator("#login-password").fill(TEST_PASSWORD);
    await page.locator("#login-btn").click();

    await expect(page.locator("#app-container")).not.toHaveClass(/hidden/);
    await expect(page.locator("#display-user-email")).toHaveText(TEST_EMAIL);
    await expect(page.locator("#pane-main")).toHaveClass(/active/);

    await page.locator("#logout-btn").click();
    await expect(page.locator("#auth-container")).toBeVisible();
    await expect(page.locator("#app-container")).toHaveClass(/hidden/);
  });
});
