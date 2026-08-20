/**
 * Side-effect-free helpers for the production deployment preflight.
 *
 * Importing this module must not run any network calls or set process state.
 * The executable entrypoint lives in scripts/prepare-deployment.mjs; tests
 * import pure helpers from here instead.
 */

/**
 * Build the informational D1 schema preflight summary for the prepare job.
 *
 * Prepare does not fail on missing tables/columns — the dedicated `schema` job
 * applies additive schema and `db:schema:verify` fail-closes. This helper only
 * describes what prepare observed so operators can see what the schema job
 * will add. Returns a single summary string for the job summary row.
 *
 * @param {{ missing: string[], skipped: boolean, reason?: string }} tables
 * @param {{ missing: string[], skipped: boolean, reason?: string }} columns
 * @returns {string}
 */
export function summarizeD1Checks(tables, columns) {
  if (tables?.skipped || columns?.skipped) {
    return "skipped (no Cloudflare credentials)";
  }
  const tableMissing = tables?.missing ?? [];
  const columnMissing = columns?.missing ?? [];
  if (tableMissing.length === 0 && columnMissing.length === 0) {
    return "all required tables and columns present";
  }
  const parts = [];
  if (tableMissing.length > 0) {
    parts.push(`tables missing: ${tableMissing.join(", ")}`);
  }
  if (columnMissing.length > 0) {
    parts.push(`columns missing: ${columnMissing.join(", ")} (schema job will apply)`);
  }
  return `informational — ${parts.join("; ")}`;
}
