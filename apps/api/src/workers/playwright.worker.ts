/**
 * Playwright Automation Worker
 * Maintains a persistent Chromium browser — no cold-start per URL.
 * Resources (images/fonts/media) are blocked for speed.
 * Progress is pushed to Redis pub/sub → Socket.IO → client.
 */
import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { chromium, Browser, BrowserContext } from 'playwright';
import { AutomationJobData } from '../queue';
import { getRedis } from '../lib/redis';
const redis = getRedis();
import { db } from '../db/pool';

const CONCURRENCY = parseInt(process.env.PW_CONCURRENCY || '20', 10);
const BLOCKED_RESOURCES = new Set(['image', 'font', 'media', 'stylesheet']);
const NAVIGATION_TIMEOUT = 10_000;
const CLICK_TIMEOUT = 8_000;

let browser: Browser;
// One context per company session within this worker (shared cookies if needed)
const contexts = new Map<string, BrowserContext>();

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });
  }
  return browser;
}

async function getContext(companyId: string): Promise<BrowserContext> {
  if (!contexts.has(companyId)) {
    const b = await getBrowser();
    const ctx = await b.newContext({
      ignoreHTTPSErrors: true,
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    contexts.set(companyId, ctx);
  }
  return contexts.get(companyId)!;
}

async function processUrl(data: AutomationJobData): Promise<{ status: string; durationMs: number }> {
  const { url, confirmSelector, waitForNavigation, blockResources, companyId } = data;
  const ctx = await getContext(companyId);
  const page = await ctx.newPage();
  const start = Date.now();

  try {
    if (blockResources) {
      await page.route('**/*', (route) => {
        if (BLOCKED_RESOURCES.has(route.request().resourceType())) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT,
    });

    const btn = page.locator(confirmSelector).first();
    await btn.waitFor({ state: 'visible', timeout: CLICK_TIMEOUT });
    await btn.click({ timeout: CLICK_TIMEOUT });

    if (waitForNavigation) {
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {
        // non-fatal — page may not navigate after click
      });
    }

    return { status: 'success', durationMs: Date.now() - start };
  } catch (err: any) {
    const msg: string = err.message || '';
    if (msg.includes('waitFor') || msg.includes('Timeout')) {
      return { status: 'no_button', durationMs: Date.now() - start };
    }
    if (msg.includes('timeout')) {
      return { status: 'timeout', durationMs: Date.now() - start };
    }
    throw err;
  } finally {
    await page.close();
  }
}

const worker = new Worker<AutomationJobData>(
  'automation',
  async (job: Job<AutomationJobData>) => {
    const { jobId, urlResultId, companyId } = job.data;
    let outcome: { status: string; durationMs: number };

    try {
      outcome = await processUrl(job.data);
    } catch (err: any) {
      outcome = { status: 'error', durationMs: 0 };
      await db.query(
        `UPDATE url_results SET status='error', error_msg=$1, duration_ms=$2 WHERE id=$3`,
        [err.message?.slice(0, 500), 0, urlResultId]
      );
    }

    // Update url_result
    await db.query(
      `UPDATE url_results SET status=$1, duration_ms=$2 WHERE id=$3`,
      [outcome.status, outcome.durationMs, urlResultId]
    );

    // Increment job counters atomically
    const col = outcome.status === 'success' ? 'success' : 'failed';
    const { rows: [updated] } = await db.query(
      `UPDATE jobs
       SET ${col} = ${col} + 1
       WHERE id = $1
       RETURNING success, failed, skipped, total, status`,
      [jobId]
    );

    const done = updated.success + updated.failed + updated.skipped;

    // Mark job complete when all URLs processed
    if (done >= updated.total) {
      await db.query(
        `UPDATE jobs SET status='completed', completed_at=NOW() WHERE id=$1 AND status='running'`,
        [jobId]
      );
      updated.status = 'completed';
    }

    // Publish progress to Redis so Socket.IO can fan out to connected clients
    await redis.publish(
      `job:${jobId}`,
      JSON.stringify({
        jobId,
        total: updated.total,
        success: updated.success,
        failed: updated.failed,
        skipped: updated.skipped,
        status: updated.status,
        recentResult: {
          url: job.data.url,
          status: outcome.status,
          durationMs: outcome.durationMs,
        },
      })
    );
  },
  {
    connection: redis,
    concurrency: CONCURRENCY,
  }
);

worker.on('failed', (job, err) => {
  console.error(`[playwright] job ${job?.id} error:`, err.message);
});

// Graceful shutdown
async function shutdown() {
  await worker.close();
  for (const ctx of contexts.values()) await ctx.close();
  if (browser) await browser.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`[playwright-worker] Running with concurrency=${CONCURRENCY}`);
