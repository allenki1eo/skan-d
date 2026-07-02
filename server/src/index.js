import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import { config } from './config.js';
import { buildApp } from './app.js';
import uploadRoutes from './routes/upload.js';

// Persistent-process server: full app + native PDF/image decode + serves the built PWA.
const app = await buildApp({ withDecode: true });
await app.register(uploadRoutes);

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
