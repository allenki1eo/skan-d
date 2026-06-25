/**
 * Vercel serverless entry point.
 * Builds the Fastify app once (module-level singleton) and delegates
 * all requests to it via the Node http.IncomingMessage interface.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from '../src/app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await buildApp();
  // Strip the /api prefix that Vercel passes through
  req.url = req.url?.replace(/^\/api/, '') || '/';
  app.server.emit('request', req, res);
}
