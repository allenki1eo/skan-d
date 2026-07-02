import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import { config } from './config.js';
import { initDb } from './db.js';
import deviceRoutes from './routes/devices.js';
import jobRoutes from './routes/jobs.js';

/**
 * Build the Fastify app.
 * @param {object} opts
 * @param {boolean} opts.withDecode - register the native PDF/image decode route.
 *   Enabled on the persistent server; disabled on serverless (Vercel), where the
 *   PWA decodes in-browser so the function stays free of native canvas deps.
 */
export async function buildApp({ withDecode = true } = {}) {
  const app = Fastify({ logger: { level: 'info' }, bodyLimit: 30 * 1024 * 1024 });

  await initDb();
  await app.register(fastifyCookie);
  await app.register(multipart, { limits: { fileSize: 30 * 1024 * 1024, files: 20 } });

  // Optional shared-password gate.
  if (config.appPassword) {
    app.addHook('onRequest', async (req, reply) => {
      if (req.url.startsWith('/api/login') || !req.url.startsWith('/api')) return;
      const token = req.cookies?.bt_auth;
      if (token !== config.appPassword) return reply.code(401).send({ error: 'unauthorized' });
    });
    app.post('/api/login', async (req, reply) => {
      const { password } = req.body || {};
      if (password !== config.appPassword) return reply.code(401).send({ error: 'bad password' });
      reply.setCookie('bt_auth', config.appPassword, { path: '/', httpOnly: true, sameSite: 'lax' });
      return { ok: true };
    });
  }

  app.get('/api/health', async () => ({ ok: true, tcb: config.tcbBaseUrl }));
  app.get('/api/config', async () => ({
    authRequired: Boolean(config.appPassword),
    tcbBaseUrl: config.tcbBaseUrl,
    checkPoints: ['Ginnery', 'Port'],
    serverDecode: withDecode, // tells the PWA whether it must decode client-side
  }));

  await app.register(deviceRoutes);
  await app.register(jobRoutes);

  return app;
}
