/**
 * Shared schedule / display timezone helpers for Worker and tests.
 * Frontend may mirror resolveDisplayTimeZone / formatInstantWithZone via public/lib.
 */

import {
  DEFAULT_SCHEDULE_TIMEZONE,
  DEFAULT_SCHEDULE_TIMES,
  MAX_SCHEDULE_SLOTS
} from "./schema-manifest.js";

export { DEFAULT_SCHEDULE_TIMEZONE, DEFAULT_SCHEDULE_TIMES, MAX_SCHEDULE_SLOTS };

const WHOLE_HOUR = /^([01]\d|2[0-3]):00$/;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidIanaTimeZone(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseScheduleTimes(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [...DEFAULT_SCHEDULE_TIMES];
    }
  }
  if (!Array.isArray(list)) return [...DEFAULT_SCHEDULE_TIMES];
  const unique = [];
  for (const item of list) {
    if (typeof item !== "string" || !WHOLE_HOUR.test(item)) continue;
    if (!unique.includes(item)) unique.push(item);
  }
  unique.sort();
  if (unique.length === 0) return [...DEFAULT_SCHEDULE_TIMES];
  return unique.slice(0, MAX_SCHEDULE_SLOTS);
}

/**
 * @param {unknown} times
 * @returns {{ ok: true, times: string[] } | { ok: false, code: string }}
 */
export function validateScheduleTimes(times) {
  if (!Array.isArray(times) || times.length === 0) {
    return { ok: false, code: "SCHEDULE_TIMES_REQUIRED" };
  }
  if (times.length > MAX_SCHEDULE_SLOTS) {
    return { ok: false, code: "SCHEDULE_TIMES_TOO_MANY" };
  }
  const unique = new Set();
  for (const item of times) {
    if (typeof item !== "string" || !WHOLE_HOUR.test(item)) {
      return { ok: false, code: "SCHEDULE_TIMES_INVALID" };
    }
    if (unique.has(item)) return { ok: false, code: "SCHEDULE_TIMES_DUPLICATE" };
    unique.add(item);
  }
  return { ok: true, times: [...unique].sort() };
}

/**
 * Parse a location override schedule.
 * `null` / missing / blank means inherit the global application schedule.
 * @param {unknown} raw
 * @returns {string[]|null}
 */
export function parseOptionalLocationScheduleTimes(raw) {
  if (raw == null || raw === "") return null;
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  const validated = validateScheduleTimes(list);
  return validated.ok ? validated.times : null;
}

/**
 * Effective whole-hour slots for a location (custom override or global default).
 * @param {{ scheduleTimes?: unknown }|null|undefined} location
 * @param {unknown} globalScheduleTimes
 * @returns {string[]}
 */
export function effectiveLocationScheduleTimes(location, globalScheduleTimes) {
  const custom = parseOptionalLocationScheduleTimes(location?.scheduleTimes);
  if (custom) return custom;
  return parseScheduleTimes(globalScheduleTimes);
}

/**
 * Validate a location schedule PUT body value.
 * `null` clears the override (inherit global). Non-null must be a valid non-empty schedule.
 * @param {unknown} value
 * @returns {{ ok: true, times: string[]|null } | { ok: false, code: string }}
 */
export function validateLocationScheduleTimesInput(value) {
  if (value === null) return { ok: true, times: null };
  return validateScheduleTimes(value);
}

/**
 * Parts of `instant` in `timeZone` (hour 0–23, minute, YYYY-MM-DD calendar date).
 * @param {Date|number} instant
 * @param {string} timeZone
 */
export function getZonedParts(instant, timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 0,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`
  };
}

/**
 * @param {string} scheduleTimezone
 * @param {{ dateKey: string, hour: number }} parts
 */
export function buildOccurrenceKey(scheduleTimezone, parts) {
  const hh = String(parts.hour).padStart(2, "0");
  return `${scheduleTimezone}:${parts.dateKey}:${hh}:00`;
}

/**
 * Resolve which IANA zone to use when formatting times for display.
 * Application timezone (`scheduleTimezone`) is authoritative; legacy
 * displayTimezoneMode / displayTimezone fields are ignored.
 * @param {{ displayTimezoneMode?: string, displayTimezone?: string|null, scheduleTimezone?: string }} settings
 * @param {string|null|undefined} _deviceTimeZone unused compatibility arg
 */
export function resolveDisplayTimeZone(settings, _deviceTimeZone) {
  return settings?.scheduleTimezone && isValidIanaTimeZone(settings.scheduleTimezone)
    ? settings.scheduleTimezone
    : DEFAULT_SCHEDULE_TIMEZONE;
}

/**
 * Format an instant or ISO-ish string with a short timezone name suffix.
 * @param {string|number|Date|null|undefined} value
 * @param {string} timeZone
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatInstantWithZone(value, timeZone, options = {}) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIMEZONE;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...options
  });
  return formatter.format(date);
}

/**
 * Time-only with zone suffix (e.g. "8:12 PM EDT").
 */
export function formatTimeOnlyWithZone(value, timeZone) {
  return formatInstantWithZone(value, timeZone, {
    weekday: undefined,
    year: undefined,
    month: undefined,
    day: undefined,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

/**
 * Medium date and short time (e.g. "Oct 16, 2023, 8:12 PM").
 */
export function formatDateTimeMediumWithZone(value, timeZone) {
  return formatInstantWithZone(value, timeZone, {
    dateStyle: "medium",
    timeStyle: "short",
    hour: undefined,
    minute: undefined,
    timeZoneName: undefined
  });
}

export function defaultApplicationSettings(now = Date.now()) {
  return {
    scheduleTimezone: DEFAULT_SCHEDULE_TIMEZONE,
    displayTimezoneMode: "schedule",
    displayTimezone: null,
    scheduleTimes: [...DEFAULT_SCHEDULE_TIMES],
    weeklySelfTestEnabled: true,
    weeklySelfTestMode: "passive",
    weeklySelfTestDay: 0,
    weeklySelfTestTime: "10:00",
    scheduledReportsEnabled: false,
    scheduledReportTimes: [],
    scheduledReportChannels: [],
    updatedAt: now
  };
}

/**
 * Whether a forecast quality meets a threshold.
 * null thresholdPercent = Always (any finite quality or even missing still qualifies if enabled).
 * @param {number|null|undefined} qualityPercent 0–100
 * @param {number|null|undefined} thresholdPercent
 */
export function qualityMeetsThreshold(qualityPercent, thresholdPercent) {
  if (thresholdPercent === null || thresholdPercent === undefined) return true;
  if (qualityPercent === null || qualityPercent === undefined) return false;
  return Number(qualityPercent) >= Number(thresholdPercent);
}

/**
 * Evaluate sunrise/sunset independently; qualify when either meets threshold (eventScope either).
 * @returns {{ qualifies: boolean, triggeredEvents: string[] }}
 */
export function evaluateLocationForThreshold(locationResult, rule, qualityToPercentFn) {
  if (!rule || !rule.enabled) {
    return { qualifies: false, triggeredEvents: [] };
  }
  if (locationResult.error) {
    return { qualifies: false, triggeredEvents: [] };
  }
  const sunrisePct = locationResult.sunrise
    ? qualityToPercentFn(locationResult.sunrise.quality)
    : null;
  const sunsetPct = locationResult.sunset
    ? qualityToPercentFn(locationResult.sunset.quality)
    : null;
  const threshold = rule.thresholdPercent;
  const scope = rule.eventScope || "either";
  const triggeredEvents = [];
  const sunriseOk = qualityMeetsThreshold(sunrisePct, threshold);
  const sunsetOk = qualityMeetsThreshold(sunsetPct, threshold);
  if (scope === "sunrise" || scope === "either" || scope === "both") {
    if (sunriseOk && locationResult.sunrise) triggeredEvents.push("sunrise");
  }
  if (scope === "sunset" || scope === "either" || scope === "both") {
    if (sunsetOk && locationResult.sunset) triggeredEvents.push("sunset");
  }
  if (scope === "both") {
    const qualifies = sunriseOk && sunsetOk;
    return { qualifies, triggeredEvents: qualifies ? ["sunrise", "sunset"] : [] };
  }
  if (scope === "sunrise") {
    return { qualifies: sunriseOk && Boolean(locationResult.sunrise), triggeredEvents };
  }
  if (scope === "sunset") {
    return { qualifies: sunsetOk && Boolean(locationResult.sunset), triggeredEvents };
  }
  return { qualifies: triggeredEvents.length > 0, triggeredEvents };
}
