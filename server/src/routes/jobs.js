import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';
import { parseBaleData, jarFromSerialized } from '../tcb.js';
import { trackBale } from '../track.js';
import { runJob, bus, isRunning } from '../runner.js';

const getJob = (id) => get('SELECT * FROM jobs WHERE id = ?', [id]);

async function publicJob(job) {
  if (!job) return null;
  const bales = await all('SELECT * FROM bales WHERE job_id = ? ORDER BY rowid', [job.id]);
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

export async function insertBales(jobId, urls) {
  let added = 0;
  const seen = new Set();
  for (const raw of urls) {
    const parsed = parseBaleData(raw);
    if (parsed.kind !== 'track') continue;
    if (seen.has(parsed.data)) continue;
    seen.add(parsed.data);
    const res = await run('INSERT OR IGNORE INTO bales (id, job_id, label, data, url) VALUES (?, ?, ?, ?, ?)', [
      nanoid(),
      jobId,
      null,
      parsed.data,
      parsed.url,
    ]);
    added += res.rowsAffected;
  }
  return added;
}

export default async function jobRoutes(app) {
  app.get('/api/jobs', async () => {
    const jobs = await all('SELECT * FROM jobs ORDER BY created_at DESC');
    const out = [];
    for (const j of jobs) {
      const row = await get('SELECT COUNT(*) n FROM bales WHERE job_id = ?', [j.id]);
      out.push({ id: j.id, name: j.name, source: j.source, status: j.status, createdAt: j.created_at, total: row.n });
    }
    return out;
  });

  app.get('/api/jobs/:id', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return publicJob(job);
  });

  app.delete('/api/jobs/:id', async (req) => {
    await run('DELETE FROM bales WHERE job_id = ?', [req.params.id]);
    await run('DELETE FROM jobs WHERE id = ?', [req.params.id]);
    return { ok: true };
  });

  // Create a job from pasted URLs, scanned codes, or client-side decoded PDFs/images (JSON).
  app.post('/api/jobs', async (req, reply) => {
    const { name, urls, source } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) {
      return reply.code(400).send({ error: 'urls array is required' });
    }
    const jobId = nanoid();
    const src = ['scan', 'pdf', 'image', 'paste'].includes(source) ? source : 'paste';
    await run('INSERT INTO jobs (id, name, source) VALUES (?, ?, ?)', [jobId, name || 'Job', src]);
    const added = await insertBales(jobId, urls);
    return { ...(await publicJob(await getJob(jobId))), added };
  });

  // Append more codes to an existing job (used by the live scanner).
  app.post('/api/jobs/:id/bales', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    const { urls } = req.body || {};
    if (!Array.isArray(urls)) return reply.code(400).send({ error: 'urls array is required' });
    const added = await insertBales(job.id, urls);
    return { ...(await publicJob(job)), added };
  });

  /**
   * Stateless single-bale track/confirm — the serverless-friendly path.
   * The PWA drives the loop over bales with its own concurrency and progress.
   * Body: { deviceId, data, mode: 'confirm'|'check', jobId?, baleId? }
   */
  app.post('/api/confirm', async (req, reply) => {
    const { deviceId, data, mode, jobId, baleId } = req.body || {};
    if (!deviceId || !data) return reply.code(400).send({ error: 'deviceId and data are required' });
    const device = await get('SELECT * FROM devices WHERE id = ?', [deviceId]);
    if (!device) return reply.code(404).send({ error: 'Device not found' });

    const jar = jarFromSerialized(device.cookies);
    const o = await trackBale({ jar, data, mode: mode === 'check' ? 'check' : 'confirm' });

    // Persist against the bale row if this belongs to a stored job.
    if (jobId || baleId) {
      const bale = baleId
        ? await get('SELECT * FROM bales WHERE id = ?', [baleId])
        : await get('SELECT * FROM bales WHERE job_id = ? AND data = ?', [jobId, data]);
      if (bale) {
        await run(
          "UPDATE bales SET status=?, tracked=?, result=?, error=?, label=COALESCE(?, label), updated_at=datetime('now') WHERE id=?",
          [o.outcome, o.tracked, o.result != null ? JSON.stringify(o.result) : null, o.message, o.label, bale.id],
        );
      }
    }
    return { status: o.outcome, label: o.label, checkPoint: o.checkPoint, tracked: !!o.tracked, message: o.message };
  });

  // Background run with live SSE progress (self-hosted / persistent-process mode).
  app.post('/api/jobs/:id/run', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    const { deviceId, mode } = req.body || {};
    if (!deviceId) return reply.code(400).send({ error: 'deviceId is required' });
    const device = await get('SELECT * FROM devices WHERE id = ?', [deviceId]);
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    if (isRunning(job.id)) return reply.code(409).send({ error: 'Job already running' });

    runJob({ jobId: job.id, deviceId, mode: mode === 'check' ? 'check' : 'confirm' }).catch((err) =>
      app.log.error(err),
    );
    return { ok: true, started: true, mode: mode === 'check' ? 'check' : 'confirm' };
  });

  // Server-Sent Events stream of run progress (self-hosted mode).
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
