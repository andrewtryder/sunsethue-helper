import { REQUIRED_D1_TABLES } from "../shared/schema-manifest.js";

const MANUAL_RETRY_COOLDOWN_MS = 60_000;
const MAX_MANUAL_RETRIES = 10;

export async function getLocations(env) {
  const { results } = await env.DB.prepare("SELECT * FROM locations ORDER BY createdAt ASC").all();
  return results;
}

/**
 * Insert a location only when the tenant is under the 10-row cap.
 * The atomic `INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < 10` prevents
 * a race between two concurrent tabs from creating an 11th row.
 *
 * @returns {Promise<boolean>} true when a row was inserted
 */
export async function addLocation(env, loc) {
  const result = await env.DB.prepare(
    `INSERT INTO locations (id, name, latitude, longitude, createdAt)
     SELECT ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM locations) < 10`
  ).bind(loc.id, loc.name, loc.latitude, loc.longitude, loc.createdAt).run();
  if (result.meta?.changes !== 1) return false;
  const threshold = loc.defaultThresholdPercent === undefined ? 50 : loc.defaultThresholdPercent;
  const now = loc.createdAt;
  const settings = await getNotificationSettingsRow(env);
  const channels = [
    { channel: "email", master: settings ? settings.emailEnabled : 1 },
    { channel: "pushover", master: settings ? settings.pushoverEnabled : 1 },
    { channel: "webpush", master: 1 },
    { channel: "webhook", master: settings ? settings.webhookEnabled : 1 }
  ];
  for (const entry of channels) {
    const enabled = Number(entry.master) === 1 ? 1 : 0;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO location_notification_rules
        (locationId, channel, enabled, thresholdPercent, eventScope, updatedAt)
       VALUES (?, ?, ?, ?, 'either', ?)`
    ).bind(loc.id, entry.channel, enabled, threshold, now).run();
  }
  return true;
}

/**
 * @returns {Promise<boolean>} true when the addressed row was updated
 */
export async function updateLocation(env, id, loc) {
  const result = await env.DB.prepare(
    "UPDATE locations SET name = ?, latitude = ?, longitude = ? WHERE id = ?"
  ).bind(loc.name, loc.latitude, loc.longitude, id).run();
  return result.meta?.changes === 1;
}

/**
 * @returns {Promise<boolean>} true when the addressed row was deleted
 */
export async function deleteLocation(env, id) {
  const result = await env.DB.prepare("DELETE FROM locations WHERE id = ?").bind(id).run();
  return result.meta?.changes === 1;
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
      (id, emailEnabled, emailTo, pushoverEnabled, pushoverDevice, pushoverPriority, pushoverSound,
       webhookEnabled, webhookMaskedHostname, webhookLastSuccessAt, webhookLastFailureCode, updatedAt)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       emailEnabled = excluded.emailEnabled,
       emailTo = excluded.emailTo,
       pushoverEnabled = excluded.pushoverEnabled,
       pushoverDevice = excluded.pushoverDevice,
       pushoverPriority = excluded.pushoverPriority,
       pushoverSound = excluded.pushoverSound,
       webhookEnabled = excluded.webhookEnabled,
       webhookMaskedHostname = excluded.webhookMaskedHostname,
       webhookLastSuccessAt = excluded.webhookLastSuccessAt,
       webhookLastFailureCode = excluded.webhookLastFailureCode,
       updatedAt = excluded.updatedAt`
  ).bind(
    settings.emailEnabled,
    settings.emailTo,
    settings.pushoverEnabled,
    settings.pushoverDevice,
    settings.pushoverPriority,
    settings.pushoverSound,
    settings.webhookEnabled ?? 0,
    settings.webhookMaskedHostname ?? null,
    settings.webhookLastSuccessAt ?? null,
    settings.webhookLastFailureCode ?? null,
    settings.updatedAt
  ).run();
}

export async function getApplicationSettingsRow(env) {
  return env.DB.prepare("SELECT * FROM application_settings WHERE id = 1").first();
}

export async function upsertApplicationSettings(env, settings) {
  await env.DB.prepare(
    `INSERT INTO application_settings (
      id, scheduleTimezone, displayTimezoneMode, displayTimezone, scheduleTimes,
      weeklySelfTestEnabled, weeklySelfTestMode, weeklySelfTestDay, weeklySelfTestTime, updatedAt
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      scheduleTimezone = excluded.scheduleTimezone,
      displayTimezoneMode = excluded.displayTimezoneMode,
      displayTimezone = excluded.displayTimezone,
      scheduleTimes = excluded.scheduleTimes,
      weeklySelfTestEnabled = excluded.weeklySelfTestEnabled,
      weeklySelfTestMode = excluded.weeklySelfTestMode,
      weeklySelfTestDay = excluded.weeklySelfTestDay,
      weeklySelfTestTime = excluded.weeklySelfTestTime,
      updatedAt = excluded.updatedAt`
  ).bind(
    settings.scheduleTimezone,
    settings.displayTimezoneMode,
    settings.displayTimezone,
    typeof settings.scheduleTimes === "string"
      ? settings.scheduleTimes
      : JSON.stringify(settings.scheduleTimes),
    settings.weeklySelfTestEnabled ? 1 : 0,
    settings.weeklySelfTestMode,
    settings.weeklySelfTestDay,
    settings.weeklySelfTestTime,
    settings.updatedAt
  ).run();
}

export async function listLocationNotificationRules(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM location_notification_rules ORDER BY locationId, channel"
  ).all();
  return results || [];
}

export async function getLocationNotificationRules(env, locationId) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM location_notification_rules WHERE locationId = ? ORDER BY channel"
  ).bind(locationId).all();
  return results || [];
}

export async function upsertLocationNotificationRule(env, rule) {
  await env.DB.prepare(
    `INSERT INTO location_notification_rules
      (locationId, channel, enabled, thresholdPercent, eventScope, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(locationId, channel) DO UPDATE SET
       enabled = excluded.enabled,
       thresholdPercent = excluded.thresholdPercent,
       eventScope = excluded.eventScope,
       updatedAt = excluded.updatedAt`
  ).bind(
    rule.locationId,
    rule.channel,
    rule.enabled ? 1 : 0,
    rule.thresholdPercent ?? null,
    rule.eventScope || "either",
    rule.updatedAt
  ).run();
}

export async function copyLocationRulesToAll(env, sourceLocationId, now) {
  const source = await getLocationNotificationRules(env, sourceLocationId);
  const locations = await getLocations(env);
  for (const loc of locations) {
    if (loc.id === sourceLocationId) continue;
    for (const rule of source) {
      await upsertLocationNotificationRule(env, {
        locationId: loc.id,
        channel: rule.channel,
        enabled: Number(rule.enabled) === 1,
        thresholdPercent: rule.thresholdPercent,
        eventScope: rule.eventScope,
        updatedAt: now
      });
    }
  }
}

export async function setChannelEnabledForAllLocations(env, channel, enabled, now) {
  await env.DB.prepare(
    `UPDATE location_notification_rules SET enabled = ?, updatedAt = ? WHERE channel = ?`
  ).bind(enabled ? 1 : 0, now, channel).run();
}

/**
 * Claim a scheduled occurrence key. Returns true when this caller inserted the row.
 */
export async function claimScheduledOccurrence(env, occurrenceKey, startedAt, runId = null) {
  try {
    const result = await env.DB.prepare(
      `INSERT INTO scheduled_occurrences (occurrenceKey, startedAt, runId) VALUES (?, ?, ?)`
    ).bind(occurrenceKey, startedAt, runId).run();
    return result.meta?.changes === 1;
  } catch {
    return false;
  }
}

export async function bindOccurrenceRun(env, occurrenceKey, runId) {
  await env.DB.prepare(
    "UPDATE scheduled_occurrences SET runId = ? WHERE occurrenceKey = ?"
  ).bind(runId, occurrenceKey).run();
}

export async function listWebPushSubscriptions(env, { enabledOnly = false } = {}) {
  const sql = enabledOnly
    ? "SELECT * FROM web_push_subscriptions WHERE enabled = 1 ORDER BY createdAt ASC"
    : "SELECT * FROM web_push_subscriptions ORDER BY createdAt ASC";
  const { results } = await env.DB.prepare(sql).all();
  return results || [];
}

export async function getWebPushSubscription(env, id) {
  return env.DB.prepare("SELECT * FROM web_push_subscriptions WHERE id = ?").bind(id).first();
}

export async function upsertWebPushSubscription(env, row) {
  await env.DB.prepare(
    `INSERT INTO web_push_subscriptions
      (id, endpoint, p256dh, auth, deviceName, userAgentSummary, enabled, createdAt, lastSeenAt, lastSuccessAt, lastFailureCode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       deviceName = excluded.deviceName,
       userAgentSummary = excluded.userAgentSummary,
       enabled = excluded.enabled,
       lastSeenAt = excluded.lastSeenAt,
       lastFailureCode = NULL`
  ).bind(
    row.id,
    row.endpoint,
    row.p256dh,
    row.auth,
    row.deviceName,
    row.userAgentSummary ?? null,
    row.enabled ? 1 : 0,
    row.createdAt,
    row.lastSeenAt ?? row.createdAt,
    row.lastSuccessAt ?? null,
    row.lastFailureCode ?? null
  ).run();
}

export async function updateWebPushSubscriptionMeta(env, id, patch) {
  const row = await getWebPushSubscription(env, id);
  if (!row) return false;
  await env.DB.prepare(
    `UPDATE web_push_subscriptions SET
      deviceName = ?, enabled = ?, lastSeenAt = ?, lastSuccessAt = ?, lastFailureCode = ?
     WHERE id = ?`
  ).bind(
    patch.deviceName ?? row.deviceName,
    patch.enabled === undefined ? row.enabled : (patch.enabled ? 1 : 0),
    patch.lastSeenAt ?? row.lastSeenAt,
    patch.lastSuccessAt === undefined ? row.lastSuccessAt : patch.lastSuccessAt,
    patch.lastFailureCode === undefined ? row.lastFailureCode : patch.lastFailureCode,
    id
  ).run();
  return true;
}

export async function deleteWebPushSubscription(env, id) {
  const result = await env.DB.prepare("DELETE FROM web_push_subscriptions WHERE id = ?").bind(id).run();
  return result.meta?.changes === 1;
}

export async function publicWebPushSubscriptions(env) {
  const rows = await listWebPushSubscriptions(env);
  return rows.map((row) => ({
    id: row.id,
    deviceName: row.deviceName,
    userAgentSummary: row.userAgentSummary,
    enabled: Number(row.enabled) === 1,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureCode: row.lastFailureCode
  }));
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
    ...jobs.map((job) => {
      const status = job.status || "pending";
      return env.DB.prepare(
        `INSERT INTO notification_outbox
          (id, runId, channel, deliveryTargetId, status, payload, attempts, nextAttemptAt, lockedUntil, leaseToken, providerMessageId, lastErrorCode, createdAt, sentAt,
           deliveryEmailTo, deliveryPushoverDevice, deliveryPushoverPriority, deliveryPushoverSound,
           manualAttempts, lastManualRetryAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL, ?, ?, NULL,
                 ?, ?, ?, ?,
                 0, NULL)`
      ).bind(
        job.id,
        job.runId,
        job.channel,
        job.deliveryTargetId ?? null,
        status,
        job.payload,
        job.nextAttemptAt,
        job.lastErrorCode ?? null,
        job.createdAt,
        job.deliveryEmailTo ?? null,
        job.deliveryPushoverDevice ?? null,
        job.deliveryPushoverPriority ?? null,
        job.deliveryPushoverSound ?? null
      );
    })
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

/**
 * Atomically claim an outbox job for the caller identified by `leaseToken`.
 * Only pending jobs due for delivery or expired-lease processing jobs can be
 * claimed. Returns true when this caller now owns the lease.
 */
export async function claimOutboxJob(env, id, now, lockedUntil, leaseToken) {
  const result = await env.DB.prepare(
    `UPDATE notification_outbox
     SET status = 'processing', lockedUntil = ?, leaseToken = ?
     WHERE id = ?
       AND ((status = 'pending' AND nextAttemptAt <= ?)
         OR (status = 'processing' AND lockedUntil IS NOT NULL AND lockedUntil <= ?))`
  ).bind(lockedUntil, leaseToken, id, now, now).run();
  return result.meta?.changes === 1;
}

export async function getOutboxJob(env, id) {
  return env.DB.prepare("SELECT * FROM notification_outbox WHERE id = ?").bind(id).first();
}

/**
 * Atomic transition to 'sent'. Requires the current lease token to match, so a
 * dispatcher whose lease expired mid-flight can never overwrite a subsequent
 * claim's outcome. Returns true when the transition actually happened.
 */
export async function completeOutboxJob(env, id, leaseToken, sentAt, providerMessageId = null) {
  const result = await env.DB.prepare(
    `UPDATE notification_outbox
     SET status = 'sent', sentAt = ?, providerMessageId = ?, lockedUntil = NULL, leaseToken = NULL, lastErrorCode = NULL
     WHERE id = ? AND status = 'processing' AND leaseToken = ?`
  ).bind(sentAt, providerMessageId, id, leaseToken).run();
  return result.meta?.changes === 1;
}

/**
 * Atomic transition to 'failed' or back to 'pending'. Same lease-fencing rule
 * as completeOutboxJob. Returns true when the transition actually happened.
 */
export async function failOutboxJob(env, id, leaseToken, { attempts, nextAttemptAt, code, terminal }) {
  const result = await env.DB.prepare(
    `UPDATE notification_outbox
     SET status = ?, attempts = ?, nextAttemptAt = ?, lockedUntil = NULL, leaseToken = NULL, lastErrorCode = ?
     WHERE id = ? AND status = 'processing' AND leaseToken = ?`
  ).bind(terminal ? "failed" : "pending", attempts, nextAttemptAt, code, id, leaseToken).run();
  return result.meta?.changes === 1;
}

export async function getNotificationDeliveries(env, limit = 30) {
  const { results } = await env.DB.prepare(
    `SELECT id, runId, channel, deliveryTargetId, status, attempts, createdAt, sentAt, lastErrorCode
     FROM notification_outbox ORDER BY createdAt DESC LIMIT ?`
  ).bind(limit).all();
  return results;
}

/**
 * Owner-initiated retry of a failed delivery.
 *
 * Enforces a cooldown between manual retries and a hard cap on total manual
 * attempts. Automatic attempts are reset to 0 so the exponential-backoff clock
 * starts over, but manualAttempts is tracked separately so a persistent
 * upstream failure cannot be poked forever.
 *
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
export async function retryFailedDelivery(env, id, now) {
  const row = await env.DB.prepare(
    "SELECT status, manualAttempts, lastManualRetryAt FROM notification_outbox WHERE id = ?"
  ).bind(id).first();
  if (!row || row.status !== "failed") return { ok: false, code: "NOT_RETRYABLE" };

  if (row.lastManualRetryAt !== null && row.lastManualRetryAt !== undefined) {
    const elapsed = now - Number(row.lastManualRetryAt);
    if (elapsed < MANUAL_RETRY_COOLDOWN_MS) {
      return { ok: false, code: "MANUAL_RETRY_COOLDOWN" };
    }
  }

  const manualAttempts = Number(row.manualAttempts ?? 0);
  if (manualAttempts >= MAX_MANUAL_RETRIES) {
    return { ok: false, code: "MANUAL_RETRY_EXHAUSTED" };
  }

  const result = await env.DB.prepare(
    `UPDATE notification_outbox
     SET status = 'pending', attempts = 0, nextAttemptAt = ?, lockedUntil = NULL, leaseToken = NULL,
         lastErrorCode = NULL, sentAt = NULL,
         manualAttempts = manualAttempts + 1, lastManualRetryAt = ?
     WHERE id = ? AND status = 'failed'`
  ).bind(now, now, id).run();
  if (result.meta?.changes !== 1) return { ok: false, code: "NOT_RETRYABLE" };
  return { ok: true };
}

/**
 * Race-free acquisition of the manual-test rate-limit slot.
 *
 * First-run path: `INSERT OR IGNORE` (the winning caller creates the row).
 * Steady-state path: `UPDATE ... WHERE lastRequestedAt <= now - interval`, which
 * only affects one row per interval. A caller wins only if either operation
 * reports one row of change.
 */
export async function claimNotificationTestSlot(env, now, intervalMs = 60_000) {
  const threshold = now - intervalMs;
  const updated = await env.DB.prepare(
    `UPDATE notification_test_limiter
     SET lastRequestedAt = ?
     WHERE id = 1 AND lastRequestedAt <= ?`
  ).bind(now, threshold).run();
  if (updated.meta?.changes === 1) return true;
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO notification_test_limiter (id, lastRequestedAt) VALUES (1, ?)`
  ).bind(now).run();
  return inserted.meta?.changes === 1;
}

/**
 * Same race-free semantics as `claimNotificationTestSlot`, applied to the
 * autocomplete proxy so a browser session can't hammer Photon.
 */
export async function claimAutocompleteSlot(env, now, intervalMs = 500) {
  const threshold = now - intervalMs;
  const updated = await env.DB.prepare(
    `UPDATE autocomplete_limiter
     SET lastRequestedAt = ?
     WHERE id = 1 AND lastRequestedAt <= ?`
  ).bind(now, threshold).run();
  if (updated.meta?.changes === 1) return true;
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO autocomplete_limiter (id, lastRequestedAt) VALUES (1, ?)`
  ).bind(now).run();
  return inserted.meta?.changes === 1;
}

/**
 * Try to acquire the singleton report execution lock.
 * Returns true when this caller owns the lease.
 */
export async function claimReportLock(env, now, lockedUntil, leaseToken) {
  const updated = await env.DB.prepare(
    `UPDATE report_execution_lock
     SET leaseToken = ?, lockedUntil = ?, lastStartedAt = ?
     WHERE id = 1 AND (lockedUntil IS NULL OR lockedUntil <= ?)`
  ).bind(leaseToken, lockedUntil, now, now).run();
  if (updated.meta?.changes === 1) return true;
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO report_execution_lock (id, leaseToken, lockedUntil, lastStartedAt)
     VALUES (1, ?, ?, ?)`
  ).bind(leaseToken, lockedUntil, now).run();
  return inserted.meta?.changes === 1;
}

/**
 * Release the report lock, but only when we still own it. A caller whose lease
 * expired must not clobber a fresh acquirer's leaseToken.
 */
export async function releaseReportLock(env, leaseToken) {
  const result = await env.DB.prepare(
    `UPDATE report_execution_lock
     SET leaseToken = NULL, lockedUntil = 0
     WHERE id = 1 AND leaseToken = ?`
  ).bind(leaseToken).run();
  return result.meta?.changes === 1;
}

export async function getProviderCredentialStatus(env, provider) {
  return env.DB.prepare(
    `SELECT provider, configured, maskedIdentifier, updatedAt, lastValidatedAt, lastValidationCode, lastUpdatedBy
     FROM provider_credential_status WHERE provider = ?`
  ).bind(provider).first();
}

export async function listProviderCredentialStatus(env) {
  const result = await env.DB.prepare(
    `SELECT provider, configured, maskedIdentifier, updatedAt, lastValidatedAt, lastValidationCode, lastUpdatedBy
     FROM provider_credential_status`
  ).all();
  return result.results || [];
}

export async function upsertProviderCredentialStatus(env, {
  provider,
  configured,
  maskedIdentifier = null,
  updatedAt,
  lastValidatedAt = null,
  lastValidationCode = null,
  lastUpdatedBy = null
}) {
  await env.DB.prepare(
    `INSERT INTO provider_credential_status
      (provider, configured, maskedIdentifier, updatedAt, lastValidatedAt, lastValidationCode, lastUpdatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET
      configured = excluded.configured,
      maskedIdentifier = excluded.maskedIdentifier,
      updatedAt = excluded.updatedAt,
      lastValidatedAt = excluded.lastValidatedAt,
      lastValidationCode = excluded.lastValidationCode,
      lastUpdatedBy = excluded.lastUpdatedBy`
  ).bind(
    provider,
    configured ? 1 : 0,
    maskedIdentifier,
    updatedAt,
    lastValidatedAt,
    lastValidationCode,
    lastUpdatedBy
  ).run();
}

export async function claimProviderCredentialSlot(env, now, intervalMs = 10_000) {
  const threshold = now - intervalMs;
  const updated = await env.DB.prepare(
    `UPDATE provider_credential_limiter
     SET lastRequestedAt = ?
     WHERE id = 1 AND lastRequestedAt <= ?`
  ).bind(now, threshold).run();
  if (updated.meta?.changes === 1) return true;
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO provider_credential_limiter (id, lastRequestedAt) VALUES (1, ?)`
  ).bind(now).run();
  return inserted.meta?.changes === 1;
}

/**
 * Disable a notification channel when its credentials are removed.
 */
export async function disableNotificationChannel(env, channel, now) {
  const row = await getNotificationSettingsRow(env);
  if (!row) return;
  if (channel === "email") {
    await upsertNotificationSettings(env, { ...row, emailEnabled: 0, updatedAt: now });
  } else if (channel === "pushover") {
    await upsertNotificationSettings(env, { ...row, pushoverEnabled: 0, updatedAt: now });
  } else if (channel === "webhook") {
    await upsertNotificationSettings(env, { ...row, webhookEnabled: 0, updatedAt: now });
  }
}

/** Non-sensitive operational snapshot for the authenticated status endpoint. */
export async function getOperationalStatus(env, now = Date.now()) {
  const scheduled = await env.DB.prepare(
    `SELECT timestamp FROM runs
     WHERE triggerType LIKE 'SCHEDULED:%' OR triggerType IN ('AM', 'NOON', 'PM')
     ORDER BY timestamp DESC LIMIT 1`
  ).first();
  const successful = await env.DB.prepare(
    `SELECT timestamp FROM runs WHERE status = 'success' ORDER BY timestamp DESC LIMIT 1`
  ).first();
  const pending = await env.DB.prepare(
    `SELECT COUNT(*) AS c, MIN(createdAt) AS oldest
     FROM notification_outbox WHERE status IN ('pending', 'processing')`
  ).first();
  const failed = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM notification_outbox WHERE status = 'failed'`
  ).first();
  const tables = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table'`
  ).all();
  const present = new Set((tables.results || []).map((row) => row.name));
  const oldest = pending?.oldest == null ? null : Number(pending.oldest);
  return {
    lastScheduledRunAt: scheduled?.timestamp ? new Date(Number(scheduled.timestamp)).toISOString() : null,
    lastSuccessfulRunAt: successful?.timestamp ? new Date(Number(successful.timestamp)).toISOString() : null,
    oldestPendingDeliveryAgeSeconds:
      oldest == null ? 0 : Math.max(0, Math.floor((now - oldest) / 1000)),
    pendingDeliveries: Number(pending?.c || 0),
    failedDeliveries: Number(failed?.c || 0),
    requiredTablesPresent: REQUIRED_D1_TABLES.every((name) => present.has(name))
  };
}

/** Retain recent runs/outbox/credential metadata. Safe to call from cron. */
export async function pruneOperationalData(env, now = Date.now(), retainMs = 90 * 24 * 60 * 60 * 1000) {
  const cutoff = now - retainMs;
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM notification_outbox
       WHERE createdAt < ? AND status IN ('sent', 'failed', 'skipped')`
    ).bind(cutoff),
    env.DB.prepare(`DELETE FROM runs WHERE timestamp < ?`).bind(cutoff),
    env.DB.prepare(
      `UPDATE provider_credential_status
       SET lastValidationCode = NULL
       WHERE updatedAt IS NOT NULL AND updatedAt < ?`
    ).bind(cutoff),
    env.DB.prepare(`DELETE FROM health_check_runs WHERE startedAt < ?`).bind(cutoff)
  ]);
}

export async function insertHealthCheckRun(env, row) {
  await env.DB.prepare(
    `INSERT INTO health_check_runs
      (id, checkType, provider, status, code, startedAt, completedAt, durationMs, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id,
    row.checkType,
    row.provider ?? null,
    row.status,
    row.code ?? null,
    row.startedAt,
    row.completedAt ?? null,
    row.durationMs ?? null,
    row.details ?? null
  ).run();
}

export async function getLatestHealthCheckRun(env) {
  return env.DB.prepare(
    `SELECT * FROM health_check_runs ORDER BY startedAt DESC LIMIT 1`
  ).first();
}

export async function insertAdminAuditEvent(env, row) {
  await env.DB.prepare(
    `INSERT INTO admin_audit_events (id, eventType, categories, counts, createdAt)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(row.id, row.eventType, row.categories ?? null, row.counts ?? null, row.createdAt).run();
}

export async function countHistoryScope(env, scope) {
  if (scope === "runs") {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM runs`).first();
    return Number(row?.c || 0);
  }
  if (scope === "deliveries_completed") {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM notification_outbox WHERE status IN ('sent', 'skipped')`
    ).first();
    return Number(row?.c || 0);
  }
  if (scope === "deliveries_failed") {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM notification_outbox WHERE status = 'failed'`
    ).first();
    return Number(row?.c || 0);
  }
  if (scope === "self_tests") {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM health_check_runs`).first();
    return Number(row?.c || 0);
  }
  if (scope === "credential_audit") {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM admin_audit_events WHERE eventType != 'history_cleared'`
    ).first();
    return Number(row?.c || 0);
  }
  return 0;
}

export async function exportHistoryScope(env, scope) {
  if (scope === "runs") {
    const { results } = await env.DB.prepare(
      `SELECT id, timestamp, triggerType, status, locationsCount, error FROM runs ORDER BY timestamp DESC LIMIT 500`
    ).all();
    return results || [];
  }
  if (scope === "deliveries_completed") {
    const { results } = await env.DB.prepare(
      `SELECT id, runId, channel, status, lastErrorCode, createdAt, sentAt
       FROM notification_outbox WHERE status IN ('sent', 'skipped')
       ORDER BY createdAt DESC LIMIT 500`
    ).all();
    return results || [];
  }
  if (scope === "deliveries_failed") {
    const { results } = await env.DB.prepare(
      `SELECT id, runId, channel, status, lastErrorCode, createdAt
       FROM notification_outbox WHERE status = 'failed'
       ORDER BY createdAt DESC LIMIT 500`
    ).all();
    return results || [];
  }
  if (scope === "self_tests") {
    const { results } = await env.DB.prepare(
      `SELECT id, checkType, provider, status, code, startedAt, completedAt, durationMs
       FROM health_check_runs ORDER BY startedAt DESC LIMIT 200`
    ).all();
    return results || [];
  }
  if (scope === "credential_audit") {
    const { results } = await env.DB.prepare(
      `SELECT id, eventType, categories, counts, createdAt
       FROM admin_audit_events WHERE eventType != 'history_cleared'
       ORDER BY createdAt DESC LIMIT 200`
    ).all();
    return results || [];
  }
  return [];
}

/**
 * Delete terminal history for the given scopes. Never touches pending/processing outbox.
 */
export async function clearHistoryScopes(env, scopes) {
  const statements = [];
  for (const scope of scopes) {
    if (scope === "deliveries_completed") {
      statements.push(env.DB.prepare(
        `DELETE FROM notification_outbox WHERE status IN ('sent', 'skipped')`
      ));
    } else if (scope === "deliveries_failed") {
      statements.push(env.DB.prepare(
        `DELETE FROM notification_outbox WHERE status = 'failed'`
      ));
    } else if (scope === "self_tests") {
      statements.push(env.DB.prepare(`DELETE FROM health_check_runs`));
    } else if (scope === "credential_audit") {
      statements.push(env.DB.prepare(
        `DELETE FROM admin_audit_events WHERE eventType != 'history_cleared'`
      ));
    }
  }
  // Delete runs after terminal outbox rows so pending/processing FK parents remain.
  if (scopes.includes("runs")) {
    statements.push(env.DB.prepare(
      `DELETE FROM runs
       WHERE id NOT IN (
         SELECT DISTINCT runId FROM notification_outbox
         WHERE status IN ('pending', 'processing')
       )`
    ));
  }
  if (statements.length > 0) await env.DB.batch(statements);
}

/**
 * Non-sensitive first-run checklist aggregate.
 */
export async function getSetupStatus(env) {
  const tables = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table'`
  ).all();
  const present = new Set((tables.results || []).map((row) => row.name));
  const settings = await getNotificationSettingsRow(env);
  const emailStatus = await getProviderCredentialStatus(env, "email");
  const pushoverStatus = await getProviderCredentialStatus(env, "pushover");
  const webhookStatus = await getProviderCredentialStatus(env, "webhook");
  const pushCount = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM web_push_subscriptions WHERE enabled = 1`
  ).first().catch(() => ({ c: 0 }));

  return {
    accessReady: true,
    databaseTables: REQUIRED_D1_TABLES.every((name) => present.has(name)) ? "ready" : "missing",
    forecastApiKey: "unknown",
    email: Number(emailStatus?.configured) === 1 ? "ready" : "not_configured",
    pushover: Number(pushoverStatus?.configured) === 1 ? "ready" : "not_configured",
    webhook: Number(webhookStatus?.configured) === 1 || Number(settings?.webhookEnabled) === 1
      ? (Number(webhookStatus?.configured) === 1 ? "ready" : "not_configured")
      : "not_configured",
    browserPushDevices: Number(pushCount?.c || 0) > 0 ? "ready" : "not_configured",
    browserPushDeviceCount: Number(pushCount?.c || 0)
  };
}
