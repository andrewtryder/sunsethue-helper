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
