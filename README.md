# Bale Track Auto

Automatic cotton-bale tracking for the **Tanzania Cotton Board – CCIS** (`ccis.tcb.go.tz`).

Instead of scanning every lot-space QR code and tapping **Confirm** one bale at a time, this service
decodes a whole QR sheet (or scans with the phone camera) and confirms every bale automatically,
acting as a registered scanning device.

## How it works

The TCB "Cotton Bale Tracking" page is an Angular app. When you open a bale QR it calls a small
JSON API, and the **Confirm** button is just one more call. This service talks to that API directly —
no headless browser button-clicking needed, so it's fast and reliable.

| Action | Request | Notes |
|---|---|---|
| Read a bale's status | `POST /service/baleTracker/track/0/<data>` | `0` = read only, no side effect |
| Confirm a bale | `POST /service/baleTracker/track/1/<data>` | `1` = confirm at this device's check point |
| Register a device | `POST /service/baleTracker/register/<token>` | sets the device session cookie |

`<data>` is the hex token embedded in each QR URL (`…/baletrack/<data>`). A real bale status looks like:

```json
{ "status": 0, "checkPoint": 1, "label": "2704C-96", "checks": [null, null] }
```

`checks` is `[Ginnery, Port]`; a filled slot means already tracked there. A registered device is
assigned a **`checkPoint`** (`1` = Ginnery, `2` = Port) — any session can *read*, but only one with a
check point can *confirm*, which is exactly how the service tells a real device apart from a plain session.

## Getting a device authorized

Auto-confirm needs a registered TCB session. Two supported ways (**Devices** tab):

1. **Register a link** — paste a fresh registration link
   (`https://ccis.tcb.go.tz/baletrack/register/<token>`). The service opens it and registers itself.
2. **Import cookies** — if your phone is already registered, open the site on it, run `document.cookie`
   in the browser console, and paste the result. The service reuses that session.

Use **Verify** on a device (with any bale QR) to confirm it's still authorized — it checks that the
session carries a check point.

## Feeding in bales

- **Upload** a QR-code PDF or a photo of the sheet — every code is decoded server-side.
- **Scan** live with the phone camera in the installed PWA (auto-confirm on scan optional).
- **Paste** bale URLs directly.

Then pick a device and hit **Confirm** (or **Check only** for a safe read-only pass). Progress streams
live over SSE.

## Stack

| Layer | Tech |
|---|---|
| API | Fastify (Node 20, ESM) |
| Storage | Turso / libSQL (`@libsql/client`) — hosted, or a local SQLite file |
| Sessions | `tough-cookie` jar per device, replayed via `undici` + `http-cookie-agent` |
| QR decode | `pdfjs-dist` + `@napi-rs/canvas` rasterise → `zxing-wasm` (multi-symbol) |
| Frontend | React + Vite, installable PWA (`vite-plugin-pwa`), `jsqr` camera scanner |

## Run it

```bash
cp .env.example .env        # optional: set APP_PASSWORD, concurrency, etc.
npm install                 # installs API + PWA deps
npm run build               # builds the PWA into web/dist
npm start                   # serves API + PWA on http://localhost:8080
```

Development (API + Vite dev server with hot reload):

```bash
npm run dev                 # api on :8080, web on :5173 (proxied)
```

## Deploy to Vercel

The app runs on Vercel as a static PWA + a single serverless function, backed by Turso.
Two things differ from self-hosting, handled automatically:

- **QR decoding happens in the browser** (pdf.js + zxing-wasm), so the function needs no native
  canvas — PDFs/images are decoded client-side and only the bale URLs are sent to the API.
- **Confirming is client-driven**: the PWA calls the stateless `POST /api/confirm` endpoint per
  bale (with its own concurrency + progress), instead of the background worker + SSE used when
  self-hosting. No long-lived process required.

Steps:

1. Create a **Turso** database and copy its URL + token. The app creates its tables on
   first boot, or you can provision them up front with [`db/schema.sql`](db/schema.sql):
   `turso db shell <db> < db/schema.sql`.
2. Import the repo into Vercel. In **Settings → Environment Variables** set:
   - `TURSO_DATABASE_URL=libsql://your-db.turso.io`
   - `TURSO_AUTH_TOKEN=your-token`
   - *(optional)* `APP_PASSWORD=…`
3. Deploy. `vercel.json` builds the PWA (`web/dist`) and routes `/api/*` to `api/index.js`.

> Without `TURSO_DATABASE_URL` the function fails fast with a clear message, because Vercel's
> filesystem is read-only and a local SQLite file can't be used there.

The background-worker + SSE run mode (`/api/jobs/:id/run`, `/api/jobs/:id/events`) and server-side
PDF decode (`/api/jobs/upload`) only exist when self-hosting the persistent `npm start` server; they
are intentionally absent from the serverless function.

### Configuration (`.env`)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `TCB_BASE_URL` | `https://ccis.tcb.go.tz` | CCIS base URL |
| `TURSO_DATABASE_URL` | _(local file)_ | Turso libSQL URL; blank → `./data/baletrack.sqlite` |
| `TURSO_AUTH_TOKEN` | _(none)_ | Turso auth token (remote only) |
| `CONFIRM_CONCURRENCY` | `6` | parallel confirm workers |
| `CONFIRM_DELAY_MS` | `150` | delay between requests per worker (be gentle) |
| `APP_PASSWORD` | _(empty)_ | optional shared password gate |

## Safety

- **Check only** mode uses `track/0` and never changes anything — use it to validate a device or sheet.
- Confirm mode only fires `track/1` for bales not already tracked at the device's check point.
- Requests are throttled (`CONFIRM_CONCURRENCY` / `CONFIRM_DELAY_MS`) to stay gentle on the CCIS server.
