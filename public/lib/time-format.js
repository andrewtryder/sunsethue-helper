const DEFAULT_SCHEDULE_TIMEZONE = "America/New_York";

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
 * Resolve which IANA zone to use when formatting times for display.
 * @param {{ displayTimezoneMode?: string, displayTimezone?: string|null, scheduleTimezone?: string }} settings
 * @param {string|null|undefined} deviceTimeZone
 */
export function resolveDisplayTimeZone(settings, deviceTimeZone) {
  const scheduleTz = settings?.scheduleTimezone && isValidIanaTimeZone(settings.scheduleTimezone)
    ? settings.scheduleTimezone
    : DEFAULT_SCHEDULE_TIMEZONE;
  const mode = settings?.displayTimezoneMode || "schedule";
  if (mode === "device" && deviceTimeZone && isValidIanaTimeZone(deviceTimeZone)) {
    return deviceTimeZone;
  }
  if (mode === "selected" && settings?.displayTimezone && isValidIanaTimeZone(settings.displayTimezone)) {
    return settings.displayTimezone;
  }
  return scheduleTz;
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
export function formatTimeWithZone(value, timeZone) {
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
 * Date-only (e.g. "Mon, Oct 16").
 */
export function formatDateWithZone(value, timeZone) {
  return formatInstantWithZone(value, timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: undefined,
    minute: undefined,
    timeZoneName: undefined
  });
}

/**
 * Medium date and short time (e.g. "Oct 16, 2023, 8:12 PM EDT").
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

/**
 * Short time (e.g. "8:12 PM"). No zone suffix.
 */
export function formatTimeShortWithZone(value, timeZone) {
  return formatInstantWithZone(value, timeZone, {
    timeStyle: "short",
    hour: undefined,
    minute: undefined,
    timeZoneName: undefined
  });
}
