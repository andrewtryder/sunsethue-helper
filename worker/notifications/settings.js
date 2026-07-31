import * as db from "../db.js";
import { NotificationError } from "./errors.js";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SAFE_OPTION_RE = /^[A-Za-z0-9 _.-]{1,64}$/;
const SETTINGS_FIELDS = new Set([
  "emailEnabled", "emailTo", "pushoverEnabled", "pushoverDevice", "pushoverPriority", "pushoverSound"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : value;
}

export function hasEmailTransport(env) {
  return Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD && (env.EMAIL_FROM || env.GMAIL_USER));
}

export function hasPushoverTransport(env) {
  return Boolean(env.PUSHOVER_APP_TOKEN && env.PUSHOVER_USER_KEY);
}

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

export function publicSettings(settings, env) {
  return {
    emailEnabled: Boolean(settings.emailEnabled),
    emailTo: settings.emailTo || null,
    pushoverEnabled: Boolean(settings.pushoverEnabled),
    pushoverDevice: settings.pushoverDevice || null,
    pushoverPriority: settings.pushoverPriority,
    pushoverSound: settings.pushoverSound || null,
    emailConfigured: hasEmailTransport(env),
    pushoverConfigured: hasPushoverTransport(env)
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
  await db.upsertNotificationSettings(env, { ...settings, updatedAt: now });
  return settings;
}
