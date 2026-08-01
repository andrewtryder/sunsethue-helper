-- Local and production D1 schema.
-- Safe to re-run for new installs: all statements use IF NOT EXISTS.
-- Existing production databases that predate R1/R2 must use the reviewed
-- upgrade scripts (scripts/db-upgrade-r1.mjs, scripts/db-upgrade-r2-outbox.mjs)
-- instead of relying on IF NOT EXISTS alone — SQLite cannot alter CHECK
-- constraints or add columns via this bootstrap file.
-- Apply locally with: npm run db:schema:local
-- Apply to production D1 with: npm run db:schema:remote
--   (creates missing tables/indexes; never mutates existing rows).

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  latestSunriseTime TEXT,
  latestSunriseQuality REAL,
  latestSunriseText TEXT,
  latestSunsetTime TEXT,
  latestSunsetQuality REAL,
  latestSunsetText TEXT,
  lastForecastUpdate INTEGER,
  forecastError TEXT,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  triggerType TEXT NOT NULL,
  status TEXT NOT NULL,
  locationsCount INTEGER NOT NULL,
  results TEXT NOT NULL, -- JSON string representation of locations run status
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_locations_createdAt ON locations (createdAt ASC);
CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs (timestamp DESC);

-- Application-wide schedule and display preferences (singleton).
CREATE TABLE IF NOT EXISTS application_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  scheduleTimezone TEXT NOT NULL DEFAULT 'America/New_York',
  displayTimezoneMode TEXT NOT NULL DEFAULT 'schedule'
    CHECK (displayTimezoneMode IN ('schedule', 'device', 'selected')),
  displayTimezone TEXT,
  scheduleTimes TEXT NOT NULL DEFAULT '["06:00","12:00","18:00"]',
  weeklySelfTestEnabled INTEGER NOT NULL DEFAULT 1 CHECK (weeklySelfTestEnabled IN (0, 1)),
  weeklySelfTestMode TEXT NOT NULL DEFAULT 'passive'
    CHECK (weeklySelfTestMode IN ('passive', 'active')),
  weeklySelfTestDay INTEGER NOT NULL DEFAULT 0 CHECK (weeklySelfTestDay BETWEEN 0 AND 6),
  weeklySelfTestTime TEXT NOT NULL DEFAULT '10:00',
  updatedAt INTEGER NOT NULL
);

-- Per-location, per-channel notification thresholds.
CREATE TABLE IF NOT EXISTS location_notification_rules (
  locationId TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  thresholdPercent INTEGER CHECK (thresholdPercent IS NULL OR (thresholdPercent BETWEEN 0 AND 100)),
  eventScope TEXT NOT NULL DEFAULT 'either'
    CHECK (eventScope IN ('either', 'sunrise', 'sunset', 'both')),
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (locationId, channel),
  FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_location_rules_channel
  ON location_notification_rules (channel, enabled);

-- Deterministic scheduled-report occurrence keys (dedupe).
CREATE TABLE IF NOT EXISTS scheduled_occurrences (
  occurrenceKey TEXT PRIMARY KEY,
  startedAt INTEGER NOT NULL,
  runId TEXT
);

-- Notification configuration and delivery intent. Provider credentials remain
-- in Secrets Store and are intentionally never stored in D1.
CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  emailEnabled INTEGER NOT NULL DEFAULT 1 CHECK (emailEnabled IN (0, 1)),
  emailTo TEXT,
  pushoverEnabled INTEGER NOT NULL DEFAULT 0 CHECK (pushoverEnabled IN (0, 1)),
  pushoverDevice TEXT,
  pushoverPriority INTEGER NOT NULL DEFAULT 0 CHECK (pushoverPriority BETWEEN -2 AND 1),
  pushoverSound TEXT,
  webhookEnabled INTEGER NOT NULL DEFAULT 0 CHECK (webhookEnabled IN (0, 1)),
  webhookMaskedHostname TEXT,
  webhookLastSuccessAt INTEGER,
  webhookLastFailureCode TEXT,
  updatedAt INTEGER NOT NULL
);

-- Channel is validated in application code (email, pushover, webpush, webhook).
-- deliveryTargetId distinguishes per-device webpush jobs (NULL for email/pushover/webhook MVP).
CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  runId TEXT NOT NULL,
  channel TEXT NOT NULL,
  deliveryTargetId TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttemptAt INTEGER NOT NULL,
  lockedUntil INTEGER,
  leaseToken TEXT,
  providerMessageId TEXT,
  lastErrorCode TEXT,
  createdAt INTEGER NOT NULL,
  sentAt INTEGER,
  deliveryEmailTo TEXT,
  deliveryPushoverDevice TEXT,
  deliveryPushoverPriority INTEGER,
  deliveryPushoverSound TEXT,
  manualAttempts INTEGER NOT NULL DEFAULT 0,
  lastManualRetryAt INTEGER,
  FOREIGN KEY (runId) REFERENCES runs(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_run_channel_target
  ON notification_outbox (runId, channel, ifnull(deliveryTargetId, ''));
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON notification_outbox (status, nextAttemptAt);

-- Browser Web Push subscriptions (endpoint/keys are private application data).
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  deviceName TEXT NOT NULL,
  userAgentSummary TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  createdAt INTEGER NOT NULL,
  lastSeenAt INTEGER,
  lastSuccessAt INTEGER,
  lastFailureCode TEXT
);

CREATE INDEX IF NOT EXISTS idx_web_push_enabled ON web_push_subscriptions (enabled);

-- A single durable limiter prevents the protected test endpoint from becoming a
-- provider-call amplifier without tracking an Access identity or client address.
CREATE TABLE IF NOT EXISTS notification_test_limiter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lastRequestedAt INTEGER NOT NULL
);

-- A single-row limiter for the address-autocomplete proxy. Rate limiting
-- protects Photon (Komoot) from unauthenticated amplification through our
-- Access-authenticated endpoint.
CREATE TABLE IF NOT EXISTS autocomplete_limiter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lastRequestedAt INTEGER NOT NULL
);

-- Cross-instance serialization for the report pipeline. A cron trigger and a
-- concurrent manual trigger must never both call generateReport().
CREATE TABLE IF NOT EXISTS report_execution_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  leaseToken TEXT,
  lockedUntil INTEGER NOT NULL,
  lastStartedAt INTEGER
);

-- Provider credential metadata only. Never store Gmail app passwords, Pushover
-- tokens, ciphertext, or Cloudflare management tokens in D1.
CREATE TABLE IF NOT EXISTS provider_credential_status (
  provider TEXT PRIMARY KEY
    CHECK (provider IN ('email', 'pushover', 'webhook', 'webpush')),
  configured INTEGER NOT NULL DEFAULT 0
    CHECK (configured IN (0, 1)),
  maskedIdentifier TEXT,
  updatedAt INTEGER,
  lastValidatedAt INTEGER,
  lastValidationCode TEXT,
  lastUpdatedBy TEXT
);

-- Rate limit credential mutation endpoints without storing Access identities.
CREATE TABLE IF NOT EXISTS provider_credential_limiter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lastRequestedAt INTEGER NOT NULL
);
