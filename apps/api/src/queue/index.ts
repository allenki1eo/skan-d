import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

export const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const decodeQueue = new Queue('qr-decode', { connection: redis });
export const automationQueue = new Queue('automation', { connection: redis });
export const decodeQueueEvents = new QueueEvents('qr-decode', { connection: redis });
export const automationQueueEvents = new QueueEvents('automation', { connection: redis });

export interface DecodeJobData {
  jobId: string;
  companyId: string;
  pdfKey: string;
}

export interface AutomationJobData {
  jobId: string;
  companyId: string;
  urlResultId: string;
  url: string;
  confirmSelector: string;
  waitForNavigation: boolean;
  blockResources: boolean;
}
