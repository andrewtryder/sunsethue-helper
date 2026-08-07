import { formatTimeOnlyWithZone } from "../../shared/time-format.js";
import { qualityToPercent } from "../helpers.js";
import { collapseWhitespace, truncateUtf8, utf8Length } from "../validation.js";

const ALLOWED_TRIGGER_TYPES = new Set(["AM", "PM", "NOON", "Manual Test", "TEST", "WEEKLY_SELF_TEST"]);

function isAllowedTriggerType(value) {
  if (ALLOWED_TRIGGER_TYPES.has(value)) return true;
  return typeof value === "string" && /^SCHEDULED:\d{2}:00$/.test(value);
}
const ALLOWED_ERROR_CODES = new Set(["FORECAST_UNAVAILABLE"]);
const MAX_LOCATIONS = 10;

// Names are user-supplied and length-capped by the API, but a legacy row could
// carry a longer value; keep the stored-payload bound generous.
const MAX_LOCATION_NAME_BYTES = 512;

// Pushover documented limits.
const PUSHOVER_TITLE_MAX = 250;
const PUSHOVER_MESSAGE_MAX = 1024;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value) {
  return value === null || isFiniteNumber(value);
}

function normalizeLocationName(value) {
  if (typeof value !== "string") return "";
  return truncateUtf8(collapseWhitespace(value), MAX_LOCATION_NAME_BYTES);
}

export function buildNotificationPayload(model) {
  return {
    version: 1,
    triggerType: model.triggerType,
    generatedAt: model.generatedAt,
    displayTimezone: model.displayTimezone || null,
    dashboardUrl: model.dashboardUrl || null,
    locations: model.results.map((result) => ({
      id: result.locationId || result.id || null,
      name: normalizeLocationName(result.name),
      triggeredEvents: Array.isArray(result.triggeredEvents) ? result.triggeredEvents.filter((e) => e === "sunrise" || e === "sunset") : [],
      sunrise: result.sunrise ? {
        time: result.sunrise.time || null,
        quality: result.sunrise.quality ?? null,
        text: result.sunrise.quality_text || result.sunrise.text || null
      } : null,
      sunset: result.sunset ? {
        time: result.sunset.time || null,
        quality: result.sunset.quality ?? null,
        text: result.sunset.quality_text || result.sunset.text || null
      } : null,
      errorCode: result.error ? "FORECAST_UNAVAILABLE" : null
    }))
  };
}

function invalid() {
  throw new Error("INVALID_NOTIFICATION_PAYLOAD");
}

function validateEvent(event) {
  if (event === null) return null;
  if (!event || typeof event !== "object" || Array.isArray(event)) invalid();
  const time = event.time ?? null;
  if (time !== null && (typeof time !== "string" || time.length === 0 || time.length > 64)) invalid();
  if (!isNullableFiniteNumber(event.quality)) invalid();
  const text = event.text ?? null;
  if (text !== null && (typeof text !== "string" || text.length > 128)) invalid();
  return { time, quality: event.quality ?? null, text };
}

function validateDashboardUrl(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") invalid();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") invalid();
    return url.toString();
  } catch {
    invalid();
    return null;
  }
}

function validateLocation(location) {
  if (!location || typeof location !== "object" || Array.isArray(location)) invalid();
  const rawName = typeof location.name === "string" ? location.name : "";
  const name = truncateUtf8(collapseWhitespace(rawName), MAX_LOCATION_NAME_BYTES);
  if (name.length === 0) invalid();
  const errorCode = location.errorCode ?? null;
  if (errorCode !== null && !ALLOWED_ERROR_CODES.has(errorCode)) invalid();
  return {
    name,
    id: typeof location.id === "string" ? location.id : null,
    triggeredEvents: Array.isArray(location.triggeredEvents)
      ? location.triggeredEvents.filter((e) => e === "sunrise" || e === "sunset")
      : [],
    sunrise: validateEvent(location.sunrise ?? null),
    sunset: validateEvent(location.sunset ?? null),
    errorCode
  };
}

export function parseNotificationPayload(payload) {
  let parsed;
  try { parsed = JSON.parse(payload); } catch { invalid(); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid();
  if (parsed.version !== 1) invalid();
  if (typeof parsed.triggerType !== "string" || !isAllowedTriggerType(parsed.triggerType)) invalid();
  if (!isFiniteNumber(parsed.generatedAt)) invalid();
  const displayTimezone = typeof parsed.displayTimezone === "string" ? parsed.displayTimezone : null;
  const dashboardUrl = validateDashboardUrl(parsed.dashboardUrl ?? null);
  if (!Array.isArray(parsed.locations)) invalid();
  if (parsed.locations.length > MAX_LOCATIONS) invalid();
  const locations = parsed.locations.map(validateLocation);
  return {
    version: 1,
    triggerType: parsed.triggerType,
    generatedAt: parsed.generatedAt,
    displayTimezone,
    dashboardUrl,
    locations
  };
}

function formatPushQuality(event) {
  const percent = qualityToPercent(event?.quality);
  if (percent === null) {
    return "quality N/A";
  }
  const text = collapseWhitespace(event?.text || "");
  if (!text || text === `${percent}%` || text === String(percent)) {
    return `${percent}%`;
  }
  return `${percent}% ${text}`;
}

export function buildPushoverContent(payload) {
  const rawTitle = `Sunsethue ${payload.triggerType} forecast`;
  const title = truncateUtf8(rawTitle, PUSHOVER_TITLE_MAX);
  
  const displayTimezone = payload.displayTimezone || "America/New_York";
  const lines = [];

  for (const location of payload.locations.slice(0, MAX_LOCATIONS)) {
    const safeName = collapseWhitespace(location.name);
    if (location.errorCode) {
      const line = `${safeName}: forecast unavailable`;
      if (utf8Length([...lines, line].join("\n")) <= PUSHOVER_MESSAGE_MAX) {
        lines.push(line);
      } else {
        break;
      }
      continue;
    }

    const sunrisePrefix = location.triggeredEvents?.includes("sunrise") ? "★ ↑" : "↑";
    const sunrise = location.sunrise?.time
      ? `${sunrisePrefix} ${formatTimeOnlyWithZone(location.sunrise.time, displayTimezone)} · ${formatPushQuality(location.sunrise)}`
      : `${sunrisePrefix} N/A`;

    const sunsetPrefix = location.triggeredEvents?.includes("sunset") ? "★ ↓" : "↓";
    const sunset = location.sunset?.time
      ? `${sunsetPrefix} ${formatTimeOnlyWithZone(location.sunset.time, displayTimezone)} · ${formatPushQuality(location.sunset)}`
      : `${sunsetPrefix} N/A`;

    const line = `${safeName}: ${sunrise} | ${sunset}`;
    
    if (utf8Length([...lines, line].join("\n")) <= PUSHOVER_MESSAGE_MAX) {
      lines.push(line);
      continue;
    }

    const remaining = payload.locations.length - lines.length;
    const footer = `…and ${remaining} more. Open Sunsethue Helper for details.`;
    if (utf8Length([...lines, footer].join("\n")) <= PUSHOVER_MESSAGE_MAX) {
      lines.push(footer);
    }
    break;
  }

  const joined = lines.join("\n");
  const message = truncateUtf8(joined || "Forecast report generated.", PUSHOVER_MESSAGE_MAX);
  return { title, message };
}
