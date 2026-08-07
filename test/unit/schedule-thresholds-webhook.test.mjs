import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOccurrenceKey,
  effectiveLocationScheduleTimes,
  evaluateLocationForThreshold,
  getZonedParts,
  parseOptionalLocationScheduleTimes,
  parseScheduleTimes,
  qualityMeetsThreshold,
  validateLocationScheduleTimesInput,
  validateScheduleTimes
} from "../../shared/time-format.js";
import { estimateForecastQuota } from "../../worker/notifications/application-settings.js";
import { assertSafeWebhookUrl, signWebhookBody } from "../../worker/notifications/resolve-webhook-transport.js";
import { CredentialError } from "../../worker/lib/transport-schema.js";
import { qualityToPercent } from "../../worker/helpers.js";

test("schedule times validate whole hours only", () => {
  assert.equal(validateScheduleTimes(["06:00", "12:00"]).ok, true);
  assert.equal(validateScheduleTimes(["06:30"]).ok, false);
  assert.equal(validateScheduleTimes([]).ok, false);
  assert.deepEqual(parseScheduleTimes('["18:00","06:00","06:00"]'), ["06:00", "18:00"]);
});

test("occurrence key is deterministic in a timezone", () => {
  const winter = new Date("2026-01-15T11:00:00Z");
  const parts = getZonedParts(winter, "America/New_York");
  assert.equal(parts.hour, 6);
  assert.equal(buildOccurrenceKey("America/New_York", parts), "America/New_York:2026-01-15:06:00");
});

test("threshold evaluation qualifies on either sunrise or sunset", () => {
  const rule = { enabled: true, thresholdPercent: 60, eventScope: "either" };
  const result = evaluateLocationForThreshold({
    sunrise: { quality: 0.42 },
    sunset: { quality: 0.78 },
    error: null
  }, rule, qualityToPercent);
  assert.equal(result.qualifies, true);
  assert.deepEqual(result.triggeredEvents, ["sunset"]);
  assert.equal(qualityMeetsThreshold(50, null), true);
  assert.equal(qualityMeetsThreshold(40, 50), false);
});

test("quota estimator multiplies runs by locations", () => {
  const estimate = estimateForecastQuota({
    scheduleTimes: ["06:00", "12:00", "18:00"],
    activeLocations: 10,
    remainingCredits: 900
  });
  assert.equal(estimate.estimatedRequestsPerDay, 30);
  assert.equal(estimate.estimatedRequestsPer30Days, 900);
  assert.equal(estimate.estimatedDaysUntilExhaustion, 30);
});

test("location schedule override parsing and effective times", () => {
  assert.equal(parseOptionalLocationScheduleTimes(null), null);
  assert.deepEqual(parseOptionalLocationScheduleTimes('["09:00","06:00"]'), ["06:00", "09:00"]);
  assert.equal(validateLocationScheduleTimesInput(null).ok, true);
  assert.equal(validateLocationScheduleTimesInput(["06:30"]).ok, false);
  assert.deepEqual(
    effectiveLocationScheduleTimes({ scheduleTimes: null }, ["06:00", "18:00"]),
    ["06:00", "18:00"]
  );
  assert.deepEqual(
    effectiveLocationScheduleTimes({ scheduleTimes: ["09:00"] }, ["06:00", "18:00"]),
    ["09:00"]
  );
});

test("quota estimator sums per-location effective schedules", () => {
  const estimate = estimateForecastQuota({
    scheduleTimes: ["06:00", "12:00", "18:00"],
    locations: [
      { scheduleTimes: null },
      { scheduleTimes: ["09:00"] },
      { scheduleTimes: ["06:00", "18:00"] }
    ]
  });
  assert.equal(estimate.estimatedRequestsPerDay, 3 + 1 + 2);
  assert.equal(estimate.activeLocations, 3);
});

test("webhook URL SSRF guards", () => {
  assert.throws(() => assertSafeWebhookUrl("http://example.com/hook"), CredentialError);
  assert.throws(() => assertSafeWebhookUrl("https://127.0.0.1/hook"), CredentialError);
  assert.throws(() => assertSafeWebhookUrl("https://user:pass@example.com/hook"), CredentialError);
  assert.equal(assertSafeWebhookUrl("https://example.com/hooks/sunsethue").hostname, "example.com");
});

test("webhook HMAC signature is stable", async () => {
  const sig = await signWebhookBody("super-secret-signing-key", 1700000000, "{\"ok\":true}");
  assert.equal(typeof sig, "string");
  assert.equal(sig.length, 64);
  const again = await signWebhookBody("super-secret-signing-key", 1700000000, "{\"ok\":true}");
  assert.equal(sig, again);
});
