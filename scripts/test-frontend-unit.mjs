import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  getForecastBadgeHtml,
  normalizeQualityToUnit,
  qualityToPercent,
  canAddLocation,
  validateCoordinates,
  formatCoordinateDisplay,
  getLogStatusClass,
  buildPhotonDisplayName,
  moveSuggestionIndex,
  shouldSearchAutocomplete,
  mapGeolocationError
} from "../public/lib/helpers.js";
import { initHealth } from "../public/features/health.js";
import { locationThresholdSummary } from "../public/features/thresholds.js";

test("frontend helpers escape and render forecast badges", () => {
  assert.match(getForecastBadgeHtml(0.85, "Great"), /quality-meter/);
  assert.match(getForecastBadgeHtml(0.85, "Great"), /quality-badge/);
  assert.match(getForecastBadgeHtml(0.85, "Great"), /q-great/);
  assert.match(getForecastBadgeHtml(0.85, "Great"), /85%/);
  assert.match(getForecastBadgeHtml(0.85, "Great"), /Great/);
  assert.match(getForecastBadgeHtml(0.45, "Fair"), /quality-meter-fill/);
  assert.match(getForecastBadgeHtml(0.45, "Fair"), /q-fair/);
  assert.match(getForecastBadgeHtml(0.45, "Fair"), /width:45%/);
  assert.match(getForecastBadgeHtml(0.1, "Low"), /Low/);
  assert.match(getForecastBadgeHtml(0.1, "Low"), /q-poor/);
  assert.match(getForecastBadgeHtml(0.35, "Fair"), /35%/);
  assert.match(getForecastBadgeHtml(35, "Fair"), /35%/);
  assert.match(getForecastBadgeHtml(0.35, "35%"), /Poor/);
  assert.match(getForecastBadgeHtml(0.7), /70%/);
  assert.match(getForecastBadgeHtml(0.7), /q-good/);
  assert.match(getForecastBadgeHtml(null), /N\/A/);
  assert.strictEqual(escapeHtml('<img onerror="x">'), "&lt;img onerror=&quot;x&quot;&gt;");
});

test("frontend helpers normalize quality values", () => {
  assert.strictEqual(normalizeQualityToUnit(0.35), 0.35);
  assert.strictEqual(normalizeQualityToUnit(35), 0.35);
  assert.strictEqual(qualityToPercent(0.7), 70);
  assert.strictEqual(qualityToPercent(35), 35);
});

test("frontend helpers enforce location limits and coordinates", () => {
  assert.strictEqual(canAddLocation(9), true);
  assert.strictEqual(canAddLocation(10), false);
  assert.strictEqual(validateCoordinates(40.1, -74.2), true);
  assert.strictEqual(validateCoordinates(90, 180), true);
  assert.strictEqual(validateCoordinates(-90, -180), true);
  assert.strictEqual(validateCoordinates(91, 0), false);
  assert.strictEqual(validateCoordinates(-91, 0), false);
  assert.strictEqual(validateCoordinates(0, 181), false);
  assert.strictEqual(validateCoordinates(0, -181), false);
  assert.strictEqual(validateCoordinates(Number("bad"), 1), false);
});

test("frontend helpers build display strings", () => {
  assert.match(formatCoordinateDisplay(40.7128, -74.006), /40\.7128° N \/ 74\.0060° W/);
  assert.match(formatCoordinateDisplay(-33.8688, 151.2093), /33\.8688° S \/ 151\.2093° E/);
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

test("frontend helpers map geolocation errors", () => {
  const geolocationErrors = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
  assert.match(mapGeolocationError(1, geolocationErrors), /permission denied/i);
  assert.match(mapGeolocationError(2, geolocationErrors), /unavailable/i);
  assert.match(mapGeolocationError(3, geolocationErrors), /timed out/i);
});

test("health fetch failure clears stuck Loading… channel subtitles", async () => {
  const elements = {
    "notification-health-summary": { textContent: "", innerHTML: "" },
    "notification-health-skips": { textContent: "", innerHTML: "<p>prior</p>" },
    "notification-health-selftest": { textContent: "", innerHTML: "" },
    "email-channel-subtitle": { textContent: "Loading…", innerHTML: "" },
    "pushover-channel-subtitle": { textContent: "Loading…", innerHTML: "" },
    "webpush-channel-subtitle": { textContent: "Loading…", innerHTML: "" },
    "webhook-channel-subtitle": { textContent: "Loading…", innerHTML: "" }
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    }
  };

  try {
    const { fetchOperationalStatus } = initHealth({
      api: {
        async get() {
          throw new Error("health unavailable");
        }
      }
    });
    await fetchOperationalStatus();

    assert.equal(elements["notification-health-summary"].textContent, "Unable to load notification health.");
    assert.equal(elements["notification-health-selftest"].textContent, "Unable to load self-test status.");
    assert.equal(elements["email-channel-subtitle"].textContent, "Status temporarily unavailable");
    assert.equal(elements["pushover-channel-subtitle"].textContent, "Status temporarily unavailable");
    assert.equal(elements["webpush-channel-subtitle"].textContent, "Loading…");
    assert.equal(elements["webhook-channel-subtitle"].textContent, "Status temporarily unavailable");
    assert.equal(elements["notification-health-skips"].innerHTML, "");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("locationThresholdSummary returns compact desktop values without Alerts: prefix", () => {
  const always = [
    { channel: "email", enabled: true, thresholdPercent: null },
    { channel: "pushover", enabled: true, thresholdPercent: null },
    { channel: "webpush", enabled: true, thresholdPercent: null },
    { channel: "webhook", enabled: true, thresholdPercent: null }
  ];
  assert.equal(locationThresholdSummary(always, () => true), "Always");
  assert.doesNotMatch(locationThresholdSummary(always, () => true), /Alerts:/);

  const fifty = always.map((rule) => ({ ...rule, thresholdPercent: 50 }));
  assert.equal(locationThresholdSummary(fifty, () => true), "50%+");

  const mixed = [
    { channel: "email", enabled: true, thresholdPercent: 70 },
    { channel: "pushover", enabled: true, thresholdPercent: null },
    { channel: "webpush", enabled: true, thresholdPercent: 40 },
    { channel: "webhook", enabled: false, thresholdPercent: null }
  ];
  assert.equal(locationThresholdSummary(mixed, () => true), "Mixed");

  const off = always.map((rule) => ({ ...rule, enabled: false }));
  assert.equal(locationThresholdSummary(off, () => true), "Off");
});

test("locationThresholdSummary ignores globally disabled channels when classifying", () => {
  const rules = [
    { channel: "email", enabled: true, thresholdPercent: null },
    { channel: "pushover", enabled: true, thresholdPercent: 50 },
    { channel: "webpush", enabled: true, thresholdPercent: null },
    { channel: "webhook", enabled: true, thresholdPercent: null }
  ];
  // Pushover differs, but if it is globally disabled the remaining Always channels stay Always.
  assert.equal(
    locationThresholdSummary(rules, (channel) => channel !== "pushover"),
    "Always"
  );
  assert.equal(locationThresholdSummary(rules, () => true), "Mixed");
  assert.equal(locationThresholdSummary(rules, () => false), "Off");
});
