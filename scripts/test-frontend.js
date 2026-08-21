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
  const polishCssPath = path.join(publicDir, "ui-polish.css");
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
  assert.ok(fs.existsSync(polishCssPath), "ui-polish.css should exist");
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
  assert.ok(fs.statSync(polishCssPath).size > 100, "ui-polish.css should not be empty");
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
    "notification-health-summary",
    "notification-health-skips",
    "notification-health-selftest",
    "setup-checklist",
    "clear-history-section",
    "weekly-self-test-fields",
    "demo-banner",
    // Dashboard
    "forecast-cards-container",
    "dashboard-last-updated",
    // Locations configuration
    "locations-list-container",
    "empty-state-view",
    "locations-count-badge",
    "open-location-drawer-btn",
    "location-rules-grid",
    "schedule-times-pills",
    "check-times-block",
    "schedule-timezone",
    "location-rules-title",
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
    "enable-web-push-btn",
    "webhook-credentials-form",
  ];

  requiredIds.forEach(id => {
    assert.ok(
      htmlContent.includes(`id="${id}"`) || htmlContent.includes(`id='${id}'`),
      `index.html must contain an element with id="${id}"`
    );
  });

  assert.ok(htmlContent.includes('href="ui-polish.css"'), "index.html should load focused UI polish styles");

  const locationsStart = htmlContent.indexOf('id="pane-locations"');
  const activityStart = htmlContent.indexOf('id="pane-activity"');
  const settingsStart = htmlContent.indexOf('id="pane-settings"');
  const checkTimesStart = htmlContent.indexOf('id="check-times-block"');
  const rulesStart = htmlContent.indexOf('id="location-rules-grid"');
  const emailCardStart = htmlContent.indexOf('id="channel-card-email"');
  const scheduleTimezoneStart = htmlContent.indexOf('id="schedule-timezone"');

  assert.ok(locationsStart >= 0 && activityStart > locationsStart, "Locations pane should precede Activity");
  assert.ok(checkTimesStart > settingsStart, "Default check times should live in Settings");
  assert.ok(rulesStart > locationsStart && rulesStart < activityStart, "Per-location notification rules should live in Locations");
  assert.ok(scheduleTimezoneStart > settingsStart, "Timezone control should live in Settings");
  assert.ok(emailCardStart > settingsStart, "Global provider cards should remain in Settings");
  assert.ok(!htmlContent.includes('id="check-times-locations-section"'), "Locations must not host the default check times card");
  assert.ok(!htmlContent.includes('name="display-timezone-mode"'), "Display timezone mode radios must be removed");
  assert.ok(!htmlContent.includes('id="display-timezone"'), "Secondary display timezone input must be removed");
  assert.ok(!htmlContent.includes('id="iana-timezone-list"'), "Timezone datalist must be replaced by a select");
  assert.match(
    htmlContent,
    /<select id="schedule-timezone"/,
    "Timezone control must be a select element"
  );
  assert.match(
    htmlContent,
    /id="locations-list-container"[^>]*hidden/,
    "legacy app.js location renderer should stay hidden behind the combined location cards"
  );
  assert.match(
    htmlContent,
    /<details class="credential-editor accordion">[\s\S]*id="gmail-credentials-form"/,
    "Gmail credential editor should be collapsed by default"
  );
  assert.match(
    htmlContent,
    /<details class="credential-editor accordion">[\s\S]*id="pushover-credentials-form"/,
    "Pushover credential editor should be collapsed by default"
  );
  assert.match(
    htmlContent,
    /id="location-drawer-schedule-host"/,
    "Location drawer should host per-location schedule editor"
  );
  assert.match(
    htmlContent,
    /id="location-drawer-rules-host"/,
    "Location drawer should host per-location notification rules"
  );
  assert.match(
    htmlContent,
    /id="email-enabled-pill"/,
    "Settings channel cards should expose enabled status pills"
  );
  assert.match(
    htmlContent,
    /id="delete-location-drawer-btn"/,
    "Location drawer should expose a destructive delete action"
  );
  assert.match(
    htmlContent,
    /id="cancel-edit-btn"[^>]*>Close</,
    "Location drawer footer should label Close instead of Cancel"
  );
  assert.match(
    htmlContent,
    /Saved automatically/,
    "Schedule and Notifications should advertise auto-save"
  );
  assert.match(
    htmlContent,
    /class="locations-table-head"/,
    "Locations should expose a desktop column heading row"
  );
  assert.match(
    htmlContent,
    /locations-table-head[\s\S]*?>Location<\/span>[\s\S]*?>Checks<\/span>[\s\S]*?>Channels<\/span>[\s\S]*?>Alert rule<\/span>[\s\S]*?>Action<\/span>/,
    "Locations heading labels must be Location, Checks, Channels, Alert rule, Action"
  );
  assert.match(
    htmlContent,
    /class="bulk-alert-menu"/,
    "Locations should expose bulk alert actions"
  );
  assert.doesNotMatch(
    htmlContent,
    /bulk-alert-menu-panel"[^>]*role="menu"/,
    "Bulk alert panel must not advertise incomplete ARIA menu semantics"
  );

  // 4. Verify CSS design system tokens and key selectors are defined
  const cssContent = `${fs.readFileSync(cssPath, "utf8")}\n${fs.readFileSync(polishCssPath, "utf8")}`;
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
    ".rule-control",
    ".location-rule-toggle-label",
    ".credential-editor",
    ".quality-indicator",
    ".quality-meter",
    ".loc-rule-card",
    ".locations-table-head",
    ".loc-rule-channels",
    ".loc-rule-alert",
    ".bulk-alert-menu-panel",
    ".quota-label",
    ".status-pill",
    ".quality-stack",
    ".btn-danger-text",
  ];

  requiredCssSelectors.forEach(selector => {
    assert.ok(
      cssContent.includes(selector),
      `frontend styles must define ${selector}`
    );
  });

  assert.match(
    cssContent,
    /\.forecast-table-header,\s*\n\s*\.forecast-table-row\s*\{[\s\S]*?column-gap:\s*clamp\(44px,\s*5vw,\s*72px\)/,
    "Forecast header and rows must share a desktop grid with substantial column-gap"
  );
  assert.doesNotMatch(
    cssContent,
    /\.forecast-table-row\s*\{[^}]*\bgap:\s*0\b/,
    "Forecast rows must not reset column-gap with gap: 0"
  );
  assert.match(
    cssContent,
    /--locations-table-columns:[\s\S]*?minmax\(240px,\s*1\.35fr\)[\s\S]*?minmax\(110px,\s*0\.45fr\)[\s\S]*?72px/,
    "Desktop location heading and cards must share a five-column grid"
  );
  assert.match(
    cssContent,
    /\.bulk-alert-menu-panel\s*\{[\s\S]*?position:\s*absolute/,
    "Bulk alert menu must be an anchored popover, not normal-flow layout"
  );
  assert.doesNotMatch(
    cssContent,
    /\.loc-rule-notify\s*\{/,
    "Obsolete stacked notify column styles should be removed"
  );
});
