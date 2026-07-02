import { EventEmitter } from 'node:events';
import { all, get, run } from './db.js';
import { config } from './config.js';
import { jarFromSerialized } from './tcb.js';
import { trackBale } from './track.js';

export const bus = new EventEmitter();
bus.setMaxListeners(0);

const running = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emit(jobId, event) {
  bus.emit(jobId, { ...event, ts: Date.now() });
}

// Persist a bale's outcome. COALESCE keeps an existing label if none supplied.
const saveBale = (id, o) =>
  run(
    "UPDATE bales SET status=?, tracked=?, result=?, error=?, label=COALESCE(?, label), updated_at=datetime('now') WHERE id=?",
    [o.outcome, o.tracked, o.result != null ? JSON.stringify(o.result) : null, o.message, o.label, id],
  );

/**
 * Run a job in the background (self-hosted mode) with live SSE progress.
 * mode: 'check' = read only (track/0). 'confirm' = confirm not-yet bales (track/1).
 */
export async function runJob({ jobId, deviceId, mode }) {
  if (running.has(jobId)) return;
  running.add(jobId);

  const device = await get('SELECT * FROM devices WHERE id = ?', [deviceId]);
  if (!device) {
    running.delete(jobId);
    emit(jobId, { type: 'error', message: 'Device not found' });
    return;
  }
  const jar = jarFromSerialized(device.cookies);

  const bales = await all(
    "SELECT * FROM bales WHERE job_id = ? AND status IN ('pending','error','checked') ORDER BY rowid",
    [jobId],
  );

  await run("UPDATE jobs SET status = 'running' WHERE id = ?", [jobId]);
  emit(jobId, { type: 'start', total: bales.length, mode });

  let done = 0;
  let confirmed = 0;
  let already = 0;
  let errors = 0;
  let index = 0;

  async function worker() {
    while (index < bales.length) {
      const bale = bales[index++];
      const o = await trackBale({ jar, data: bale.data, mode });
      await saveBale(bale.id, o);
      if (o.outcome === 'confirmed') confirmed++;
      else if (o.outcome === 'already') already++;
      else if (o.outcome === 'error') errors++;
      emit(jobId, { type: 'bale', id: bale.id, status: o.outcome, label: o.label, checkPoint: o.checkPoint, message: o.message });
      done++;
      emit(jobId, { type: 'progress', done, total: bales.length, confirmed, already, errors });
      if (config.confirmDelayMs > 0) await sleep(config.confirmDelayMs);
    }
  }

  const workers = Array.from({ length: Math.max(1, config.confirmConcurrency) }, () => worker());
  await Promise.all(workers);

  await run("UPDATE jobs SET status = 'done' WHERE id = ?", [jobId]);
  emit(jobId, { type: 'done', done, total: bales.length, confirmed, already, errors });
  running.delete(jobId);
}

export function isRunning(jobId) {
  return running.has(jobId);
}
