import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { automationQueue, DecodeJobData, AutomationJobData } from '../queue';
import { downloadBuffer, deleteObject } from '../s3';
import { pdfToImages } from '../lib/pdf';
import { decodeQrCodes } from '../lib/qr';
import { db } from '../db';
import { getRedis } from '../redis';
import { v4 as uuidv4 } from 'uuid';

const DECODE_CONCURRENCY = parseInt(process.env.DECODE_CONCURRENCY || '8', 10);

const worker = new Worker<DecodeJobData>(
  'qr-decode',
  async (job: Job<DecodeJobData>) => {
    const { jobId, companyId, pdfKey } = job.data;

    await db.query(`UPDATE jobs SET status='decoding' WHERE id=$1`, [jobId]);

    const pdfBuffer = await downloadBuffer(pdfKey);
    const pages = await pdfToImages(pdfBuffer);

    const allUrls: string[] = [];
    for (const page of pages) {
      const decoded = await decodeQrCodes(page.buffer, page.pageNum);
      allUrls.push(...decoded.map((d) => d.url));
    }

    if (allUrls.length === 0) {
      await db.query(
        `UPDATE jobs SET status='failed', completed_at=NOW() WHERE id=$1`,
        [jobId]
      );
      return;
    }

    const { rows: [jobRow] } = await db.query(
      `SELECT confirm_selector, wait_for_navigation, block_resources FROM jobs WHERE id=$1`,
      [jobId]
    );

    const urlIds: string[] = allUrls.map(() => uuidv4());

    await db.query(`UPDATE jobs SET total=$1, decoded=$1, status='running' WHERE id=$2`, [
      allUrls.length,
      jobId,
    ]);

    const placeholders = allUrls.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
    const values = allUrls.flatMap((url, i) => [urlIds[i], jobId, url]);
    await db.query(`INSERT INTO url_results (id, job_id, url) VALUES ${placeholders}`, values);

    const automationJobs = allUrls.map((url, i) => ({
      name: 'click-confirm',
      data: {
        jobId,
        companyId,
        urlResultId: urlIds[i],
        url,
        confirmSelector: jobRow.confirm_selector,
        waitForNavigation: jobRow.wait_for_navigation,
        blockResources: jobRow.block_resources,
      } as AutomationJobData,
      opts: {
        attempts: 2,
        backoff: { type: 'fixed' as const, delay: 2000 },
        group: { id: companyId },
      },
    }));

    await automationQueue.addBulk(automationJobs);
    await deleteObject(pdfKey);
  },
  {
    connection: getRedis(),
    concurrency: DECODE_CONCURRENCY,
  }
);

worker.on('failed', (job, err) => {
  console.error(`[decode] Job ${job?.id} failed:`, err.message);
});

console.log(`[decode-worker] concurrency=${DECODE_CONCURRENCY}`);
