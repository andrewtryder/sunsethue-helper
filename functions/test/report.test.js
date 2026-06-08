const test = require("node:test");
const assert = require("node:assert");
const { buildEmailTableRows, buildHtmlEmail, runAndSendReport } = require("../lib/report");
const { formatTimeOnlyET } = require("../lib/helpers");
const {
  createMockDb,
  createMockFetch,
  createMockTransport,
  defaultEnv
} = require("./test-utils");

const fixedNow = new Date("2026-05-27T10:30:00.000Z").getTime();

const forecastResponse = {
  data: [
    { type: "sunrise", time: "2026-05-28T09:30:00.000Z", quality: 0.85, quality_text: "Great" },
    { type: "sunset", time: "2026-05-27T23:30:00.000Z", quality: 0.75, quality_text: "Great" }
  ]
};

test("buildEmailTableRows swaps sunrise and sunset blocks for AM reports", () => {
  const result = {
    name: "Home",
    latitude: 40.7128,
    longitude: -74.006,
    sunrise: { time: "2026-05-28T09:30:00.000Z", quality: 0.85, quality_text: "Great" },
    sunset: { time: "2026-05-27T23:30:00.000Z", quality: 0.75, quality_text: "Great" },
    error: null
  };

  const amRows = buildEmailTableRows([result], "AM");
  const pmRows = buildEmailTableRows([result], "PM");
  const sunsetMarker = formatTimeOnlyET(result.sunset.time);
  const sunriseMarker = formatTimeOnlyET(result.sunrise.time);

  assert.ok(amRows.indexOf("Sunset ·") < amRows.indexOf("Sunrise ·"));
  assert.ok(amRows.indexOf(sunsetMarker) < amRows.indexOf(sunriseMarker));
  assert.ok(pmRows.indexOf("Sunrise ·") < pmRows.indexOf("Sunset ·"));
  assert.ok(pmRows.indexOf(sunriseMarker) < pmRows.indexOf(sunsetMarker));
  assert.match(amRows, /Home/);
  assert.match(amRows, /85% \(Great\)/);
});

test("buildEmailTableRows renders API error rows safely", () => {
  const rows = buildEmailTableRows([
    {
      name: '<bad>"name"',
      latitude: 1,
      longitude: 2,
      sunrise: null,
      sunset: null,
      error: '<script>alert(1)</script>'
    }
  ], "PM");

  assert.match(rows, /&lt;bad&gt;&quot;name&quot;/);
  assert.match(rows, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("buildHtmlEmail includes report metadata", () => {
  const html = buildHtmlEmail([], "PM", "Wednesday, May 27, 2026 at 6:30 AM");
  assert.match(html, /Sunrise &amp; Sunset Forecast/);
  assert.match(html, /Wednesday, May 27, 2026 at 6:30 AM/);
  assert.match(html, /width=device-width/);
  assert.match(html, /background-color:#f4f4f5/);
});

test("runAndSendReport logs success and skips email when no locations exist", async () => {
  const db = createMockDb({ locations: [] });

  await runAndSendReport("AM", {
    db,
    fetch: createMockFetch({}),
    createTransport: createMockTransport().createTransport,
    env: defaultEnv,
    now: fixedNow
  });

  assert.strictEqual(db.state.runs.length, 1);
  assert.strictEqual(db.state.runs[0].locationsCount, 0);
  assert.strictEqual(db.state.runs[0].status, "success");
});

test("runAndSendReport sends email and caches forecast data on success", async () => {
  const db = createMockDb({
    locations: [{ id: "loc-1", name: "Home", latitude: 40.7, longitude: -74.0, createdAt: 1 }]
  });
  const transport = createMockTransport();
  const fetchFn = createMockFetch({
    "api.sunsethue.com": async () => ({
      ok: true,
      async json() {
        return forecastResponse;
      }
    })
  });

  await runAndSendReport("PM", {
    db,
    fetch: fetchFn,
    createTransport: transport.createTransport,
    env: defaultEnv,
    now: fixedNow
  });

  assert.strictEqual(transport.sentMessages.length, 1);
  assert.match(transport.sentMessages[0].subject, /Evening/);
  assert.strictEqual(db.state.locationUpdates.length, 1);
  assert.strictEqual(db.state.locationUpdates[0].data.latestSunriseQuality, 0.85);
  assert.strictEqual(db.state.runs[0].status, "success");
  assert.strictEqual(db.state.runs[0].results[0].forecast.sunrise.displayPercent, 85);
});

test("runAndSendReport normalizes percent-scale API quality before caching", async () => {
  const percentScaleResponse = {
    data: [
      { type: "sunrise", time: "2026-05-28T09:30:00.000Z", quality: 35, quality_text: "Fair" },
      { type: "sunset", time: "2026-05-27T23:30:00.000Z", quality: 0.7, quality_text: "Great" }
    ]
  };
  const db = createMockDb({
    locations: [{ id: "loc-1", name: "Home", latitude: 40.7, longitude: -74.0, createdAt: 1 }]
  });
  const transport = createMockTransport();
  const fetchFn = createMockFetch({
    "api.sunsethue.com": async () => ({
      ok: true,
      async json() {
        return percentScaleResponse;
      }
    })
  });

  await runAndSendReport("PM", {
    db,
    fetch: fetchFn,
    createTransport: transport.createTransport,
    env: defaultEnv,
    now: fixedNow
  });

  assert.strictEqual(db.state.locationUpdates[0].data.latestSunriseQuality, 0.35);
  assert.strictEqual(db.state.locationUpdates[0].data.latestSunsetQuality, 0.7);
  assert.strictEqual(db.state.runs[0].results[0].forecast.sunrise.displayPercent, 35);
  assert.match(transport.sentMessages[0].html, /35% \(Fair\)/);
});

test("runAndSendReport records warning status when one location fails", async () => {
  const db = createMockDb({
    locations: [
      { id: "loc-1", name: "Good", latitude: 40.7, longitude: -74.0, createdAt: 1 },
      { id: "loc-2", name: "Bad", latitude: 41.0, longitude: -75.0, createdAt: 2 }
    ]
  });
  const transport = createMockTransport();
  const fetchFn = createMockFetch({
    "latitude=40.7": async () => ({
      ok: true,
      async json() {
        return forecastResponse;
      }
    }),
    "latitude=41": async () => ({
      ok: false,
      status: 500,
      async json() {
        return {};
      }
    })
  });

  await runAndSendReport("AM", {
    db,
    fetch: fetchFn,
    createTransport: transport.createTransport,
    env: defaultEnv,
    now: fixedNow
  });

  assert.strictEqual(db.state.runs[0].status, "warning");
  assert.strictEqual(db.state.runs[0].results.length, 2);
  assert.strictEqual(db.state.runs[0].results[1].status, "error");
});

test("runAndSendReport writes failure log and rethrows on invalid env", async () => {
  const db = createMockDb({
    locations: [{ id: "loc-1", name: "Home", latitude: 40.7, longitude: -74.0, createdAt: 1 }]
  });

  await assert.rejects(
    () => runAndSendReport("PM", {
      db,
      fetch: createMockFetch({}),
      createTransport: createMockTransport().createTransport,
      env: { ...defaultEnv, SUNSETHUE_API_KEY: "PLACEHOLDER" },
      now: fixedNow
    }),
    /SUNSETHUE_API_KEY/
  );

  assert.strictEqual(db.state.runs.length, 1);
  assert.strictEqual(db.state.runs[0].status, "failure");
});
