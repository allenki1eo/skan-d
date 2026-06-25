import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import companiesRoutes from './routes/companies';
import jobsRoutes from './routes/jobs';
import usersRoutes from './routes/users';

let _app: FastifyInstance | null = null;

export async function buildApp(): Promise<FastifyInstance> {
  if (_app) return _app;

  const app = Fastify({
    logger: process.env.NODE_ENV !== 'production',
    trustProxy: true,
  });

  await app.register(cors, {
    origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024 },
  });

  await app.register(authPlugin);

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(companiesRoutes, { prefix: '/companies' });
  await app.register(jobsRoutes, { prefix: '/jobs' });
  await app.register(usersRoutes, { prefix: '/users' });

  app.get('/health', async () => ({ ok: true }));

  await app.ready();
  _app = app;
  return app;
}
