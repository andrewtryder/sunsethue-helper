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
