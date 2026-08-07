import {
  getApplicationSettingsRow,
  upsertApplicationSettings
} from "../repositories/application-settings.js";
import { NotificationError } from "./errors.js";
import {
  defaultApplicationSettings,
  effectiveLocationScheduleTimes,
  isValidIanaTimeZone,
  parseScheduleTimes,
  validateScheduleTimes
} from "../../shared/time-format.js";

const DISPLAY_MODES = new Set(["schedule", "device", "selected"]);
const SELF_TEST_MODES = new Set(["passive", "active"]);
const APP_FIELDS = new Set([
  "scheduleTimezone",
  "displayTimezoneMode",
  "displayTimezone",
  "scheduleTimes",
  "weeklySelfTestEnabled",
  "weeklySelfTestMode",
  "weeklySelfTestDay",
  "weeklySelfTestTime"
]);

function rowToPublic(row) {
  const defaults = defaultApplicationSettings(row?.updatedAt || Date.now());
  if (!row) {
    return {
      ...defaults,
      scheduleTimes: [...defaults.scheduleTimes],
      weeklySelfTestEnabled: true
    };
  }
  return {
    scheduleTimezone: row.scheduleTimezone || defaults.scheduleTimezone,
    displayTimezoneMode: row.displayTimezoneMode || "schedule",
    displayTimezone: row.displayTimezone || null,
    scheduleTimes: parseScheduleTimes(row.scheduleTimes),
    weeklySelfTestEnabled: Number(row.weeklySelfTestEnabled) === 1,
    weeklySelfTestMode: row.weeklySelfTestMode || "passive",
    weeklySelfTestDay: Number(row.weeklySelfTestDay ?? 0),
    weeklySelfTestTime: row.weeklySelfTestTime || "10:00",
    updatedAt: row.updatedAt
  };
}

export async function getApplicationSettings(env) {
  const row = await getApplicationSettingsRow(env);
  return rowToPublic(row);
}

export function validateApplicationSettingsInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new NotificationError("INVALID_SETTINGS");
  }
  for (const key of Object.keys(input)) {
    if (!APP_FIELDS.has(key)) throw new NotificationError("UNKNOWN_SETTINGS_FIELD");
  }
  for (const key of APP_FIELDS) {
    if (!(key in input)) throw new NotificationError("INVALID_SETTINGS");
  }
  if (!isValidIanaTimeZone(input.scheduleTimezone)) {
    throw new NotificationError("INVALID_TIMEZONE");
  }
  if (!DISPLAY_MODES.has(input.displayTimezoneMode)) {
    throw new NotificationError("INVALID_DISPLAY_TIMEZONE_MODE");
  }
  let displayTimezone = input.displayTimezone === null || input.displayTimezone === ""
    ? null
    : String(input.displayTimezone).trim();
  if (input.displayTimezoneMode === "selected") {
    if (!displayTimezone || !isValidIanaTimeZone(displayTimezone)) {
      throw new NotificationError("INVALID_DISPLAY_TIMEZONE");
    }
  } else {
    displayTimezone = displayTimezone && isValidIanaTimeZone(displayTimezone) ? displayTimezone : null;
  }
  const timesResult = validateScheduleTimes(input.scheduleTimes);
  if (!timesResult.ok) throw new NotificationError(timesResult.code);
  if (typeof input.weeklySelfTestEnabled !== "boolean") {
    throw new NotificationError("INVALID_SETTINGS");
  }
  if (!SELF_TEST_MODES.has(input.weeklySelfTestMode)) {
    throw new NotificationError("INVALID_SELF_TEST_MODE");
  }
  const day = Number(input.weeklySelfTestDay);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new NotificationError("INVALID_SELF_TEST_DAY");
  }
  if (typeof input.weeklySelfTestTime !== "string" || !/^([01]\d|2[0-3]):00$/.test(input.weeklySelfTestTime)) {
    throw new NotificationError("INVALID_SELF_TEST_TIME");
  }
  return {
    scheduleTimezone: input.scheduleTimezone,
    displayTimezoneMode: input.displayTimezoneMode,
    displayTimezone,
    scheduleTimes: timesResult.times,
    weeklySelfTestEnabled: input.weeklySelfTestEnabled,
    weeklySelfTestMode: input.weeklySelfTestMode,
    weeklySelfTestDay: day,
    weeklySelfTestTime: input.weeklySelfTestTime
  };
}

export async function saveApplicationSettings(env, input, now = Date.now()) {
  const settings = validateApplicationSettingsInput(input);
  await upsertApplicationSettings(env, { ...settings, updatedAt: now });
  return settings;
}

/**
 * Quota estimate for forecast fetches.
 *
 * When `locations` is provided, sums each location's effective schedule length
 * (custom override or global default). Otherwise falls back to
 * globalRuns × activeLocations.
 */
export function estimateForecastQuota({
  scheduleTimes,
  activeLocations,
  locations = null,
  remainingCredits = null
} = {}) {
  const globalTimes = parseScheduleTimes(scheduleTimes);
  let locationCount;
  let perDay;
  if (Array.isArray(locations)) {
    const capped = locations.slice(0, 10);
    locationCount = capped.length;
    perDay = capped.reduce(
      (sum, loc) => sum + effectiveLocationScheduleTimes(loc, globalTimes).length,
      0
    );
  } else {
    locationCount = Math.max(0, Math.min(10, Number(activeLocations) || 0));
    perDay = globalTimes.length * locationCount;
  }
  const per30 = perDay * 30;
  let estimatedDaysRemaining = null;
  if (remainingCredits !== null && remainingCredits !== undefined && perDay > 0) {
    estimatedDaysRemaining = Math.floor(Number(remainingCredits) / perDay);
  }
  return {
    scheduledRunsPerDay: globalTimes.length,
    activeLocations: locationCount,
    estimatedRequestsPerDay: perDay,
    estimatedRequestsPer30Days: per30,
    remainingCredits: remainingCredits ?? null,
    estimatedDaysUntilExhaustion: estimatedDaysRemaining
  };
}
