import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../db/pool';
import { LoginBody, JwtPayload } from '@skan-d/shared';

export default async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post<{ Body: LoginBody }>('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body;

    const { rows } = await db.query(
      `SELECT u.*, c.name AS company_name, c.slug AS company_slug
       FROM users u JOIN companies c ON c.id = u.company_id
       WHERE u.email = $1`,
      [email]
    );
    const user = rows[0];
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' });

    const payload: JwtPayload = {
      sub: user.id,
      companyId: user.company_id,
      role: user.role,
      email: user.email,
    };

    const accessToken = app.jwt.sign(payload);

    // Store refresh token
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    reply
      .setCookie('refresh_token', rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/auth/refresh',
        expires: expiresAt,
      })
      .send({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: user.created_at,
          company: {
            id: user.company_id,
            name: user.company_name,
            slug: user.company_slug,
          },
        },
      });
  });

  // POST /auth/refresh
  app.post('/refresh', async (req, reply) => {
    const rawToken = req.cookies?.refresh_token;
    if (!rawToken) return reply.code(401).send({ error: 'No refresh token' });

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const { rows } = await db.query(
      `SELECT rt.*, u.company_id, u.role, u.email
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    );
    const token = rows[0];
    if (!token) return reply.code(401).send({ error: 'Invalid refresh token' });

    const payload: JwtPayload = {
      sub: token.user_id,
      companyId: token.company_id,
      role: token.role,
      email: token.email,
    };

    reply.send({ accessToken: app.jwt.sign(payload) });
  });

  // POST /auth/logout
  app.post('/logout', async (req, reply) => {
    const rawToken = req.cookies?.refresh_token;
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await db.query('DELETE FROM refresh_tokens WHERE token_hash=$1', [tokenHash]);
    }
    reply.clearCookie('refresh_token', { path: '/auth/refresh' }).send({ ok: true });
  });
}
