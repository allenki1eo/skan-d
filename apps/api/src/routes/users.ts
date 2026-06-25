import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { db } from '../db/pool';
import { JwtPayload, CreateUserBody } from '@skan-d/shared';

export default async function usersRoutes(app: FastifyInstance) {
  // Company admins manage their own company's users
  const guard = { preHandler: app.requireRole(['superadmin', 'company_admin']) };

  // GET /users — list users in caller's company
  app.get('/', guard, async (req, reply) => {
    const user = req.user as JwtPayload;
    const { rows } = await db.query(
      `SELECT id, company_id, email, role, created_at FROM users
       WHERE company_id=$1 ORDER BY created_at`,
      [user.companyId]
    );
    reply.send(rows);
  });

  // POST /users — invite a new operator within the same company
  app.post<{ Body: CreateUserBody }>('/', {
    ...guard,
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
    const caller = req.user as JwtPayload;
    const { email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO users (company_id, email, password_hash, role) VALUES ($1,$2,$3,$4)
       RETURNING id, company_id, email, role, created_at`,
      [caller.companyId, email, hash, role]
    );
    reply.code(201).send(rows[0]);
  });

  // DELETE /users/:id
  app.delete<{ Params: { id: string } }>('/:id', guard, async (req, reply) => {
    const caller = req.user as JwtPayload;
    const result = await db.query(
      `DELETE FROM users WHERE id=$1 AND company_id=$2`,
      [req.params.id, caller.companyId]
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Not found' });
    reply.send({ ok: true });
  });
}
