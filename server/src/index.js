import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fs from 'node:fs';
import { config } from './config.js';
import './db.js';
import deviceRoutes from './routes/devices.js';
import jobRoutes from './routes/jobs.js';

const app = Fastify({ logger: { level: 'info' }, bodyLimit: 30 * 1024 * 1024 });

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
}));

await app.register(deviceRoutes);
await app.register(jobRoutes);

// Serve the built PWA if present; fall back to a friendly notice in dev.
if (fs.existsSync(config.webDist)) {
  await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
} else {
  app.get('/', async () => ({
    ok: true,
    message: 'API running. Build the web app (npm run build) or run "npm run dev" for the Vite dev server.',
  }));
}

app
  .listen({ port: config.port, host: '0.0.0.0' })
  .then(() => app.log.info(`baletrack-auto listening on :${config.port} → TCB ${config.tcbBaseUrl}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
