# Skan-D — QR Code Automation Platform

Upload a PDF of QR codes and automatically visit every URL, clicking the confirm button on each page — at scale, concurrently, as fast as possible.

## Architecture

```
PDF Upload → S3 → pdfjs-dist (rasterise) → zxing-wasm (decode QR) → BullMQ → Playwright workers → PostgreSQL
                                                                                        ↓
                                                                             Redis pub/sub → Socket.IO → PWA
```

## Stack

| Layer | Technology |
|---|---|
| API | Fastify + Node 20 |
| Auth | JWT (15m) + httpOnly refresh token |
| Queue | BullMQ + Redis |
| QR Decode | zxing-wasm (WebAssembly) |
| PDF Rasterise | pdfjs-dist + canvas |
| Automation | Playwright (persistent Chromium) |
| Database | PostgreSQL 16 |
| Storage | S3 / MinIO |
| Frontend | React 18 + Vite + Tailwind |
| PWA | Workbox |
| Infra | Docker Compose → K8s |

## Getting Started

### 1. Start infrastructure

```bash
docker-compose up -d postgres redis minio minio-init
```

### 2. Set up environment

```bash
cp apps/api/.env.example apps/api/.env
```

### 3. Run migrations

```bash
npm run db:migrate
```

Default superadmin: `admin@skan-d.io` / `Admin1234!`

### 4. Start API + workers

```bash
# Terminal 1 — API server
cd apps/api && npm run dev

# Terminal 2 — QR decode worker
cd apps/api && npm run worker:decode

# Terminal 3 — Playwright automation worker
cd apps/api && npm run worker:playwright
```

### 5. Start web app

```bash
cd apps/web && npm run dev
```

Open http://localhost:5173

## Running with Docker Compose (full stack)

```bash
docker-compose up --build
```

## Performance

- 1,000 QR codes in a single PDF → decoded in ~20s (8 parallel decode workers)
- 1,000 URLs automated → ~3 min at 20 concurrent Playwright sessions
- Scale Playwright workers (`docker-compose up --scale worker-playwright=5`) for more throughput

## Roles

| Role | Capabilities |
|---|---|
| `superadmin` | Create/suspend companies, set quotas, view all jobs |
| `company_admin` | Manage company users, view company jobs |
| `operator` | Upload PDFs, run batch jobs, download reports |
