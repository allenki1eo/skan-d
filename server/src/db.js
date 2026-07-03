import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// On serverless (Vercel) the filesystem is read-only, so a local SQLite file can't
// work — a hosted Turso database is required. Fail early with a clear message.
if (process.env.VERCEL && config.dbUrl.startsWith('file:')) {
  throw new Error(
    'Running on Vercel without a Turso database. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN ' +
      'in the project environment variables (Vercel → Settings → Environment Variables).',
  );
}

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

function dbHost() {
  try {
    return new URL(config.dbUrl.replace(/^libsql:/, 'https:')).host;
  } catch {
    return config.dbUrl.slice(0, 24);
  }
}

// Turn a raw libSQL/connection error into an actionable message. A common cause
// on a fresh deploy is a wrong or stale TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
function dbError(e) {
  const msg = String(e?.message || e);
  const err = new Error(
    `Database error (${dbHost()}): ${msg}. ` +
      'Check that TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set correctly ' +
      '(regenerate the token with `turso db tokens create <db>` and re-copy the URL from ' +
      '`turso db show <db> --url`), then redeploy.',
  );
  err.statusCode = 503;
  return err;
}

// Create the schema once per warm instance. Cached; on failure it resets so the
// next request retries (e.g. after fixing env vars + redeploying).
let initPromise = null;
export function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      for (const sql of SCHEMA) await client.execute(sql);
    })().catch((e) => {
      initPromise = null;
      console.error('[db] init failed:', String(e?.message || e));
      throw dbError(e);
    });
  }
  return initPromise;
}

async function exec(sql, args) {
  await initDb();
  try {
    return await client.execute({ sql, args });
  } catch (e) {
    console.error('[db] query failed:', String(e?.message || e));
    throw dbError(e);
  }
}

/** Return all matching rows as plain objects. */
export async function all(sql, args = []) {
  return (await exec(sql, args)).rows;
}

/** Return the first matching row, or null. */
export async function get(sql, args = []) {
  return (await exec(sql, args)).rows[0] ?? null;
}

/** Execute a write; returns { rowsAffected, lastInsertRowid }. */
export async function run(sql, args = []) {
  const res = await exec(sql, args);
  return { rowsAffected: res.rowsAffected, lastInsertRowid: res.lastInsertRowid };
}

export default client;
