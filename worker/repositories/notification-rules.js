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
  const { results: locations } = await env.DB.prepare(
    "SELECT id FROM locations ORDER BY createdAt ASC"
  ).all();
  for (const loc of locations || []) {
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
