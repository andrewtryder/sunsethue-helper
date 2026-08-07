import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Frontend File Structure & Integrity Checks", () => {
  const publicDir = path.join(__dirname, "..", "public");

  // 1. Verify file existence
  const htmlPath = path.join(publicDir, "index.html");
  const cssPath = path.join(publicDir, "style.css");
  const jsPath = path.join(publicDir, "app.js");
  const helpersPath = path.join(publicDir, "lib", "helpers.js");
  const apiClientPath = path.join(publicDir, "lib", "api-client.js");
  const bannersPath = path.join(publicDir, "ui", "banners.js");
  const dialogPath = path.join(publicDir, "ui", "dialog.js");
  const formsPath = path.join(publicDir, "ui", "forms.js");
  const schedulePath = path.join(publicDir, "features", "schedule.js");
  const thresholdsPath = path.join(publicDir, "features", "thresholds.js");
  const notificationsPath = path.join(publicDir, "features", "notifications.js");
  const browserNotificationsPath = path.join(publicDir, "features", "browser-notifications.js");
  const webhookPath = path.join(publicDir, "features", "webhook.js");
  const healthPath = path.join(publicDir, "features", "health.js");
  const historyPath = path.join(publicDir, "features", "history.js");
  const setupStatusPath = path.join(publicDir, "features", "setup-status.js");

  assert.ok(fs.existsSync(htmlPath), "index.html should exist");
  assert.ok(fs.existsSync(cssPath), "style.css should exist");
  assert.ok(fs.existsSync(jsPath), "app.js should exist");
  assert.ok(fs.existsSync(helpersPath), "lib/helpers.js should exist");
  assert.ok(fs.existsSync(apiClientPath), "lib/api-client.js should exist");
  assert.ok(fs.existsSync(bannersPath), "ui/banners.js should exist");
  assert.ok(fs.existsSync(dialogPath), "ui/dialog.js should exist");
  assert.ok(fs.existsSync(formsPath), "ui/forms.js should exist");
  assert.ok(fs.existsSync(schedulePath), "features/schedule.js should exist");
  assert.ok(fs.existsSync(thresholdsPath), "features/thresholds.js should exist");
  assert.ok(fs.existsSync(notificationsPath), "features/notifications.js should exist");
  assert.ok(fs.existsSync(browserNotificationsPath), "features/browser-notifications.js should exist");
  assert.ok(fs.existsSync(webhookPath), "features/webhook.js should exist");
  assert.ok(fs.existsSync(healthPath), "features/health.js should exist");
  assert.ok(fs.existsSync(historyPath), "features/history.js should exist");
  assert.ok(fs.existsSync(setupStatusPath), "features/setup-status.js should exist");

  // 2. Verify files are not empty
  assert.ok(fs.statSync(htmlPath).size > 100, "index.html should not be empty");
  assert.ok(fs.statSync(cssPath).size > 100, "style.css should not be empty");
  assert.ok(fs.statSync(jsPath).size > 100, "app.js should not be empty");

  // 3. Structural validation of index.html (asserting essential DOM bindings are present)
  const htmlContent = fs.readFileSync(htmlPath, "utf8");

  const requiredIds = [
    // Loader view
    "loading-overlay",
    // App view
    "app-container",
    "logo-home-btn",
    // App banners
    "db-success-banner",
    "db-error-banner",
    // Location form
    "location-form",
    "edit-location-id",
    "location-name",
    "location-lat",
    "location-lng",
    // Search
    "search-address",
    "search-address-btn",
    "search-suggestions",
    "use-current-location-btn",
    // Manual trigger
    "trigger-test-btn",
    "trigger-status",
    "trigger-status-text",
    "email-success-modal",
    "email-success-modal-close",
    "email-success-modal-message",
    "email-success-modal-done",
    "api-credits-status",
    // Tab panes
    "pane-main",
    "pane-locations",
    "pane-activity",
    "pane-settings",
    "ops-status-title",
    "ops-status-summary",
    "ops-status-list",
    "notification-health-title",
    "notification-health-summary",
    "notification-health-channels",
    "setup-checklist",
    "clear-history-section",
    "weekly-self-test-fields",
    "demo-banner",
    // Dashboard
    "forecast-cards-container",
    "dashboard-last-updated",
    // Locations list
    "locations-list-container",
    "empty-state-view",
    "locations-count-badge",
    "open-location-drawer-btn",
    // Activity
    "logs-list-container",
    // Settings
    "gmail-credentials-status",
    "pushover-credentials-status",
    "channel-card-email",
    "channel-card-pushover",
    "channel-card-webpush",
    "channel-card-webhook",
    "notification-email-enabled",
    "notification-pushover-enabled",
    "notification-webhook-enabled",
    "application-settings-form",
    "location-rules-grid",
    "schedule-times-pills",
    "check-times-locations-section",
    "location-rules-title",
    "enable-web-push-btn",
    "webhook-credentials-form",
  ];

  requiredIds.forEach(id => {
    assert.ok(
      htmlContent.includes(`id="${id}"`) || htmlContent.includes(`id='${id}'`),
      `index.html must contain an element with id="${id}"`
    );
  });

  // 4. Verify CSS design system tokens and key selectors are defined
  const cssContent = fs.readFileSync(cssPath, "utf8");
  const requiredCssSelectors = [
    ".tab-pane",
    ".tab-pane.active",
    ".nav-tab",
    ".nav-tab.active",
    ".forecast-table",
    ".forecast-table-header",
    ".forecast-table-row",
    ".location-row",
    ".log-item-summary",
    ".log-detail-chips",
    ".settings-field-grid",
    ".status-badge",
    ".channel-card-header",
    ".switch-ui",
    ".time-pills",
    ".segmented-control",
    ".quality-indicator",
    ".quality-meter",
  ];

  requiredCssSelectors.forEach(selector => {
    assert.ok(
      cssContent.includes(selector),
      `style.css must define styles for ${selector}`
    );
  });
});
