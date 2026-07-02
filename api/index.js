// Vercel serverless entry. Hosts the Fastify app without the native decode route
// (the PWA decodes PDFs/images in-browser on serverless). Storage is Turso, so the
// function is fully stateless between invocations.
import { buildApp } from '../server/src/app.js';

let appPromise;
async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const app = await buildApp({ withDecode: false });
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
