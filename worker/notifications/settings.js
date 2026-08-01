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

/**
 * Deprecated synchronous readiness checks. The main Worker requires provider
 * credentials to live in Secrets Store, so a plain `env` object can never
 * confirm production readiness without an async Secrets Store lookup.
 *
 * These helpers now always return `false`. Use `hasEmailTransportAsync` and
 * `hasPushoverTransportAsync` (below) for authoritative provider readiness.
 * They remain exported only so downstream callers get a predictable, safe
 * default instead of a stale legacy heuristic.
 */
export function hasEmailTransport() {
  return false;
}

export function hasPushoverTransport() {
  return false;
}

export { hasEmailTransportAsync, hasPushoverTransportAsync };

export function validateEmailAddress(value) {
  return typeof value === "string" && !/[\r\n]/.test(value) && EMAIL_RE.test(value.trim());
}

/**
 * Ship-safe defaults: notification channels start disabled and the recipient
 * mailbox is empty. The owner enables a channel through the Notifications UI
 * after configuring the provider credentials in Secrets Store.
 */
export function getDefaultSettings() {
  return {
    emailEnabled: 0,
    emailTo: null,
    pushoverEnabled: 0,
    pushoverDevice: null,
    pushoverPriority: 0,
    pushoverSound: null
  };
}

export async function getSettings(env) {
  const row = await db.getNotificationSettingsRow(env);
  return row || getDefaultSettings();
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
