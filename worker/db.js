export async function getLocations(env) {
  const { results } = await env.DB.prepare("SELECT * FROM locations ORDER BY createdAt ASC").all();
  return results;
}

export async function addLocation(env, loc) {
  await env.DB.prepare(
    "INSERT INTO locations (id, name, latitude, longitude, createdAt) VALUES (?, ?, ?, ?, ?)"
  ).bind(loc.id, loc.name, loc.latitude, loc.longitude, loc.createdAt).run();
}

export async function updateLocation(env, id, loc) {
  await env.DB.prepare(
    "UPDATE locations SET name = ?, latitude = ?, longitude = ? WHERE id = ?"
  ).bind(loc.name, loc.latitude, loc.longitude, id).run();
}

export async function deleteLocation(env, id) {
  await env.DB.prepare("DELETE FROM locations WHERE id = ?").bind(id).run();
}

export async function updateLocationForecast(env, id, data) {
  await env.DB.prepare(
    `UPDATE locations SET 
      latestSunriseTime = ?, 
      latestSunriseQuality = ?, 
      latestSunriseText = ?, 
      latestSunsetTime = ?, 
      latestSunsetQuality = ?, 
      latestSunsetText = ?, 
      lastForecastUpdate = ?, 
      forecastError = ? 
     WHERE id = ?`
  ).bind(
    data.latestSunriseTime ?? null,
    data.latestSunriseQuality ?? null,
    data.latestSunriseText ?? null,
    data.latestSunsetTime ?? null,
    data.latestSunsetQuality ?? null,
    data.latestSunsetText ?? null,
    data.lastForecastUpdate,
    data.forecastError ?? null,
    id
  ).run();
}

export async function getRuns(env) {
  const { results } = await env.DB.prepare("SELECT * FROM runs ORDER BY timestamp DESC LIMIT 20").all();
  return results.map((row) => {
    let parsedResults = [];
    try {
      parsedResults = JSON.parse(row.results);
    } catch (e) {
      console.error("Failed to parse run results JSON:", e);
    }
    return {
      ...row,
      results: parsedResults
    };
  });
}

export async function addRun(env, run) {
  await env.DB.prepare(
    `INSERT INTO runs (id, timestamp, triggerType, status, locationsCount, results, error) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    run.id,
    run.timestamp,
    run.triggerType,
    run.status,
    run.locationsCount,
    JSON.stringify(run.results),
    run.error ?? null
  ).run();
}
