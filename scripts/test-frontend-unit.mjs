import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTHORIZED_EMAIL,
  escapeHtml,
  getForecastBadgeHtml,
  normalizeQualityToUnit,
  qualityToPercent,
  isAuthorizedEmail,
  isEmulatorHostname,
  getFunctionUrl,
  canAddLocation,
  validateCoordinates,
  formatCoordinateDisplay,
  formatDashboardCoordinateDisplay,
  getLogStatusClass,
  buildPhotonDisplayName,
  moveSuggestionIndex,
  shouldSearchAutocomplete,
  mapAuthErrorCode,
  mapGeolocationError
} from "../public/lib/helpers.js";

test("frontend helpers escape and render forecast badges", () => {
  assert.match(getForecastBadgeHtml(0.85, "Great"), /quality-dot/);
  assert.match(getForecastBadgeHtml(0.45, "Fair"), /#f97316/);
  assert.match(getForecastBadgeHtml(0.1, "Low"), /#ef4444/);
  assert.match(getForecastBadgeHtml(0.35, "Fair"), /35% \(Fair\)/);
  assert.match(getForecastBadgeHtml(35, "Fair"), /35% \(Fair\)/);
  assert.match(getForecastBadgeHtml(0.35, "35%"), /35% \(Fair\)/);
  assert.match(getForecastBadgeHtml(0.7), /70%/);
  assert.match(getForecastBadgeHtml(0.55), /quality-text-strong/);
  assert.match(getForecastBadgeHtml(null), /N\/A/);
  assert.strictEqual(escapeHtml('<img onerror="x">'), "&lt;img onerror=&quot;x&quot;&gt;");
});

test("frontend helpers normalize quality values", () => {
  assert.strictEqual(normalizeQualityToUnit(0.35), 0.35);
  assert.strictEqual(normalizeQualityToUnit(35), 0.35);
  assert.strictEqual(qualityToPercent(0.7), 70);
  assert.strictEqual(qualityToPercent(35), 35);
});

test("frontend helpers enforce auth and location limits", () => {
  assert.strictEqual(isAuthorizedEmail(AUTHORIZED_EMAIL), true);
  assert.strictEqual(isAuthorizedEmail("other@gmail.com"), false);
  assert.strictEqual(canAddLocation(9), true);
  assert.strictEqual(canAddLocation(10), false);
  assert.strictEqual(validateCoordinates(40.1, -74.2), true);
  assert.strictEqual(validateCoordinates(Number("bad"), 1), false);
});

test("frontend helpers build URLs and display strings", () => {
  assert.strictEqual(isEmulatorHostname("localhost"), true);
  assert.strictEqual(isEmulatorHostname("sunsethue-helper.web.app"), false);
  assert.strictEqual(
    getFunctionUrl("triggerReport", { isEmulator: true, projectId: "demo" }),
    "http://127.0.0.1:5001/demo/us-central1/triggerReport"
  );
  assert.strictEqual(getFunctionUrl("triggerReport", { isEmulator: false }), "/api/triggerReport");
  assert.match(formatCoordinateDisplay(40.7128, -74.006), /40\.7128/);
  assert.match(formatDashboardCoordinateDisplay(40.7128, -74.006), /74\.01° W/);
});

test("frontend helpers support autocomplete and log rendering", () => {
  assert.strictEqual(shouldSearchAutocomplete("ny"), false);
  assert.strictEqual(shouldSearchAutocomplete("nyc"), true);
  assert.strictEqual(moveSuggestionIndex(0, 1, 3), 1);
  assert.strictEqual(moveSuggestionIndex(2, 1, 3), 0);
  assert.strictEqual(moveSuggestionIndex(0, -1, 3), 2);
  assert.strictEqual(
    buildPhotonDisplayName({ name: "Paris", state: "Ile-de-France", country: "France" }),
    "Paris, Ile-de-France, France"
  );
  assert.strictEqual(getLogStatusClass("warning"), "warning");
  assert.strictEqual(getLogStatusClass("failure"), "failure");
  assert.strictEqual(getLogStatusClass("success"), "success");
});

test("frontend helpers map auth and geolocation errors", () => {
  assert.match(mapAuthErrorCode("auth/wrong-password"), /Invalid email or password/);
  assert.match(mapAuthErrorCode("auth/unknown"), /Failed to sign in/);
  const geolocationErrors = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
  assert.match(mapGeolocationError(1, geolocationErrors), /permission denied/i);
  assert.match(mapGeolocationError(2, geolocationErrors), /unavailable/i);
  assert.match(mapGeolocationError(3, geolocationErrors), /timed out/i);
});
