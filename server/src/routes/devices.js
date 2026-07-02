import { nanoid } from 'nanoid';
import db from '../db.js';
import {
  register,
  serializeJar,
  jarFromCookieString,
  jarFromSerialized,
  readStatus,
  interpret,
  parseBaleData,
  CHECK_POINTS,
} from '../tcb.js';

function publicDevice(d) {
  if (!d) return null;
  return {
    id: d.id,
    label: d.label,
    status: d.status,
    checkPoint: d.check_point,
    checkPointName: d.check_point ? CHECK_POINTS[d.check_point - 1] : null,
    user: d.user,
    lastOkAt: d.last_ok_at,
    createdAt: d.created_at,
  };
}

export default async function deviceRoutes(app) {
  app.get('/api/devices', async () => {
    const rows = db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all();
    return rows.map(publicDevice);
  });

  // Register the service as a device using a fresh registration link/token.
  app.post('/api/devices/register', async (req, reply) => {
    const { link, label } = req.body || {};
    if (!link) return reply.code(400).send({ error: 'link is required' });

    const parsed = parseBaleData(link);
    const token = parsed.kind === 'register' ? parsed.token : String(link).trim();
    if (!token) return reply.code(400).send({ error: 'Could not find a registration token in that link' });

    const { jar, ok, status, json } = await register(token);
    if (!ok) {
      return reply.code(502).send({
        error: `TCB registration failed (HTTP ${status}). The link may be expired or already used.`,
        status,
      });
    }

    const id = nanoid();
    const checkPoint = json?.checkPoint ?? null;
    const user = json?.user ?? null;
    db.prepare(
      `INSERT INTO devices (id, label, cookies, status, check_point, user, last_ok_at)
       VALUES (?, ?, ?, 'registered', ?, ?, datetime('now'))`,
    ).run(id, label || user || 'Registered device', serializeJar(jar), checkPoint, user);

    return publicDevice(db.prepare('SELECT * FROM devices WHERE id = ?').get(id));
  });

  // Import cookies from an already-registered phone/browser.
  app.post('/api/devices/import', async (req, reply) => {
    const { cookies, label } = req.body || {};
    if (!cookies) return reply.code(400).send({ error: 'cookies string is required' });

    const jar = jarFromCookieString(cookies);
    const id = nanoid();
    db.prepare(
      `INSERT INTO devices (id, label, cookies, status) VALUES (?, ?, ?, 'unknown')`,
    ).run(id, label || 'Imported device', serializeJar(jar));

    return publicDevice(db.prepare('SELECT * FROM devices WHERE id = ?').get(id));
  });

  // Verify a device is still authorized by reading one bale token (read-only, no side effect).
  app.post('/api/devices/:id/verify', async (req, reply) => {
    const { id } = req.params;
    const { sample } = req.body || {};
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    if (!sample) return reply.code(400).send({ error: 'A sample bale QR/URL is required to verify' });

    const parsed = parseBaleData(sample);
    if (parsed.kind !== 'track') return reply.code(400).send({ error: 'Sample is not a bale QR/URL' });

    const jar = jarFromSerialized(device.cookies);
    const res = await readStatus(jar, parsed.data);
    const info = interpret(res.json);
    // A genuinely registered scanning device is assigned a check point (>=1).
    // Any session can read, but only a registered one carries a check point.
    const authorized = res.ok && info.valid && info.checkPoint > 0;

    db.prepare('UPDATE devices SET status = ?, check_point = COALESCE(?, check_point), last_ok_at = ? WHERE id = ?').run(
      authorized ? 'registered' : 'invalid',
      info.checkPoint,
      authorized ? new Date().toISOString() : device.last_ok_at,
      id,
    );

    return {
      authorized,
      httpStatus: res.status,
      checkPoint: info.checkPoint,
      alreadyDone: info.alreadyDone,
      device: publicDevice(db.prepare('SELECT * FROM devices WHERE id = ?').get(id)),
    };
  });

  app.delete('/api/devices/:id', async (req) => {
    db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
