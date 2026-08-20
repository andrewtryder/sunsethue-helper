const DEFAULT_SCHEDULE_TIMEZONE = "America/New_York";

const FALLBACK_IANA_TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Prague",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Bucharest",
  "Europe/Kyiv",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland"
];

const US_PRIORITY = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu"
];

const EUROPE_PRIORITY = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Prague",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Bucharest",
  "Europe/Kyiv"
];

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
 * Current UTC offset label for an IANA zone, e.g. "UTC−04:00".
 * @param {string} timeZone
 * @param {Date|number|string} [at=Date.now()]
 * @returns {string|null}
 */
export function formatUtcOffsetLabel(timeZone, at = Date.now()) {
  if (!isValidIanaTimeZone(timeZone)) return null;
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset"
    }).formatToParts(date);
    const raw = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
    let normalized = raw.replace(/^GMT/, "UTC");
    if (normalized === "UTC" || normalized === "UTC+0" || normalized === "UTC-0") {
      normalized = "UTC+00:00";
    }
    normalized = normalized.replace(/UTC([+-])(\d)(?=:)/, (_, sign, hour) => `UTC${sign}0${hour}`);
    normalized = normalized.replace(/UTC([+-])(\d)$/, (_, sign, hour) => `UTC${sign}0${hour}:00`);
    normalized = normalized.replace(/UTC([+-])(\d{2})$/, (_, sign, hour) => `UTC${sign}${hour}:00`);
    return normalized.replace(/-/g, "−");
  } catch {
    return null;
  }
}

/**
 * @returns {string[]}
 */
export function listSupportedIanaTimeZones() {
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      return Intl.supportedValuesOf("timeZone").filter((tz) => isValidIanaTimeZone(tz));
    } catch {
      /* fall through */
    }
  }
  return FALLBACK_IANA_TIME_ZONES.filter((tz) => isValidIanaTimeZone(tz));
}

/**
 * Build optgroup HTML for the timezone select.
 * @param {string} [selectedValue]
 * @param {Date|number} [at]
 * @returns {string}
 */
export function buildTimezoneSelectHtml(selectedValue = DEFAULT_SCHEDULE_TIMEZONE, at = Date.now()) {
  const supported = new Set(listSupportedIanaTimeZones());
  if (selectedValue && isValidIanaTimeZone(selectedValue)) {
    supported.add(selectedValue);
  }
  const remaining = new Set(supported);

  function optionHtml(tz) {
    remaining.delete(tz);
    const offset = formatUtcOffsetLabel(tz, at) || "UTC+00:00";
    const selected = tz === selectedValue ? " selected" : "";
    return `<option value="${tz}"${selected}>${tz} (${offset})</option>`;
  }

  function pickOrdered(priority) {
    return priority.filter((tz) => supported.has(tz)).map(optionHtml).join("");
  }

  const us = pickOrdered(US_PRIORITY);
  const europePriority = pickOrdered(EUROPE_PRIORITY);
  const otherEurope = [...remaining]
    .filter((tz) => tz.startsWith("Europe/"))
    .sort((a, b) => a.localeCompare(b))
    .map(optionHtml)
    .join("");
  const other = [...remaining]
    .sort((a, b) => a.localeCompare(b))
    .map(optionHtml)
    .join("");

  return [
    us ? `<optgroup label="United States">${us}</optgroup>` : "",
    (europePriority || otherEurope) ? `<optgroup label="Europe">${europePriority}${otherEurope}</optgroup>` : "",
    other ? `<optgroup label="Other time zones">${other}</optgroup>` : ""
  ].join("");
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

export { DEFAULT_SCHEDULE_TIMEZONE };
