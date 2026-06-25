import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import authPlugin from './plugins/auth';
import socketioPlugin from './plugins/socketio';
import authRoutes from './routes/auth';
import companiesRoutes from './routes/companies';
import jobsRoutes from './routes/jobs';
import usersRoutes from './routes/users';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

async function start() {
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB per PDF
  });

  await app.register(authPlugin);
  await app.register(socketioPlugin);

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(companiesRoutes, { prefix: '/companies' });
  await app.register(jobsRoutes, { prefix: '/jobs' });
  await app.register(usersRoutes, { prefix: '/users' });

  app.get('/health', async () => ({ ok: true }));

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API listening on :${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
