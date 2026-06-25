// Roles
export type Role = 'superadmin' | 'company_admin' | 'operator';

// Auth
export interface JwtPayload {
  sub: string;       // user id
  companyId: string;
  role: Role;
  email: string;
}

// Company
export interface Company {
  id: string;
  name: string;
  slug: string;
  quotaBatchSize: number;
  quotaConcurrency: number;
  quotaMonthlyUrls: number;
  active: boolean;
  createdAt: string;
}

// User
export interface User {
  id: string;
  companyId: string;
  email: string;
  role: Role;
  createdAt: string;
}

// Job
export type JobStatus = 'pending' | 'decoding' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  companyId: string;
  userId: string;
  status: JobStatus;
  total: number;
  decoded: number;
  success: number;
  failed: number;
  skipped: number;
  confirmSelector: string;
  waitForNavigation: boolean;
  blockResources: boolean;
  createdAt: string;
  completedAt?: string;
}

// URL Result
export type UrlStatus = 'pending' | 'success' | 'no_button' | 'timeout' | 'error';

export interface UrlResult {
  id: string;
  jobId: string;
  url: string;
  status: UrlStatus;
  errorMsg?: string;
  durationMs?: number;
  createdAt: string;
}

// WebSocket events
export interface JobProgressEvent {
  jobId: string;
  total: number;
  decoded: number;
  success: number;
  failed: number;
  skipped: number;
  status: JobStatus;
  recentResults: Pick<UrlResult, 'url' | 'status' | 'durationMs' | 'errorMsg'>[];
}

// API request/response shapes
export interface CreateCompanyBody {
  name: string;
  slug: string;
  quotaBatchSize?: number;
  quotaConcurrency?: number;
  quotaMonthlyUrls?: number;
}

export interface CreateUserBody {
  email: string;
  password: string;
  role: Role;
}

export interface CreateJobBody {
  confirmSelector: string;
  waitForNavigation?: boolean;
  blockResources?: boolean;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: Omit<User, 'companyId'> & { company: Pick<Company, 'id' | 'name' | 'slug'> };
}
