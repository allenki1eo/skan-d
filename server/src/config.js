import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

// Turso / libSQL connection. Default to a local SQLite file so the app runs
// with zero external setup; set TURSO_DATABASE_URL (libsql://…) + TURSO_AUTH_TOKEN
// for a hosted, durable Turso database.
function resolveDbUrl() {
  const raw = process.env.TURSO_DATABASE_URL || process.env.DB_PATH;
  if (raw && /^(libsql|https?|wss?):/.test(raw)) return raw; // remote Turso
  if (raw && raw.startsWith('file:')) return raw;
  const filePath = raw ? path.resolve(root, raw) : path.resolve(root, 'data', 'baletrack.sqlite');
  return `file:${filePath}`;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  tcbBaseUrl: (process.env.TCB_BASE_URL || 'https://ccis.tcb.go.tz').replace(/\/$/, ''),
  dbUrl: resolveDbUrl(),
  dbAuthToken: process.env.TURSO_AUTH_TOKEN || undefined,
  confirmConcurrency: Number(process.env.CONFIRM_CONCURRENCY || 6),
  confirmDelayMs: Number(process.env.CONFIRM_DELAY_MS || 150),
  appPassword: process.env.APP_PASSWORD || '',
  webDist: path.resolve(root, 'web', 'dist'),
  root,
};
