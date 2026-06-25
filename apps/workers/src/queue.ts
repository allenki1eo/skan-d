import { Queue } from 'bullmq';
import { getRedis } from './redis';

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
