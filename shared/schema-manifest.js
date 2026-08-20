/** Tables that must exist in every Sunsethue D1 database. */
export const REQUIRED_D1_TABLES = Object.freeze([
  "locations",
  "runs",
  "application_settings",
  "location_notification_rules",
  "scheduled_occurrences",
  "notification_settings",
  "notification_outbox",
  "web_push_subscriptions",
  "notification_test_limiter",
  "report_execution_lock",
  "autocomplete_limiter",
  "provider_credential_status",
  "provider_credential_limiter",
  "health_check_runs",
  "admin_audit_events"
]);

/**
 * Additive columns that CREATE TABLE IF NOT EXISTS cannot guarantee.
 * Kept in sync with scripts/lib/apply-schema-alters.mjs.
 * Keys are table names; values are required column names.
 */
export const REQUIRED_D1_COLUMNS = Object.freeze({
  locations: Object.freeze(["scheduleTimes"]),
  application_settings: Object.freeze([
    "scheduledReportsEnabled",
    "scheduledReportTimes",
    "scheduledReportChannels"
  ]),
  notification_outbox: Object.freeze(["deliveryPurpose"])
});

/** Channels validated in application code (not a DB CHECK enum). */
export const NOTIFICATION_CHANNELS = Object.freeze([
  "email",
  "pushover",
  "webpush",
  "webhook"
]);

export const DEFAULT_SCHEDULE_TIMEZONE = "America/New_York";
export const DEFAULT_SCHEDULE_TIMES = Object.freeze(["06:00", "12:00", "18:00"]);
export const DEFAULT_NEW_LOCATION_THRESHOLD = 50;
export const MAX_SCHEDULE_SLOTS = 8;
