// Vercel serverless entry. Hosts the Fastify app without the native decode route
// (the PWA decodes PDFs/images in-browser on serverless). Storage is Turso, so the
// function is fully stateless between invocations.
//
// Note: we bridge via app.inject() rather than re-emitting the raw request into
// Fastify's HTTP server. Vercel's Node runtime pre-reads and parses the request
// body (req.body), leaving the stream consumed — re-emitting such a request makes
// Fastify wait forever for a body that will never arrive, hanging every POST.
import { buildApp } from '../server/src/app.js';

let appPromise;
function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const app = await buildApp({ withDecode: false });
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

function payloadFrom(req) {
  const body = req.body;
  if (body === undefined || body === null) return undefined;
  if (Buffer.isBuffer(body) || typeof body === 'string') return body;
  return JSON.stringify(body);
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    const headers = { ...req.headers };
    delete headers['content-length']; // inject recomputes it for the (re)serialized payload
    const result = await app.inject({
      method: req.method,
      url: req.url,
      headers,
      payload: payloadFrom(req),
      remoteAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
    });
    res.statusCode = result.statusCode;
    for (const [key, value] of Object.entries(result.headers)) {
      if (key.toLowerCase() === 'transfer-encoding') continue;
      res.setHeader(key, value);
    }
    res.end(result.rawPayload);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
}
