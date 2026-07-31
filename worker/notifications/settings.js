import * as db from "../db.js";
import { NotificationError } from "./errors.js";
import { hasEmailTransportAsync } from "./resolve-email-transport.js";
import { hasPushoverTransportAsync } from "./resolve-pushover-transport.js";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SAFE_OPTION_RE = /^[A-Za-z0-9 _.-]{1,64}$/;
const SETTINGS_FIELDS = new Set([
  "emailEnabled", "emailTo", "pushoverEnabled", "pushoverDevice", "pushoverPriority", "pushoverSound"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : value;
}

/** Synchronous legacy check used by defaults / tests with plain env objects. */
export function hasEmailTransport(env) {
  return Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD && (env.EMAIL_FROM || env.GMAIL_USER));
}

/** Synchronous legacy check used by defaults / tests with plain env objects. */
export function hasPushoverTransport(env) {
  return Boolean(env.PUSHOVER_APP_TOKEN && env.PUSHOVER_USER_KEY);
}

export { hasEmailTransportAsync, hasPushoverTransportAsync };

export function validateEmailAddress(value) {
  return typeof value === "string" && !/[\r\n]/.test(value) && EMAIL_RE.test(value.trim());
}

export function getDefaultSettings(env) {
  return {
    emailEnabled: hasEmailTransport(env) && validateEmailAddress(env.EMAIL_TO) ? 1 : 0,
    emailTo: validateEmailAddress(env.EMAIL_TO) ? env.EMAIL_TO.trim() : null,
    pushoverEnabled: 0,
    pushoverDevice: null,
    pushoverPriority: 0,
    pushoverSound: null
  };
}

export async function getSettings(env) {
  const row = await db.getNotificationSettingsRow(env);
  return row || getDefaultSettings(env);
}

export async function publicSettings(settings, env) {
  const emailConfigured = await hasEmailTransportAsync(env);
  const pushoverConfigured = await hasPushoverTransportAsync(env);
  return {
    emailEnabled: Boolean(settings.emailEnabled),
    emailTo: settings.emailTo || null,
    pushoverEnabled: Boolean(settings.pushoverEnabled),
    pushoverDevice: settings.pushoverDevice || null,
    pushoverPriority: settings.pushoverPriority,
    pushoverSound: settings.pushoverSound || null,
    emailConfigured,
    pushoverConfigured
  };
}

export function validateSettingsInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new NotificationError("INVALID_SETTINGS");
  }
  for (const key of Object.keys(input)) {
    if (!SETTINGS_FIELDS.has(key)) throw new NotificationError("UNKNOWN_SETTINGS_FIELD");
  }
  const required = [...SETTINGS_FIELDS];
  if (required.some((key) => !(key in input))) throw new NotificationError("INVALID_SETTINGS");
  if (typeof input.emailEnabled !== "boolean" || typeof input.pushoverEnabled !== "boolean") {
    throw new NotificationError("INVALID_SETTINGS");
  }
  const emailTo = input.emailTo === null || input.emailTo === "" ? null : text(input.emailTo);
  if (input.emailEnabled && !validateEmailAddress(emailTo)) throw new NotificationError("INVALID_EMAIL_ADDRESS");
  if (emailTo !== null && !validateEmailAddress(emailTo)) throw new NotificationError("INVALID_EMAIL_ADDRESS");
  const device = input.pushoverDevice === null || input.pushoverDevice === "" ? null : text(input.pushoverDevice);
  const sound = input.pushoverSound === null || input.pushoverSound === "" ? null : text(input.pushoverSound);
  if ((device && (!SAFE_OPTION_RE.test(device) || device.length > 64)) || (sound && (!SAFE_OPTION_RE.test(sound) || sound.length > 64))) {
    throw new NotificationError("INVALID_PUSHOVER_OPTION");
  }
  if (![-2, -1, 0, 1].includes(input.pushoverPriority)) throw new NotificationError("INVALID_PUSHOVER_PRIORITY");
  return {
    emailEnabled: Number(input.emailEnabled), emailTo,
    pushoverEnabled: Number(input.pushoverEnabled), pushoverDevice: device,
    pushoverPriority: input.pushoverPriority, pushoverSound: sound
  };
}

export async function saveSettings(env, input, now = Date.now()) {
  const settings = validateSettingsInput(input);
  // Fail closed when the owner tries to enable a channel whose transport
  // credentials are not configured. Prevents saving an "enabled" setting that
  // would otherwise silently drop every future notification.
  if (settings.emailEnabled && !(await hasEmailTransportAsync(env))) {
    throw new NotificationError("PROVIDER_NOT_CONFIGURED");
  }
  if (settings.pushoverEnabled && !(await hasPushoverTransportAsync(env))) {
    throw new NotificationError("PROVIDER_NOT_CONFIGURED");
  }
  await db.upsertNotificationSettings(env, { ...settings, updatedAt: now });
  return settings;
}
