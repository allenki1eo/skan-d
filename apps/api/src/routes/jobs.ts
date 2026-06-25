import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/pool';
import { decodeQueue } from '../queue';
import { uploadStream } from '../lib/s3';
import { JwtPayload } from '@skan-d/shared';
import { getRedis } from '../lib/redis';

export default async function jobsRoutes(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  // POST /jobs — multipart: PDF file + job config fields
  app.post('/', guard, async (req, reply) => {
    const user = req.user as JwtPayload;

    const { rows: [company] } = await db.query(
      `SELECT quota_batch_size, quota_concurrency, active FROM companies WHERE id=$1`,
      [user.companyId]
    );
    if (!company?.active) return reply.code(403).send({ error: 'Company account suspended' });

    const parts = req.parts();
    let confirmSelector = 'button[type="submit"]';
    let waitForNavigation = true;
    let blockResources = true;
    let pdfKey: string | null = null;
    const jobId = uuidv4();

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'confirmSelector') confirmSelector = part.value as string;
        if (part.fieldname === 'waitForNavigation') waitForNavigation = part.value === 'true';
        if (part.fieldname === 'blockResources') blockResources = part.value !== 'false';
      } else if (part.type === 'file' && part.mimetype === 'application/pdf') {
        pdfKey = `uploads/${user.companyId}/${jobId}.pdf`;
        await uploadStream(pdfKey, part.file, 'application/pdf');
      }
    }

    if (!pdfKey) return reply.code(400).send({ error: 'PDF file required' });

    await db.query(
      `INSERT INTO jobs (id, company_id, user_id, confirm_selector, wait_for_navigation, block_resources, pdf_key, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [jobId, user.companyId, user.sub, confirmSelector, waitForNavigation, blockResources, pdfKey]
    );

    await decodeQueue.add('decode-pdf', {
      jobId,
      companyId: user.companyId,
      pdfKey,
    }, { attempts: 2 });

    reply.code(202).send({ jobId, status: 'pending' });
  });

  // GET /jobs
  app.get('/', guard, async (req, reply) => {
    const user = req.user as JwtPayload;
    const { rows } = await db.query(
      `SELECT id, status, total, decoded, success, failed, skipped,
              confirm_selector, created_at, completed_at
       FROM jobs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [user.companyId]
    );
    reply.send(rows);
  });

  // GET /jobs/:id
  app.get<{ Params: { id: string } }>('/:id', guard, async (req, reply) => {
    const user = req.user as JwtPayload;
    const { rows } = await db.query(
      `SELECT * FROM jobs WHERE id=$1 AND company_id=$2`,
      [req.params.id, user.companyId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    reply.send(rows[0]);
  });

  /**
   * GET /jobs/:id/stream — Server-Sent Events for live job progress.
   * Subscribes to Redis pub/sub channel and streams updates to the client.
   * Works on Vercel (streaming response) and local dev.
   */
  // SSE endpoint — auth via query param token (EventSource can't set headers)
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>('/:id/stream', async (req, reply) => {
    const token = req.query.token;
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    let user: JwtPayload;
    try {
      user = (req.server as any).jwt.verify(token) as JwtPayload;
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    // re-bind user so the rest of the handler works the same
    (req as any).user = user;
    const user = req.user as JwtPayload;

    const { rows: [job] } = await db.query(
      `SELECT id, company_id FROM jobs WHERE id=$1 AND company_id=$2`,
      [req.params.id, (req as any).user.companyId]
    );
    if (!job) return reply.code(404).send({ error: 'Not found' });

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    const send = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send current state immediately
    const { rows: [current] } = await db.query(
      `SELECT id, status, total, success, failed, skipped FROM jobs WHERE id=$1`,
      [req.params.id]
    );
    send(current);

    // Subscribe to Redis updates
    const subscriber = getRedis().duplicate();
    await subscriber.subscribe(`job:${req.params.id}`);

    subscriber.on('message', (_channel: string, message: string) => {
      try {
        send(JSON.parse(message));
      } catch {
        // ignore
      }
    });

    const cleanup = () => {
      subscriber.unsubscribe().then(() => subscriber.disconnect()).catch(() => {});
    };

    req.raw.on('close', cleanup);
    req.raw.on('aborted', cleanup);
  });

  // GET /jobs/:id/results
  app.get<{ Params: { id: string }; Querystring: { page?: number; status?: string } }>(
    '/:id/results', guard, async (req, reply) => {
      const user = req.user as JwtPayload;
      const page = Number(req.query.page) || 1;
      const statusFilter = req.query.status;
      const limit = 100;
      const offset = (page - 1) * limit;

      const { rows: [job] } = await db.query(
        `SELECT id FROM jobs WHERE id=$1 AND company_id=$2`,
        [req.params.id, user.companyId]
      );
      if (!job) return reply.code(404).send({ error: 'Not found' });

      const params: any[] = statusFilter
        ? [req.params.id, limit, offset, statusFilter]
        : [req.params.id, limit, offset];

      const whereStatus = statusFilter ? `AND status=$4` : '';
      const { rows } = await db.query(
        `SELECT id, url, status, error_msg, duration_ms, created_at
         FROM url_results WHERE job_id=$1 ${whereStatus}
         ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
        params
      );

      const { rows: [count] } = await db.query(
        `SELECT COUNT(*) FROM url_results WHERE job_id=$1`,
        [req.params.id]
      );

      reply.send({ results: rows, total: parseInt(count.count), page, limit });
    }
  );

  // GET /jobs/:id/export.csv
  app.get<{ Params: { id: string } }>('/:id/export.csv', guard, async (req, reply) => {
    const user = req.user as JwtPayload;
    const { rows: [job] } = await db.query(
      `SELECT id FROM jobs WHERE id=$1 AND company_id=$2`,
      [req.params.id, user.companyId]
    );
    if (!job) return reply.code(404).send({ error: 'Not found' });

    const { rows } = await db.query(
      `SELECT url, status, error_msg, duration_ms, created_at
       FROM url_results WHERE job_id=$1 ORDER BY created_at`,
      [req.params.id]
    );

    const csv = [
      'url,status,error_msg,duration_ms,created_at',
      ...rows.map((r) =>
        [r.url, r.status, r.error_msg ?? '', r.duration_ms ?? '', r.created_at].join(',')
      ),
    ].join('\n');

    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="job-${req.params.id}.csv"`)
      .send(csv);
  });
}
