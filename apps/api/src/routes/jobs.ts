import { FastifyInstance } from 'fastify';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/pool';
import { decodeQueue } from '../queue';
import { uploadStream } from '../lib/s3';
import { JwtPayload } from '@skan-d/shared';

export default async function jobsRoutes(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  // POST /jobs — multipart: PDF file + job config fields
  app.post('/', {
    ...guard,
    config: { rawBody: true },
  }, async (req, reply) => {
    const user = req.user as JwtPayload;

    // Check company quota
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

    // Create job record
    await db.query(
      `INSERT INTO jobs (id, company_id, user_id, confirm_selector, wait_for_navigation, block_resources, pdf_key, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [jobId, user.companyId, user.sub, confirmSelector, waitForNavigation, blockResources, pdfKey]
    );

    // Enqueue decode job
    await decodeQueue.add('decode-pdf', {
      jobId,
      companyId: user.companyId,
      pdfKey,
    }, { attempts: 2 });

    reply.code(202).send({ jobId, status: 'pending' });
  });

  // GET /jobs — list jobs for the caller's company
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

  // GET /jobs/:id/results — paginated url_results
  app.get<{ Params: { id: string }; Querystring: { page?: number; status?: string } }>(
    '/:id/results', guard, async (req, reply) => {
      const user = req.user as JwtPayload;
      const page = req.query.page || 1;
      const statusFilter = req.query.status;
      const limit = 100;
      const offset = (page - 1) * limit;

      // Verify ownership
      const { rows: [job] } = await db.query(
        `SELECT id FROM jobs WHERE id=$1 AND company_id=$2`,
        [req.params.id, user.companyId]
      );
      if (!job) return reply.code(404).send({ error: 'Not found' });

      const whereStatus = statusFilter ? `AND status=$3` : '';
      const params: any[] = [req.params.id, limit, offset];
      if (statusFilter) params.push(statusFilter);

      const { rows } = await db.query(
        `SELECT id, url, status, error_msg, duration_ms, created_at
         FROM url_results WHERE job_id=$1 ${whereStatus}
         ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
        // re-adjust param indices
        statusFilter
          ? [req.params.id, limit, offset, statusFilter]
          : [req.params.id, limit, offset]
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
