import { EventEmitter } from 'node:events';
import db from './db.js';
import { config } from './config.js';
import { jarFromSerialized, readStatus, confirm, interpret } from './tcb.js';

export const bus = new EventEmitter();
bus.setMaxListeners(0);

const running = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emit(jobId, event) {
  bus.emit(jobId, { ...event, ts: Date.now() });
}

/**
 * Run a job: for each pending bale, read status and (optionally) confirm.
 * mode: 'check' = read only (track/0). 'confirm' = confirm not-yet bales (track/1).
 */
export async function runJob({ jobId, deviceId, mode }) {
  if (running.has(jobId)) return;
  running.add(jobId);

  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  if (!device) {
    running.delete(jobId);
    emit(jobId, { type: 'error', message: 'Device not found' });
    return;
  }
  const jar = jarFromSerialized(device.cookies);

  const bales = db
    .prepare("SELECT * FROM bales WHERE job_id = ? AND status IN ('pending','error','checked') ORDER BY rowid")
    .all(jobId);

  db.prepare("UPDATE jobs SET status = 'running' WHERE id = ?").run(jobId);
  emit(jobId, { type: 'start', total: bales.length, mode });

  const setBale = db.prepare(
    'UPDATE bales SET status=?, tracked=?, result=?, error=?, label=COALESCE(?, label), updated_at=datetime(\'now\') WHERE id=?',
  );

  let done = 0;
  let confirmed = 0;
  let already = 0;
  let errors = 0;
  let index = 0;

  async function worker() {
    while (index < bales.length) {
      const bale = bales[index++];
      try {
        let read = await readStatus(jar, bale.data);
        // The TCB backend occasionally returns a transient plain-text error; retry once.
        if (!read.json && /transient|DNS resolution|timeout/i.test(read.text || '')) {
          await sleep(400);
          read = await readStatus(jar, bale.data);
        }
        if (read.status === 401 || read.status === 403) {
          throw new Error(`Device not authorized (HTTP ${read.status}) — re-register or re-import cookies`);
        }
        const info = interpret(read.json);
        const label = read.json?.label || null;

        if (!info.valid) {
          errors++;
          setBale.run('error', 0, JSON.stringify(read.json ?? read.text), 'No data / transient error', label, bale.id);
          emit(jobId, { type: 'bale', id: bale.id, status: 'error', label, message: 'no data' });
        } else if (mode === 'confirm' && !info.checkPoint) {
          // A registered device is assigned a check point (1=Ginnery, 2=Port).
          // No check point means this session isn't a registered scanning device.
          errors++;
          setBale.run('error', 0, JSON.stringify(info.raw), 'Device has no check point — not registered', label, bale.id);
          emit(jobId, { type: 'bale', id: bale.id, status: 'error', label, message: 'device not registered' });
        } else if (info.alreadyDone) {
          already++;
          setBale.run('already', 1, JSON.stringify(info.raw), null, label, bale.id);
          emit(jobId, { type: 'bale', id: bale.id, status: 'already', label, checkPoint: info.checkPoint });
        } else if (mode === 'check') {
          setBale.run('checked', 0, JSON.stringify(info.raw), null, label, bale.id);
          emit(jobId, { type: 'bale', id: bale.id, status: 'checked', label, checkPoint: info.checkPoint });
        } else {
          const res = await confirm(jar, bale.data);
          if (res.status === 401 || res.status === 403) {
            throw new Error(`Confirm rejected (HTTP ${res.status}) — device not authorized`);
          }
          const after = interpret(res.json);
          const confirmLabel = res.json?.label || label;
          // Success = the check point for this device is now filled in the returned checks[].
          if (after.alreadyDone) {
            confirmed++;
            setBale.run('confirmed', 1, JSON.stringify(res.json ?? res.text), null, confirmLabel, bale.id);
            emit(jobId, { type: 'bale', id: bale.id, status: 'confirmed', label: confirmLabel, checkPoint: after.checkPoint });
          } else {
            errors++;
            const detail = res.ok ? 'Confirm did not register (check point still empty)' : `HTTP ${res.status}`;
            setBale.run('error', 0, JSON.stringify(res.json ?? res.text), detail, confirmLabel, bale.id);
            emit(jobId, { type: 'bale', id: bale.id, status: 'error', label: confirmLabel, message: detail });
          }
        }
      } catch (err) {
        errors++;
        setBale.run('error', 0, null, String(err.message || err), null, bale.id);
        emit(jobId, { type: 'bale', id: bale.id, status: 'error', message: String(err.message || err) });
      } finally {
        done++;
        emit(jobId, { type: 'progress', done, total: bales.length, confirmed, already, errors });
        if (config.confirmDelayMs > 0) await sleep(config.confirmDelayMs);
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, config.confirmConcurrency) }, () => worker());
  await Promise.all(workers);

  db.prepare("UPDATE jobs SET status = 'done' WHERE id = ?").run(jobId);
  emit(jobId, { type: 'done', done, total: bales.length, confirmed, already, errors });
  running.delete(jobId);
}

export function isRunning(jobId) {
  return running.has(jobId);
}
