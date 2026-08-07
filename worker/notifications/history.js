import { NotificationError } from "./errors.js";
import {
  countHistoryScope,
  exportHistoryScope,
  clearHistoryScopes
} from "../repositories/history.js";
import { insertAdminAuditEvent } from "../repositories/health-checks.js";

export const HISTORY_SCOPES = Object.freeze([
  "runs",
  "deliveries_completed",
  "deliveries_failed",
  "self_tests",
  "credential_audit",
  "all"
]);

const SCOPE_SET = new Set(HISTORY_SCOPES);

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseHistoryScopes(raw) {
  let list = raw;
  if (typeof raw === "string") {
    list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(list) || list.length === 0) {
    throw new NotificationError("INVALID_HISTORY_SCOPE", { retryable: false });
  }
  const scopes = [];
  for (const item of list) {
    if (!SCOPE_SET.has(item)) {
      throw new NotificationError("INVALID_HISTORY_SCOPE", { retryable: false });
    }
    if (!scopes.includes(item)) scopes.push(item);
  }
  if (scopes.includes("all") && scopes.length > 1) {
    throw new NotificationError("INVALID_HISTORY_SCOPE", { retryable: false });
  }
  return scopes;
}

/**
 * Expand `all` into concrete deletable scopes (never pending outbox).
 */
export function expandHistoryScopes(scopes) {
  if (scopes.includes("all")) {
    return ["runs", "deliveries_completed", "deliveries_failed", "self_tests", "credential_audit"];
  }
  return scopes;
}

export async function countHistoryScopes(env, scopes) {
  const expanded = expandHistoryScopes(scopes);
  const counts = {};
  for (const scope of expanded) {
    counts[scope] = await countHistoryScope(env, scope);
  }
  return counts;
}

export async function exportHistory(env, scopes) {
  const expanded = expandHistoryScopes(scopes);
  const payload = { exportedAt: new Date().toISOString(), scopes: expanded, data: {} };
  for (const scope of expanded) {
    payload.data[scope] = await exportHistoryScope(env, scope);
  }
  return payload;
}

/**
 * Clear selected terminal history. Never deletes pending/processing outbox,
 * locations, settings, credentials, locks, limiters, or in-flight occurrence keys.
 */
export async function clearHistory(env, { scopes, confirm }, now = Date.now()) {
  const parsed = parseHistoryScopes(scopes);
  if (parsed.includes("all") && confirm !== "CLEAR") {
    throw new NotificationError("CLEAR_CONFIRM_REQUIRED", { retryable: false });
  }
  const expanded = expandHistoryScopes(parsed);
  const countsBefore = await countHistoryScopes(env, expanded);
  await clearHistoryScopes(env, expanded);
  await insertAdminAuditEvent(env, {
    id: crypto.randomUUID(),
    eventType: "history_cleared",
    categories: JSON.stringify(expanded),
    counts: JSON.stringify(countsBefore),
    createdAt: now
  });
  return { cleared: expanded, counts: countsBefore };
}