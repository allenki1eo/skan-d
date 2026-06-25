/**
 * Local development entry point (not used on Vercel).
 * Starts the Fastify server on PORT.
 */
import 'dotenv/config';
import { buildApp } from './app';

async function start() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API listening on :${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
