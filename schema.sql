-- Local and production D1 schema.
-- Safe to re-run: all statements use IF NOT EXISTS.
-- Apply locally with: npm run db:schema:local

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

-- Notification configuration and delivery intent. Provider credentials remain
-- Worker secrets and are intentionally never stored in D1.
CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  emailEnabled INTEGER NOT NULL DEFAULT 1 CHECK (emailEnabled IN (0, 1)),
  emailTo TEXT,
  pushoverEnabled INTEGER NOT NULL DEFAULT 0 CHECK (pushoverEnabled IN (0, 1)),
  pushoverDevice TEXT,
  pushoverPriority INTEGER NOT NULL DEFAULT 0 CHECK (pushoverPriority BETWEEN -2 AND 1),
  pushoverSound TEXT,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  runId TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'pushover')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttemptAt INTEGER NOT NULL,
  lockedUntil INTEGER,
  providerMessageId TEXT,
  lastErrorCode TEXT,
  createdAt INTEGER NOT NULL,
  sentAt INTEGER,
  FOREIGN KEY (runId) REFERENCES runs(id)
);

-- A single durable limiter prevents the protected test endpoint from becoming a
-- provider-call amplifier without tracking an Access identity or client address.
CREATE TABLE IF NOT EXISTS notification_test_limiter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lastRequestedAt INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_run_channel
  ON notification_outbox (runId, channel);
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON notification_outbox (status, nextAttemptAt);
