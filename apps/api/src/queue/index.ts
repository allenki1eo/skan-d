import { Queue } from 'bullmq';
import { getRedis } from '../lib/redis';

export const decodeQueue = new Queue('qr-decode', { connection: getRedis() });
export const automationQueue = new Queue('automation', { connection: getRedis() });

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
