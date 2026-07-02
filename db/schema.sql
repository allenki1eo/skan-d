-- Bale Track Auto — Turso / libSQL schema
--
-- The server also creates these tables automatically on startup (see
-- server/src/db.js initDb), so applying this by hand is optional. It's here so
-- you can provision a Turso database up front, e.g.:
--
--   turso db create baletrack
--   turso db shell baletrack < db/schema.sql
--   turso db show baletrack --url          # -> TURSO_DATABASE_URL
--   turso db tokens create baletrack       # -> TURSO_AUTH_TOKEN
--
-- Everything below is idempotent (IF NOT EXISTS), so it's safe to re-run.

-- Registered TCB scanning sessions. Auto-confirm replays a device's cookies.
CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,            -- app-generated id
  label       TEXT NOT NULL,               -- human name, e.g. "Ginnery scanner"
  cookies     TEXT NOT NULL,               -- serialized tough-cookie jar (JSON)
  status      TEXT NOT NULL DEFAULT 'unknown', -- registered | invalid | unknown
  check_point INTEGER,                     -- 1 = Ginnery, 2 = Port (from TCB)
  user        TEXT,                        -- TCB user the device registered as
  last_ok_at  TEXT,                        -- last successful authorized call
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A batch of bales to track (from an upload, a scan session, or pasted URLs).
CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  source     TEXT NOT NULL,                -- pdf | image | scan | paste
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | error
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual bales within a job. `data` is the hex token from the QR URL
-- (…/baletrack/<data>); UNIQUE(job_id, data) de-duplicates repeat scans.
CREATE TABLE IF NOT EXISTS bales (
  id         TEXT PRIMARY KEY,
  job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  label      TEXT,                         -- printed lot label, e.g. 2704C-96
  data       TEXT NOT NULL,                -- hex token from the QR
  url        TEXT NOT NULL,                -- full baletrack URL
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | already | checked | error
  tracked    INTEGER NOT NULL DEFAULT 0,   -- 1 once tracked at the device's check point
  result     TEXT,                         -- raw JSON returned by TCB
  error      TEXT,                         -- last error message, if any
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id, data)
);

-- Helpful indexes for the common lookups.
CREATE INDEX IF NOT EXISTS idx_bales_job        ON bales(job_id);
CREATE INDEX IF NOT EXISTS idx_bales_job_status ON bales(job_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created     ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_devices_created  ON devices(created_at);
