import { nanoid } from 'nanoid';
import { get, run } from '../db.js';
import { decodeBuffer } from '../decode.js';
import { insertBales } from './jobs.js';

const getJob = (id) => get('SELECT * FROM jobs WHERE id = ?', [id]);

/**
 * Server-side PDF/image QR decoding (uses a native canvas + wasm).
 * Only registered on the persistent server — on Vercel the PWA decodes in-browser
 * and posts URLs to /api/jobs, keeping the serverless function free of native deps.
 */
export default async function uploadRoutes(app) {
  app.post('/api/jobs/upload', async (req, reply) => {
    const parts = req.parts();
    let name = null;
    const allUrls = [];
    let sawFile = false;
    for await (const part of parts) {
      if (part.type === 'file') {
        sawFile = true;
        const buffer = await part.toBuffer();
        try {
          const urls = await decodeBuffer(buffer, part.mimetype, part.filename);
          allUrls.push(...urls);
        } catch (err) {
          return reply.code(422).send({ error: `Failed to decode ${part.filename}: ${err.message}` });
        }
        if (!name) name = part.filename;
      } else if (part.fieldname === 'name') {
        name = part.value;
      }
    }
    if (!sawFile) return reply.code(400).send({ error: 'No file uploaded' });

    const jobId = nanoid();
    const isPdf = allUrls.length && /pdf/i.test(name || '');
    await run('INSERT INTO jobs (id, name, source) VALUES (?, ?, ?)', [jobId, name || 'Upload', isPdf ? 'pdf' : 'image']);
    const added = await insertBales(jobId, allUrls);
    const job = await getJob(jobId);
    return { id: jobId, name: job.name, source: job.source, decoded: allUrls.length, added };
  });
}
