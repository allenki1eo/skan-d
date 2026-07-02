import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

export const config = {
  port: Number(process.env.PORT || 8080),
  tcbBaseUrl: (process.env.TCB_BASE_URL || 'https://ccis.tcb.go.tz').replace(/\/$/, ''),
  dbPath: process.env.DB_PATH
    ? path.resolve(root, process.env.DB_PATH)
    : path.resolve(root, 'data', 'baletrack.sqlite'),
  confirmConcurrency: Number(process.env.CONFIRM_CONCURRENCY || 6),
  confirmDelayMs: Number(process.env.CONFIRM_DELAY_MS || 150),
  appPassword: process.env.APP_PASSWORD || '',
  webDist: path.resolve(root, 'web', 'dist'),
  root,
};
