-- Migration number: 0002 	 2026-07-30T00:00:01.000Z
-- Backward-compatible indexes for the two ordered reads the Worker performs:
--   SELECT * FROM locations ORDER BY createdAt ASC
--   SELECT * FROM runs ORDER BY timestamp DESC LIMIT 20
-- Adding indexes only; the currently deployed Worker keeps working unchanged.

CREATE INDEX IF NOT EXISTS idx_locations_createdAt ON locations (createdAt ASC);
CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs (timestamp DESC);
