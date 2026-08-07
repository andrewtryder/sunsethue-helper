import {
  listLocationNotificationRules,
  upsertLocationNotificationRule
} from "../repositories/notification-rules.js";
import { NotificationError } from "./errors.js";
import { NOTIFICATION_CHANNELS } from "../../shared/schema-manifest.js";
import { evaluateLocationForThreshold } from "../../shared/time-format.js";
import { qualityToPercent } from "../helpers.js";

const CHANNEL_SET = new Set(NOTIFICATION_CHANNELS);

export function publicRule(row) {
  return {
    locationId: row.locationId,
    channel: row.channel,
    enabled: Number(row.enabled) === 1,
    thresholdPercent: row.thresholdPercent === null || row.thresholdPercent === undefined
      ? null
      : Number(row.thresholdPercent),
    eventScope: row.eventScope || "either",
    updatedAt: row.updatedAt
  };
}

export async function listRules(env) {
  const rows = await listLocationNotificationRules(env);
  return rows.map(publicRule);
}

export function validateRulePatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new NotificationError("INVALID_RULE");
  }
  if (!CHANNEL_SET.has(input.channel)) throw new NotificationError("INVALID_CHANNEL");
  if (typeof input.locationId !== "string" || input.locationId.length === 0) {
    throw new NotificationError("INVALID_LOCATION");
  }
  if (typeof input.enabled !== "boolean") throw new NotificationError("INVALID_RULE");
  let thresholdPercent = input.thresholdPercent;
  if (thresholdPercent === undefined) thresholdPercent = null;
  if (thresholdPercent !== null) {
    const n = Number(thresholdPercent);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new NotificationError("INVALID_THRESHOLD");
    thresholdPercent = n;
  }
  // enabled=false is Never
  if (!input.enabled) {
    thresholdPercent = thresholdPercent ?? null;
  }
  const eventScope = input.eventScope || "either";
  if (!["either", "sunrise", "sunset", "both"].includes(eventScope)) {
    throw new NotificationError("INVALID_EVENT_SCOPE");
  }
  return {
    locationId: input.locationId,
    channel: input.channel,
    enabled: input.enabled,
    thresholdPercent: input.enabled ? thresholdPercent : null,
    eventScope
  };
}

export async function saveRule(env, input, now = Date.now()) {
  const rule = validateRulePatch(input);
  await upsertLocationNotificationRule(env, { ...rule, updatedAt: now });
  return publicRule({ ...rule, updatedAt: now, enabled: rule.enabled ? 1 : 0 });
}

/**
 * Filter report results for a channel using per-location rules.
 * @returns {{ locations: object[], triggeredByLocation: Map<string, string[]>, qualifies: boolean }}
 */
export function filterResultsForChannel(results, rulesForChannel) {
  const byLocation = new Map(rulesForChannel.map((r) => [r.locationId, r]));
  const filtered = [];
  const triggeredByLocation = new Map();
  for (const result of results) {
    const locationId = result.locationId || result.id;
    const rule = byLocation.get(locationId);
    if (!rule || !rule.enabled) continue;
    const evaluation = evaluateLocationForThreshold(result, rule, qualityToPercent);
    if (!evaluation.qualifies) continue;
    filtered.push({ ...result, triggeredEvents: evaluation.triggeredEvents });
    triggeredByLocation.set(result.name, evaluation.triggeredEvents);
  }
  return {
    locations: filtered,
    triggeredByLocation,
    qualifies: filtered.length > 0
  };
}
