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
import { NOTIFICATION_CHANNELS } from "../../shared/schema-manifest.js";

const DISPLAY_MODES = new Set(["schedule", "device", "selected"]);
const SELF_TEST_MODES = new Set(["passive", "active"]);
const SCHEDULED_REPORT_CHANNELS = new Set(NOTIFICATION_CHANNELS);

const CORE_FIELDS = new Set([
  "scheduleTimezone",
  "displayTimezoneMode",
  "displayTimezone",
  "scheduleTimes",
  "weeklySelfTestEnabled",
  "weeklySelfTestMode",
  "weeklySelfTestDay",
  "weeklySelfTestTime"
]);

const SCHEDULED_REPORT_FIELDS = new Set([
  "scheduledReportsEnabled",
  "scheduledReportTimes",
  "scheduledReportChannels"
]);

const APP_FIELDS = new Set([...CORE_FIELDS, ...SCHEDULED_REPORT_FIELDS]);

function parseJsonStringArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [...fallback];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [...fallback];
  } catch {
    return [...fallback];
  }
}

function validateScheduledReportChannels(channels) {
  if (!Array.isArray(channels)) {
    throw new NotificationError("INVALID_SCHEDULED_REPORT_CHANNEL");
  }
  const normalized = [];
  const seen = new Set();
  for (const channel of channels) {
    if (typeof channel !== "string" || !SCHEDULED_REPORT_CHANNELS.has(channel)) {
      throw new NotificationError("INVALID_SCHEDULED_REPORT_CHANNEL");
    }
    if (seen.has(channel)) continue;
    seen.add(channel);
    normalized.push(channel);
  }
  return normalized;
}

function validateScheduledReportTimes(times, scheduleTimes) {
  if (!Array.isArray(times)) {
    throw new NotificationError("INVALID_SCHEDULED_REPORT_TIME");
  }
  if (times.length === 0) return [];
  const timesResult = validateScheduleTimes(times);
  if (!timesResult.ok) throw new NotificationError(timesResult.code);
  const allowed = new Set(scheduleTimes);
  for (const slot of timesResult.times) {
    if (!allowed.has(slot)) {
      throw new NotificationError("INVALID_SCHEDULED_REPORT_TIME");
    }
  }
  return timesResult.times;
}

function parseStoredScheduleSlots(value) {
  const raw = parseJsonStringArray(value, []);
  if (raw.length === 0) return [];
  const parsed = validateScheduleTimes(raw);
  return parsed.ok ? parsed.times : [];
}

function parseStoredChannels(value) {
  try {
    return validateScheduledReportChannels(parseJsonStringArray(value, []));
  } catch {
    return [];
  }
}

function rowToPublic(row) {
  const defaults = defaultApplicationSettings(row?.updatedAt || Date.now());
  if (!row) {
    return {
      ...defaults,
      scheduleTimes: [...defaults.scheduleTimes],
      weeklySelfTestEnabled: true,
      scheduledReportsEnabled: false,
      scheduledReportTimes: [],
      scheduledReportChannels: []
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
    scheduledReportsEnabled: Number(row.scheduledReportsEnabled) === 1,
    scheduledReportTimes: parseStoredScheduleSlots(row.scheduledReportTimes),
    scheduledReportChannels: parseStoredChannels(row.scheduledReportChannels),
    updatedAt: row.updatedAt
  };
}

export async function getApplicationSettings(env) {
  const row = await getApplicationSettingsRow(env);
  return rowToPublic(row);
}

/**
 * @param {object} input
 * @param {{ existing?: object|null }} [opts]
 */
export function validateApplicationSettingsInput(input, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new NotificationError("INVALID_SETTINGS");
  }
  for (const key of Object.keys(input)) {
    if (!APP_FIELDS.has(key)) throw new NotificationError("UNKNOWN_SETTINGS_FIELD");
  }
  for (const key of CORE_FIELDS) {
    if (!(key in input)) throw new NotificationError("INVALID_SETTINGS");
  }

  const existing = opts.existing || null;
  const scheduledReportsEnabled = SCHEDULED_REPORT_FIELDS.has("scheduledReportsEnabled") && "scheduledReportsEnabled" in input
    ? input.scheduledReportsEnabled
    : existing?.scheduledReportsEnabled ?? false;
  const scheduledReportTimesInput = "scheduledReportTimes" in input
    ? input.scheduledReportTimes
    : existing?.scheduledReportTimes ?? [];
  const scheduledReportChannelsInput = "scheduledReportChannels" in input
    ? input.scheduledReportChannels
    : existing?.scheduledReportChannels ?? [];

  if (typeof scheduledReportsEnabled !== "boolean") {
    throw new NotificationError("INVALID_SETTINGS");
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

  let scheduledReportTimes;
  try {
    if ("scheduledReportTimes" in input) {
      scheduledReportTimes = validateScheduledReportTimes(scheduledReportTimesInput, timesResult.times);
    } else {
      // When forecast-check times shrink, drop orphaned scheduled-report slots
      // rather than rejecting a core-settings save that omitted the new fields.
      const allowed = new Set(timesResult.times);
      const inherited = Array.isArray(scheduledReportTimesInput) ? scheduledReportTimesInput : [];
      scheduledReportTimes = inherited.filter((slot) => allowed.has(slot));
    }
  } catch (error) {
    if (error instanceof NotificationError) throw error;
    throw new NotificationError("INVALID_SCHEDULED_REPORT_TIME");
  }
  const scheduledReportChannels = validateScheduledReportChannels(scheduledReportChannelsInput);

  if (scheduledReportsEnabled) {
    if (scheduledReportTimes.length === 0 || scheduledReportChannels.length === 0) {
      throw new NotificationError("INVALID_SCHEDULED_REPORT_CONFIGURATION");
    }
  }

  return {
    scheduleTimezone: input.scheduleTimezone,
    displayTimezoneMode: input.displayTimezoneMode,
    displayTimezone,
    scheduleTimes: timesResult.times,
    weeklySelfTestEnabled: input.weeklySelfTestEnabled,
    weeklySelfTestMode: input.weeklySelfTestMode,
    weeklySelfTestDay: day,
    weeklySelfTestTime: input.weeklySelfTestTime,
    scheduledReportsEnabled,
    scheduledReportTimes,
    scheduledReportChannels
  };
}

export async function saveApplicationSettings(env, input, now = Date.now()) {
  const existing = await getApplicationSettings(env);
  const settings = validateApplicationSettingsInput(input, { existing });
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

export {
  APP_FIELDS,
  CORE_FIELDS,
  SCHEDULED_REPORT_FIELDS,
  parseJsonStringArray,
  validateScheduledReportChannels,
  validateScheduledReportTimes
};
