import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Ensure the directory exists for local file-backed databases.
if (config.dbUrl.startsWith('file:')) {
  const filePath = config.dbUrl.slice('file:'.length);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export const client = createClient({
  url: config.dbUrl,
  authToken: config.dbAuthToken,
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS devices (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    cookies     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'unknown',
    check_point INTEGER,
    user        TEXT,
    last_ok_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    source     TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS bales (
    id         TEXT PRIMARY KEY,
    job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    label      TEXT,
    data       TEXT NOT NULL,
    url        TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    tracked    INTEGER NOT NULL DEFAULT 0,
    result     TEXT,
    error      TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(job_id, data)
  )`,
];

export async function initDb() {
  for (const sql of SCHEMA) {
    await client.execute(sql);
  }
}

/** Return all matching rows as plain objects. */
export async function all(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows;
}

/** Return the first matching row, or null. */
export async function get(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows[0] ?? null;
}

/** Execute a write; returns { rowsAffected, lastInsertRowid }. */
export async function run(sql, args = []) {
  const res = await client.execute({ sql, args });
  return { rowsAffected: res.rowsAffected, lastInsertRowid: res.lastInsertRowid };
}

export default client;
