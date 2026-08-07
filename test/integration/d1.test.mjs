import test from "node:test";
import assert from "node:assert/strict";
import * as db from "../../worker/db.js";
import { REQUIRED_D1_TABLES } from "../../shared/schema-manifest.js";
import { createLocalD1, readSchemaSql } from "../support/local-d1.mjs";

/**
 * Runs the real SQL from worker/db.js against a throwaway in-memory SQLite
 * database built from schema.sql. Never touches production D1.
 */
async function withDatabase(fn) {
  const local = await createLocalD1();
  try {
    await fn({ DB: local.DB }, local);
  } finally {
    local.close();
  }
}

test("schema.sql creates the tables and indexes the Worker queries", async () => {
  await withDatabase(async (env, local) => {
    const schema = await readSchemaSql();

    const tables = local.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    assert.deepEqual(tables, [...REQUIRED_D1_TABLES].sort());

    const indexes = local.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    assert.deepEqual(indexes, [
      "idx_admin_audit_created",
      "idx_health_check_runs_started",
      "idx_location_rules_channel",
      "idx_locations_createdAt",
      "idx_outbox_pending",
      "idx_outbox_run_channel_target",
      "idx_runs_timestamp",
      "idx_web_push_enabled"
    ]);

    // IF NOT EXISTS makes re-application safe for local resets.
    local.database.exec(schema);
    assert.equal(
      local.database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table'").get()
        .total,
      tables.length
    );
  });
});

test("setup status reports a missing required table", async () => {
  await withDatabase(async (env, local) => {
    local.database.exec("DROP TABLE provider_credential_limiter");
    const status = await db.getSetupStatus(env);
    assert.equal(status.databaseTables, "missing");
  });
});

test("location reads and mutations round-trip through D1", async () => {
  await withDatabase(async (env) => {
    assert.deepEqual(await db.getLocations(env), []);

    await db.addLocation(env, {
      id: "loc-1",
      name: "Beach",
      latitude: 42.9,
      longitude: -71.1,
      createdAt: 1000
    });
    await db.addLocation(env, {
      id: "loc-2",
      name: "Summit",
      latitude: 44.2,
      longitude: -71.3,
      createdAt: 2000
    });

    const ordered = await db.getLocations(env);
    assert.deepEqual(
      ordered.map((row) => row.id),
      ["loc-1", "loc-2"],
      "getLocations must return createdAt ascending"
    );
    assert.equal(ordered[0].latestSunriseTime, null);

    await db.updateLocation(env, "loc-1", { name: "Beach North", latitude: 43, longitude: -71 });
    const updated = (await db.getLocations(env)).find((row) => row.id === "loc-1");
    assert.equal(updated.name, "Beach North");
    assert.equal(updated.latitude, 43);

    await db.deleteLocation(env, "loc-2");
    assert.deepEqual((await db.getLocations(env)).map((row) => row.id), ["loc-1"]);
  });
});

test("forecast updates persist success and error states", async () => {
  await withDatabase(async (env) => {
    await db.addLocation(env, {
      id: "loc-1",
      name: "Beach",
      latitude: 42.9,
      longitude: -71.1,
      createdAt: 1000
    });

    await db.updateLocationForecast(env, "loc-1", {
      latestSunriseTime: "2026-07-15T09:30:00Z",
      latestSunriseQuality: 0.8,
      latestSunriseText: "Great",
      latestSunsetTime: "2026-07-15T23:50:00Z",
      latestSunsetQuality: 0.4,
      latestSunsetText: "Fair",
      lastForecastUpdate: 5000,
      forecastError: null
    });

    let row = (await db.getLocations(env))[0];
    assert.equal(row.latestSunriseQuality, 0.8);
    assert.equal(row.latestSunsetText, "Fair");
    assert.equal(row.forecastError, null);

    await db.updateLocationForecast(env, "loc-1", {
      lastForecastUpdate: 6000,
      forecastError: "API returned HTTP status 500"
    });

    row = (await db.getLocations(env))[0];
    assert.equal(row.forecastError, "API returned HTTP status 500");
    assert.equal(row.lastForecastUpdate, 6000);
    assert.equal(row.latestSunriseTime, null, "partial update clears stale forecast fields");
  });
});

test("run history serializes results and returns newest first", async () => {
  await withDatabase(async (env) => {
    await db.addRun(env, {
      id: "run-old",
      timestamp: 1000,
      triggerType: "AM",
      status: "success",
      locationsCount: 1,
      results: [{ name: "Beach", status: "success" }],
      error: null
    });
    await db.addRun(env, {
      id: "run-new",
      timestamp: 2000,
      triggerType: "PM",
      status: "failure",
      locationsCount: 0,
      results: [],
      error: "boom"
    });

    const runs = await db.getRuns(env);
    assert.deepEqual(runs.map((run) => run.id), ["run-new", "run-old"]);
    assert.deepEqual(runs[1].results, [{ name: "Beach", status: "success" }]);
    assert.equal(runs[0].error, "boom");
  });
});

test("run history tolerates a corrupt results column", async () => {
  await withDatabase(async (env, local) => {
    local.database
      .prepare(
        "INSERT INTO runs (id, timestamp, triggerType, status, locationsCount, results, error) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run("run-bad", 3000, "AM", "success", 0, "{not json", null);

    const runs = await db.getRuns(env);
    assert.deepEqual(runs[0].results, []);
  });
});

test("run history is capped at 20 rows", async () => {
  await withDatabase(async (env) => {
    for (let index = 0; index < 25; index += 1) {
      await db.addRun(env, {
        id: `run-${index}`,
        timestamp: index,
        triggerType: "AM",
        status: "success",
        locationsCount: 0,
        results: [],
        error: null
      });
    }
    const runs = await db.getRuns(env);
    assert.equal(runs.length, 20);
    assert.equal(runs[0].id, "run-24");
  });
});

test("duplicate primary keys are rejected by the schema", async () => {
  await withDatabase(async (env) => {
    const location = {
      id: "loc-1",
      name: "Beach",
      latitude: 1,
      longitude: 2,
      createdAt: 1
    };
    await db.addLocation(env, location);
    await assert.rejects(() => db.addLocation(env, location));
  });
});
