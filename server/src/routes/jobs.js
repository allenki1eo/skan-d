import { nanoid } from 'nanoid';
import db from '../db.js';
import { decodeBuffer } from '../decode.js';
import { parseBaleData } from '../tcb.js';
import { runJob, bus, isRunning } from '../runner.js';

function publicJob(job) {
  if (!job) return null;
  const bales = db.prepare('SELECT * FROM bales WHERE job_id = ? ORDER BY rowid').all(job.id);
  const counts = bales.reduce((acc, b) => ((acc[b.status] = (acc[b.status] || 0) + 1), acc), {});
  return {
    id: job.id,
    name: job.name,
    source: job.source,
    status: job.status,
    createdAt: job.created_at,
    running: isRunning(job.id),
    total: bales.length,
    counts,
    bales: bales.map((b) => ({
      id: b.id,
      label: b.label,
      data: b.data,
      url: b.url,
      status: b.status,
      tracked: !!b.tracked,
      error: b.error,
    })),
  };
}

function insertBales(jobId, urls) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO bales (id, job_id, label, data, url) VALUES (?, ?, ?, ?, ?)`,
  );
  let added = 0;
  const seen = new Set();
  for (const raw of urls) {
    const parsed = parseBaleData(raw);
    if (parsed.kind !== 'track') continue;
    if (seen.has(parsed.data)) continue;
    seen.add(parsed.data);
    const info = insert.run(nanoid(), jobId, null, parsed.data, parsed.url);
    added += info.changes;
  }
  return added;
}

export default async function jobRoutes(app) {
  app.get('/api/jobs', async () => {
    const jobs = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
    return jobs.map((j) => {
      const total = db.prepare('SELECT COUNT(*) n FROM bales WHERE job_id = ?').get(j.id).n;
      return { id: j.id, name: j.name, source: j.source, status: j.status, createdAt: j.created_at, total };
    });
  });

  app.get('/api/jobs/:id', async (req, reply) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return publicJob(job);
  });

  app.delete('/api/jobs/:id', async (req) => {
    db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  // Create a job from an uploaded PDF or image (multipart), decoding QR codes.
  app.post('/api/jobs/upload', async (req, reply) => {
    const parts = req.parts();
    let name = null;
    const allUrls = [];
    let sawFile = false;
    for await (const part of parts) {
      if (part.type === 'file') {
        sawFile = true;
        const buffer = await part.toBuffer();
        try {
          const urls = await decodeBuffer(buffer, part.mimetype, part.filename);
          allUrls.push(...urls);
        } catch (err) {
          return reply.code(422).send({ error: `Failed to decode ${part.filename}: ${err.message}` });
        }
        if (!name) name = part.filename;
      } else if (part.fieldname === 'name') {
        name = part.value;
      }
    }
    if (!sawFile) return reply.code(400).send({ error: 'No file uploaded' });

    const jobId = nanoid();
    const isPdf = allUrls.length && /pdf/i.test(name || '');
    db.prepare('INSERT INTO jobs (id, name, source) VALUES (?, ?, ?)').run(
      jobId,
      name || 'Upload',
      isPdf ? 'pdf' : 'image',
    );
    const added = insertBales(jobId, allUrls);
    return { ...publicJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId)), decoded: allUrls.length, added };
  });

  // Create a job from pasted URLs or scanned codes (JSON).
  app.post('/api/jobs', async (req, reply) => {
    const { name, urls, source } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) {
      return reply.code(400).send({ error: 'urls array is required' });
    }
    const jobId = nanoid();
    db.prepare('INSERT INTO jobs (id, name, source) VALUES (?, ?, ?)').run(
      jobId,
      name || 'Scan session',
      source === 'scan' ? 'scan' : 'paste',
    );
    const added = insertBales(jobId, urls);
    return { ...publicJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId)), added };
  });

  // Append more codes to an existing job (used by the live scanner).
  app.post('/api/jobs/:id/bales', async (req, reply) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    const { urls } = req.body || {};
    if (!Array.isArray(urls)) return reply.code(400).send({ error: 'urls array is required' });
    const added = insertBales(job.id, urls);
    return { ...publicJob(job), added };
  });

  // Kick off a run. mode: 'confirm' | 'check'
  app.post('/api/jobs/:id/run', async (req, reply) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    const { deviceId, mode } = req.body || {};
    if (!deviceId) return reply.code(400).send({ error: 'deviceId is required' });
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    if (isRunning(job.id)) return reply.code(409).send({ error: 'Job already running' });

    runJob({ jobId: job.id, deviceId, mode: mode === 'check' ? 'check' : 'confirm' }).catch((err) =>
      app.log.error(err),
    );
    return { ok: true, started: true, mode: mode === 'check' ? 'check' : 'confirm' };
  });

  // Server-Sent Events stream of run progress.
  app.get('/api/jobs/:id/events', async (req, reply) => {
    const jobId = req.params.id;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`event: hello\ndata: {"jobId":"${jobId}"}\n\n`);

    const listener = (payload) => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    bus.on(jobId, listener);

    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 15000);
    req.raw.on('close', () => {
      clearInterval(keepAlive);
      bus.off(jobId, listener);
    });
  });
}
