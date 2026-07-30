-- Migration number: 0001 	 2026-07-30T00:00:00.000Z
-- Baseline schema. Written with IF NOT EXISTS so it is safe to apply to the
-- already-provisioned production database, where these tables were created by
-- the pre-migrations schema.sql.

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
