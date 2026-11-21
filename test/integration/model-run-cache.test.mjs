import test from "node:test";
import assert from "node:assert/strict";
import { generateReport } from "../../worker/services/report.js";
import * as db from "../../worker/db.js";
import { createLocalD1 } from "../support/local-d1.mjs";
import { createFetchFake, jsonOk, sunsethueForecast } from "../support/fakes.mjs";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const HOUR = 60 * 60 * 1000;

async function withLocations(fn, count = 1) {
  const local = await createLocalD1();
  const env = { DB: local.DB, SUNSETHUE_API_KEY: "test-key" };
  for (let i = 0; i < count; i++) {
    await db.addLocation(env, {
      id: `location-${i}`, name: `Location ${i}`,
      latitude: 40 + i, longitude: -70, createdAt: i + 1
    });
  }
  try {
    return await fn(env);
  } finally {
    local.close();
  }
}

function forecastAndRunInfo({ currentRun = "m-1", forecastRun = currentRun, baseTime = NOW } = {}) {
  const calls = { forecast: 0, runInfo: 0 };
  const fetchFake = createFetchFake({
    "api.sunsethue.com": (url) => {
      if (url.pathname === "/run-info") {
        calls.runInfo++;
        return jsonOk({ data: { current_run: { id: currentRun } } });
      }
      if (url.pathname === "/forecast") {
        calls.forecast++;
        return jsonOk({ ...sunsethueForecast({ baseTime }), ...(forecastRun ? { run_id: forecastRun } : {}) });
      }
      throw new Error(`Unexpected Sunsethue path ${url.pathname}`);
    }
  });
  return { fetchFake, calls };
}

test("scheduled report reuses D1 forecasts when the provider run is unchanged", async () => {
  await withLocations(async (env) => {
    const { fetchFake, calls } = forecastAndRunInfo();
    const first = await generateReport("SCHEDULED:06:00", env, { fetch: fetchFake, now: NOW });
    assert.equal(calls.forecast, 1);
    assert.equal(calls.runInfo, 0);
    assert.equal(first.results[0].sunrise.quality, 0.75);

    const saved = (await db.getLocations(env))[0];
    assert.equal(saved.forecastModelRunId, "m-1");
    assert.equal(saved.lastForecastUpdate, NOW);

    const second = await generateReport("SCHEDULED:12:00", env, { fetch: fetchFake, now: NOW + HOUR });
    assert.equal(calls.runInfo, 1);
    assert.equal(calls.forecast, 1, "no second /forecast request");
    assert.deepEqual(second.results[0].sunrise, first.results[0].sunrise);
    assert.equal((await db.getLocations(env))[0].lastForecastUpdate, NOW, "cache hit preserves source fetch time");
  });
});

test("shared run-info check avoids per-location checks", async () => {
  await withLocations(async (env) => {
    const { fetchFake, calls } = forecastAndRunInfo();
    await generateReport("SCHEDULED:06:00", env, { fetch: fetchFake, now: NOW });
    assert.equal(calls.forecast, 3);
    await generateReport("SCHEDULED:12:00", env, { fetch: fetchFake, now: NOW + HOUR });
    assert.equal(calls.runInfo, 1);
    assert.equal(calls.forecast, 3);
  }, 3);
});

test("new model run refreshes the forecast grid", async () => {
  await withLocations(async (env) => {
    const initial = forecastAndRunInfo({ currentRun: "m-1" });
    await generateReport("SCHEDULED:06:00", env, { fetch: initial.fetchFake, now: NOW });
    const updated = forecastAndRunInfo({ currentRun: "m-2" });
    await generateReport("SCHEDULED:12:00", env, { fetch: updated.fetchFake, now: NOW + HOUR });
    assert.equal(updated.calls.runInfo, 1);
    assert.equal(updated.calls.forecast, 1);
    assert.equal((await db.getLocations(env))[0].forecastModelRunId, "m-2");
  });
});

test("unknown run-info format retains the legacy forecast fetch", async () => {
  await withLocations(async (env) => {
    await generateReport("SCHEDULED:06:00", env, { fetch: forecastAndRunInfo().fetchFake, now: NOW });
    const calls = { forecast: 0, runInfo: 0 };
    const fake = createFetchFake({
      "api.sunsethue.com": (url) => {
        if (url.pathname === "/run-info") {
          calls.runInfo++;
          return jsonOk({ unexpected: true });
        }
        calls.forecast++;
        return jsonOk({ ...sunsethueForecast({ baseTime: NOW }), run_id: "m-1" });
      }
    });
    await generateReport("SCHEDULED:12:00", env, { fetch: fake, now: NOW + HOUR });
    assert.deepEqual(calls, { forecast: 1, runInfo: 1 });
  });
});

test("manual checks always fetch even when cached and current run matches", async () => {
  await withLocations(async (env) => {
    const { fetchFake, calls } = forecastAndRunInfo();
    await generateReport("SCHEDULED:06:00", env, { fetch: fetchFake, now: NOW });
    await generateReport("Manual Test", env, { fetch: fetchFake, now: NOW + HOUR });
    assert.equal(calls.forecast, 2);
    assert.equal(calls.runInfo, 0);
  });
});

test("missing bulk forecast run metadata never produces an unsafe cache hit", async () => {
  await withLocations(async (env) => {
    const { fetchFake, calls } = forecastAndRunInfo({ forecastRun: null });
    await generateReport("SCHEDULED:06:00", env, { fetch: fetchFake, now: NOW });
    await generateReport("SCHEDULED:12:00", env, { fetch: fetchFake, now: NOW + HOUR });
    assert.equal(calls.forecast, 2);
    assert.equal(calls.runInfo, 0);
    assert.equal((await db.getLocations(env))[0].forecastModelRunId, null);
  });
});

test("an elapsed next sunrise forces a new forecast even for an unchanged run", async () => {
  await withLocations(async (env) => {
    const { fetchFake, calls } = forecastAndRunInfo();
    await generateReport("SCHEDULED:06:00", env, { fetch: fetchFake, now: NOW });
    await generateReport("SCHEDULED:18:00", env, { fetch: fetchFake, now: NOW + 7 * HOUR });
    assert.equal(calls.forecast, 2);
    assert.equal(calls.runInfo, 0);
  });
});

test("editing coordinates clears cached metadata and forces the next fetch", async () => {
  await withLocations(async (env) => {
    const { fetchFake, calls } = forecastAndRunInfo();
    await generateReport("SCHEDULED:06:00", env, { fetch: fetchFake, now: NOW });
    await db.updateLocation(env, "location-0", { name: "Updated", latitude: 12, longitude: 21 });
    assert.equal((await db.getLocations(env))[0].forecastModelRunId, null);
    await generateReport("SCHEDULED:12:00", env, { fetch: fetchFake, now: NOW + HOUR });
    assert.equal(calls.forecast, 2);
    assert.equal(calls.runInfo, 0);
  });
});

test("an upstream failure clears the cache and marks the report as unavailable", async () => {
  await withLocations(async (env) => {
    const { fetchFake } = forecastAndRunInfo();
    await generateReport("SCHEDULED:06:00", env, { fetch: fetchFake, now: NOW });
    const failing = createFetchFake({
      "api.sunsethue.com": (url) =>
        url.pathname === "/run-info"
          ? jsonOk({ run_id: "m-2" })
          : new Response("backend down", { status: 503 })
    });
    const report = await generateReport("SCHEDULED:12:00", env, { fetch: failing, now: NOW + HOUR });
    assert.equal(report.results[0].error, "FORECAST_UNAVAILABLE");
    const row = (await db.getLocations(env))[0];
    assert.equal(row.forecastModelRunId, null);
    assert.equal(row.forecastError, "FORECAST_UNAVAILABLE");
  });
});
