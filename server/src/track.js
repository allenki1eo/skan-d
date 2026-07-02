import { readStatus, confirm, interpret } from './tcb.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Track a single bale with a device's cookie jar.
 * mode: 'check' = read only (track/0). 'confirm' = confirm if not already done (track/1).
 *
 * Returns a normalized outcome used by both the background runner (self-hosted)
 * and the stateless /api/confirm endpoint (serverless):
 *   { outcome, label, checkPoint, tracked, result, message }
 *   outcome ∈ 'confirmed' | 'already' | 'checked' | 'error'
 */
export async function trackBale({ jar, data, mode }) {
  try {
    let read = await readStatus(jar, data);
    // The TCB backend occasionally returns a transient plain-text error; retry once.
    if (!read.json && /transient|DNS resolution|timeout/i.test(read.text || '')) {
      await sleep(400);
      read = await readStatus(jar, data);
    }
    if (read.status === 401 || read.status === 403) {
      return err(null, null, `Device not authorized (HTTP ${read.status}) — re-register or re-import cookies`, read);
    }

    const info = interpret(read.json);
    const label = read.json?.label || null;

    if (!info.valid) {
      return err(label, null, 'No data / transient error', read);
    }
    if (mode === 'confirm' && !info.checkPoint) {
      // A registered device is assigned a check point (1=Ginnery, 2=Port).
      // No check point means this session isn't a registered scanning device.
      return err(label, null, 'Device has no check point — not registered', read, info.raw);
    }
    if (info.alreadyDone) {
      return { outcome: 'already', label, checkPoint: info.checkPoint, tracked: 1, result: info.raw, message: null };
    }
    if (mode === 'check') {
      return { outcome: 'checked', label, checkPoint: info.checkPoint, tracked: 0, result: info.raw, message: null };
    }

    // confirm
    const res = await confirm(jar, data);
    if (res.status === 401 || res.status === 403) {
      return err(label, info.checkPoint, `Confirm rejected (HTTP ${res.status}) — device not authorized`, res);
    }
    const after = interpret(res.json);
    const confirmLabel = res.json?.label || label;
    if (after.alreadyDone) {
      return { outcome: 'confirmed', label: confirmLabel, checkPoint: after.checkPoint, tracked: 1, result: after.raw, message: null };
    }
    const detail = res.ok ? 'Confirm did not register (check point still empty)' : `HTTP ${res.status}`;
    return err(confirmLabel, after.checkPoint, detail, res);
  } catch (e) {
    return err(null, null, String(e.message || e), null);
  }
}

function err(label, checkPoint, message, res, raw) {
  const result = raw ?? (res ? (res.json ?? res.text) : null);
  return { outcome: 'error', label, checkPoint, tracked: 0, result, message };
}
