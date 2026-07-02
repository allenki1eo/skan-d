import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    cookies     TEXT NOT NULL,           -- serialized tough-cookie jar
    status      TEXT NOT NULL DEFAULT 'unknown', -- registered | invalid | unknown
    check_point INTEGER,                 -- 1 = Ginnery, 2 = Port
    user        TEXT,
    last_ok_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    source     TEXT NOT NULL,            -- pdf | image | scan | paste
    status     TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | error
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bales (
    id         TEXT PRIMARY KEY,
    job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    label      TEXT,                     -- printed lot label if known (e.g. 2704C-96)
    data       TEXT NOT NULL,            -- hex token from the QR URL
    url        TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | already | error | checked
    tracked    INTEGER NOT NULL DEFAULT 0,
    result     TEXT,                     -- raw JSON from TCB
    error      TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(job_id, data)
  );
`);

export default db;
