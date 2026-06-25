/**
 * Vercel serverless entry point (root-level /api directory).
 *
 * Vercel only auto-detects Serverless Functions inside an `/api` directory
 * at the project root, so this file is the canonical entrypoint. It builds
 * the Fastify app once (module-level singleton inside buildApp) and delegates
 * every request to it via the Node http.IncomingMessage interface.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from '../apps/api/src/app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await buildApp();
  // Strip the /api prefix that Vercel passes through
  req.url = req.url?.replace(/^\/api/, '') || '/';
  app.server.emit('request', req, res);
}
