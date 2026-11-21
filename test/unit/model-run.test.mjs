import test from "node:test";
import assert from "node:assert/strict";
import {
  cachedUpcomingEvents,
  fetchCurrentRunId,
  forecastRunId,
  parseModelRunId
} from "../../worker/model-run.js";
import { createFetchFake, jsonOk } from "../support/fakes.mjs";

const NOW = Date.parse("2026-11-20T18:00:00Z");

test("run metadata parser recognizes optional direct and nested model IDs", () => {
  assert.equal(parseModelRunId({ run_id: " model-1 " }), "model-1");
  assert.equal(parseModelRunId({ data: { run_id: "model-2" } }), "model-2");
  assert.equal(parseModelRunId({ current_run: { id: "model-3" } }), "model-3");
  assert.equal(parseModelRunId({ data: { runs: { current: { id: "model-4" } } } }), "model-4");
  assert.equal(parseModelRunId({ data: { run_info: { current_run: { id: "model-5" } } } }), "model-5");
  assert.equal(parseModelRunId({ run_id: true }), null);
  assert.equal(parseModelRunId({ run_id: " " }), null);
  assert.equal(parseModelRunId({ run_id: "x".repeat(129) }), null);
  assert.equal(parseModelRunId({ data: [] }), null);
  assert.equal(parseModelRunId(null), null);
});

test("bulk forecast must itself prove that its events share a model run", () => {
  assert.equal(forecastRunId({ run_id: "m-1", data: [] }), "m-1");
  assert.equal(forecastRunId({ data: [{ run_id: "m-1" }, { run_id: "m-1" }] }), "m-1");
  assert.equal(forecastRunId({ data: [{ run_id: "m-1" }, { run_id: "m-2" }] }), null);
  assert.equal(forecastRunId({ data: [{ run_id: "m-1" }, {}] }), null);
  assert.equal(forecastRunId({ data: [{ type: "sunset" }] }), null);
  assert.equal(forecastRunId({ data: [] }), null);
  assert.equal(forecastRunId([]), null);
});

test("run-info uses the x-api-key header, never a URL query string", async () => {
  let auth;
  const fake = createFetchFake({
    "api.sunsethue.com": (url, init) => {
      assert.equal(url.pathname, "/run-info");
      assert.equal(url.search, "");
      assert.equal(init.redirect, "error");
      auth = init.headers["x-api-key"];
      return jsonOk({ data: { current_run: { id: "m-2" } } });
    }
  });
  assert.equal(await fetchCurrentRunId({ fetch: fake, apiKey: " secret-key " }), "m-2");
  assert.equal(auth, "secret-key");
  assert.equal(fake.calls.length, 1);
});

test("missing, invalid and unknown /run-info safely fall back to normal fetching", async () => {
  const missingKey = createFetchFake({});
  assert.equal(await fetchCurrentRunId({ fetch: missingKey, apiKey: "" }), null);
  assert.equal(missingKey.calls.length, 0);

  for (const response of [
    jsonOk({ unexpected: true }),
    jsonOk({ code: "over-quota" }, { status: 429 }),
    new Response("unparseable", { status: 200 }),
    new Response("x".repeat(17_000), { status: 200 }),
    jsonOk({ run_id: "x" }, { headers: { "content-length": "50000" } })
  ]) {
    const fake = createFetchFake({ "api.sunsethue.com": () => response.clone() });
    assert.equal(await fetchCurrentRunId({ fetch: fake, apiKey: "x" }), null);
  }
  assert.equal(await fetchCurrentRunId({
    fetch: async () => { throw new TypeError("network down"); }, apiKey: "x"
  }), null);
});

function cached(overrides = {}) {
  return {
    forecastModelRunId: "m-1",
    forecastError: null,
    latestSunriseTime: new Date(NOW + 4 * 3600_000).toISOString(),
    latestSunriseQuality: 0.5,
    latestSunriseText: "Good",
    latestSunsetTime: new Date(NOW + 10 * 3600_000).toISOString(),
    latestSunsetQuality: 0.6,
    latestSunsetText: "Excellent",
    ...overrides
  };
}

test("cached upcoming sunrise/sunset needs a known run, complete future times, and no error", () => {
  const result = cachedUpcomingEvents(cached(), NOW);
  assert.equal(result.runId, "m-1");
  assert.equal(result.sunrise.quality, 0.5);
  assert.equal(result.sunset.quality_text, "Excellent");
  assert.equal(cachedUpcomingEvents(cached({ forecastModelRunId: null }), NOW), null);
  assert.equal(cachedUpcomingEvents(cached({ forecastError: "FORECAST_UNAVAILABLE" }), NOW), null);
  assert.equal(cachedUpcomingEvents(cached({ latestSunriseTime: null }), NOW), null);
  assert.equal(cachedUpcomingEvents(cached({ latestSunriseTime: new Date(NOW).toISOString() }), NOW), null);
  assert.equal(cachedUpcomingEvents(cached({ latestSunsetTime: "invalid" }), NOW), null);
  assert.equal(cachedUpcomingEvents(null, NOW), null);
});
