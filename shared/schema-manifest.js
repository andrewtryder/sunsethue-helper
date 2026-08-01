/** Tables that must exist in every Sunsethue D1 database. */
export const REQUIRED_D1_TABLES = Object.freeze([
  "locations",
  "runs",
  "notification_settings",
  "notification_outbox",
  "notification_test_limiter",
  "report_execution_lock",
  "autocomplete_limiter",
  "provider_credential_status",
  "provider_credential_limiter"
]);
