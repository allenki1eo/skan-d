CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  quota_batch_size    INT NOT NULL DEFAULT 1000,
  quota_concurrency   INT NOT NULL DEFAULT 20,
  quota_monthly_urls  INT NOT NULL DEFAULT 50000,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE user_role AS ENUM ('superadmin', 'company_admin', 'operator');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'operator',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX users_company_idx ON users(company_id);

CREATE TYPE job_status AS ENUM ('pending', 'decoding', 'running', 'completed', 'failed');

CREATE TABLE jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id),
  status              job_status NOT NULL DEFAULT 'pending',
  total               INT NOT NULL DEFAULT 0,
  decoded             INT NOT NULL DEFAULT 0,
  success             INT NOT NULL DEFAULT 0,
  failed              INT NOT NULL DEFAULT 0,
  skipped             INT NOT NULL DEFAULT 0,
  confirm_selector    TEXT NOT NULL DEFAULT 'button[type="submit"]',
  wait_for_navigation BOOLEAN NOT NULL DEFAULT TRUE,
  block_resources     BOOLEAN NOT NULL DEFAULT TRUE,
  pdf_key             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX jobs_company_idx ON jobs(company_id);
CREATE INDEX jobs_status_idx  ON jobs(status);

CREATE TYPE url_status AS ENUM ('pending', 'success', 'no_button', 'timeout', 'error');

CREATE TABLE url_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  status      url_status NOT NULL DEFAULT 'pending',
  error_msg   TEXT,
  duration_ms INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX url_results_job_idx ON url_results(job_id);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed: default superadmin company + user (password: Admin1234!)
INSERT INTO companies (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Platform', 'platform');

INSERT INTO users (company_id, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@skan-d.io',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCjAfDMFNOI.BNHnfipxHMq',
  'superadmin'
);
