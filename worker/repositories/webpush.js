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
