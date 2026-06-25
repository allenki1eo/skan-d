import { FastifyInstance } from 'fastify';
import { db } from '../db/pool';
import { CreateCompanyBody, CreateUserBody, JwtPayload } from '@skan-d/shared';
import bcrypt from 'bcrypt';

export default async function companiesRoutes(app: FastifyInstance) {
  // All routes require superadmin
  const guard = { preHandler: app.requireRole(['superadmin']) };

  // GET /companies
  app.get('/', guard, async (_req, reply) => {
    const { rows } = await db.query(
      `SELECT id, name, slug, quota_batch_size, quota_concurrency, quota_monthly_urls, active, created_at
       FROM companies ORDER BY created_at DESC`
    );
    reply.send(rows);
  });

  // POST /companies
  app.post<{ Body: CreateCompanyBody }>('/', guard, {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'slug'],
        properties: {
          name: { type: 'string', minLength: 2 },
          slug: { type: 'string', pattern: '^[a-z0-9-]+$' },
          quotaBatchSize: { type: 'integer', minimum: 1, default: 1000 },
          quotaConcurrency: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          quotaMonthlyUrls: { type: 'integer', minimum: 1, default: 50000 },
        },
      },
    },
  }, async (req, reply) => {
    const { name, slug, quotaBatchSize = 1000, quotaConcurrency = 20, quotaMonthlyUrls = 50000 } = req.body;
    const { rows } = await db.query(
      `INSERT INTO companies (name, slug, quota_batch_size, quota_concurrency, quota_monthly_urls)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, slug, quotaBatchSize, quotaConcurrency, quotaMonthlyUrls]
    );
    reply.code(201).send(rows[0]);
  });

  // PATCH /companies/:id
  app.patch<{ Params: { id: string }; Body: Partial<CreateCompanyBody> & { active?: boolean } }>(
    '/:id', guard, async (req, reply) => {
      const { name, slug, quotaBatchSize, quotaConcurrency, quotaMonthlyUrls, active } = req.body;
      const { rows } = await db.query(
        `UPDATE companies SET
          name = COALESCE($1, name),
          slug = COALESCE($2, slug),
          quota_batch_size = COALESCE($3, quota_batch_size),
          quota_concurrency = COALESCE($4, quota_concurrency),
          quota_monthly_urls = COALESCE($5, quota_monthly_urls),
          active = COALESCE($6, active)
        WHERE id = $7 RETURNING *`,
        [name, slug, quotaBatchSize, quotaConcurrency, quotaMonthlyUrls, active, req.params.id]
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
      reply.send(rows[0]);
    }
  );

  // POST /companies/:id/users — create a company_admin or operator for this company
  app.post<{ Params: { id: string }; Body: CreateUserBody }>(
    '/:id/users', guard, {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            role: { type: 'string', enum: ['company_admin', 'operator'] },
          },
        },
      },
    }, async (req, reply) => {
      const { email, password, role } = req.body;
      const hash = await bcrypt.hash(password, 12);
      const { rows } = await db.query(
        `INSERT INTO users (company_id, email, password_hash, role) VALUES ($1,$2,$3,$4)
         RETURNING id, company_id, email, role, created_at`,
        [req.params.id, email, hash, role]
      );
      reply.code(201).send(rows[0]);
    }
  );

  // GET /companies/:id/users
  app.get<{ Params: { id: string } }>('/:id/users', guard, async (req, reply) => {
    const { rows } = await db.query(
      `SELECT id, company_id, email, role, created_at FROM users WHERE company_id=$1`,
      [req.params.id]
    );
    reply.send(rows);
  });
}
