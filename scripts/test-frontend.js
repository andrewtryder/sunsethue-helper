const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("path");

test("Frontend File Structure & Integrity Checks", () => {
  const publicDir = path.join(__dirname, "..", "public");

  // 1. Verify file existence
  const htmlPath = path.join(publicDir, "index.html");
  const cssPath = path.join(publicDir, "style.css");
  const jsPath = path.join(publicDir, "app.js");
  const helpersPath = path.join(publicDir, "lib", "helpers.js");

  assert.ok(fs.existsSync(htmlPath), "index.html should exist");
  assert.ok(fs.existsSync(cssPath), "style.css should exist");
  assert.ok(fs.existsSync(jsPath), "app.js should exist");
  assert.ok(fs.existsSync(helpersPath), "lib/helpers.js should exist");

  // 2. Verify files are not empty
  assert.ok(fs.statSync(htmlPath).size > 100, "index.html should not be empty");
  assert.ok(fs.statSync(cssPath).size > 100, "style.css should not be empty");
  assert.ok(fs.statSync(jsPath).size > 100, "app.js should not be empty");

  // 3. Structural validation of index.html (asserting essential DOM bindings are present)
  const htmlContent = fs.readFileSync(htmlPath, "utf8");
  
  const requiredIds = [
    // Loader view
    "loading-overlay",
    // Auth view
    "auth-container",
    "login-form",
    "login-email",
    "login-password",
    // App view
    "app-container",
    "display-user-email",
    "logout-btn",
    // Auth banners
    "auth-error-banner",
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
    // Tab panes
    "pane-main",
    "pane-locations",
    "pane-logs",
    // Dashboard
    "forecast-cards-container",
    "dashboard-last-updated",
    // Locations list
    "locations-list-container",
    "empty-state-view",
    "locations-count-badge",
    // Logs
    "logs-list-container",
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
    ".quality-indicator",
    ".quality-dot",
  ];

  requiredCssSelectors.forEach(selector => {
    assert.ok(
      cssContent.includes(selector), 
      `style.css must define styles for ${selector}`
    );
  });
});
