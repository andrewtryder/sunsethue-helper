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

export async function getNotificationSettingsRow(env) {
  return env.DB.prepare("SELECT * FROM notification_settings WHERE id = 1").first();
}

export async function upsertNotificationSettings(env, settings) {
  await env.DB.prepare(
    `INSERT INTO notification_settings
      (id, emailEnabled, emailTo, pushoverEnabled, pushoverDevice, pushoverPriority, pushoverSound, updatedAt)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       emailEnabled = excluded.emailEnabled,
       emailTo = excluded.emailTo,
       pushoverEnabled = excluded.pushoverEnabled,
       pushoverDevice = excluded.pushoverDevice,
       pushoverPriority = excluded.pushoverPriority,
       pushoverSound = excluded.pushoverSound,
       updatedAt = excluded.updatedAt`
  ).bind(
    settings.emailEnabled,
    settings.emailTo,
    settings.pushoverEnabled,
    settings.pushoverDevice,
    settings.pushoverPriority,
    settings.pushoverSound,
    settings.updatedAt
  ).run();
}

export async function createRunAndOutbox(env, run, jobs) {
  const statements = [
    env.DB.prepare(
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
    ),
    ...jobs.map((job) => env.DB.prepare(
      `INSERT INTO notification_outbox
        (id, runId, channel, status, payload, attempts, nextAttemptAt, lockedUntil, providerMessageId, lastErrorCode, createdAt, sentAt)
       VALUES (?, ?, ?, 'pending', ?, 0, ?, NULL, NULL, NULL, ?, NULL)`
    ).bind(job.id, job.runId, job.channel, job.payload, job.nextAttemptAt, job.createdAt))
  ];
  return env.DB.batch(statements);
}

export async function getOutboxJobs(env, now, limit = 20) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM notification_outbox
     WHERE (status = 'pending' AND nextAttemptAt <= ?)
        OR (status = 'processing' AND lockedUntil IS NOT NULL AND lockedUntil <= ?)
     ORDER BY nextAttemptAt ASC
     LIMIT ?`
  ).bind(now, now, limit).all();
  return results;
}

export async function claimOutboxJob(env, id, now, lockedUntil) {
  const result = await env.DB.prepare(
    `UPDATE notification_outbox
     SET status = 'processing', lockedUntil = ?
     WHERE id = ?
       AND ((status = 'pending' AND nextAttemptAt <= ?)
         OR (status = 'processing' AND lockedUntil IS NOT NULL AND lockedUntil <= ?))`
  ).bind(lockedUntil, id, now, now).run();
  return result.meta?.changes === 1;
}

export async function getOutboxJob(env, id) {
  return env.DB.prepare("SELECT * FROM notification_outbox WHERE id = ?").bind(id).first();
}

export async function completeOutboxJob(env, id, sentAt, providerMessageId = null) {
  await env.DB.prepare(
    `UPDATE notification_outbox
     SET status = 'sent', sentAt = ?, providerMessageId = ?, lockedUntil = NULL, lastErrorCode = NULL
     WHERE id = ? AND status = 'processing'`
  ).bind(sentAt, providerMessageId, id).run();
}

export async function failOutboxJob(env, id, { attempts, nextAttemptAt, code, terminal }) {
  await env.DB.prepare(
    `UPDATE notification_outbox
     SET status = ?, attempts = ?, nextAttemptAt = ?, lockedUntil = NULL, lastErrorCode = ?
     WHERE id = ? AND status = 'processing'`
  ).bind(terminal ? "failed" : "pending", attempts, nextAttemptAt, code, id).run();
}

export async function getNotificationDeliveries(env, limit = 30) {
  const { results } = await env.DB.prepare(
    `SELECT id, runId, channel, status, attempts, createdAt, sentAt, lastErrorCode
     FROM notification_outbox ORDER BY createdAt DESC LIMIT ?`
  ).bind(limit).all();
  return results;
}

export async function retryFailedDelivery(env, id, now) {
  const result = await env.DB.prepare(
    `UPDATE notification_outbox
     SET status = 'pending', attempts = 0, nextAttemptAt = ?, lockedUntil = NULL, lastErrorCode = NULL, sentAt = NULL
     WHERE id = ? AND status = 'failed'`
  ).bind(now, id).run();
  return result.meta?.changes === 1;
}

export async function claimNotificationTestSlot(env, now, intervalMs = 60_000) {
  const existing = await env.DB.prepare(
    "SELECT lastRequestedAt FROM notification_test_limiter WHERE id = 1"
  ).first();
  if (existing && now - existing.lastRequestedAt < intervalMs) return false;
  await env.DB.prepare(
    `INSERT INTO notification_test_limiter (id, lastRequestedAt) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET lastRequestedAt = excluded.lastRequestedAt`
  ).bind(now).run();
  return true;
}
