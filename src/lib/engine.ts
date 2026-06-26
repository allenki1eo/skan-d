/**
 * BaleTrack Pro — PDF & QR processing engine.
 *
 * Responsibilities:
 *  1. Count pages in an uploaded PDF.
 *  2. Render each allowed page to a canvas image.
 *  3. Decode QR codes found on the page (jsqr, grid-split for multi-QR).
 *  4. For each decoded URL, call the TCB accept hook (currently a stub).
 *
 * The TCB accept hook is intentionally left as a stub. See `acceptBaleOnTCB`
 * below for the integration point a real backend developer must fill in once
 * they have the actual HTML of the TCB "Accept" page.
 */
// pdfjs-dist needs a canvas factory for Node. We use the `canvas` package
// (node-canvas) and a custom NodeCanvasFactory.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
// Worker is required by pdfjs. In Node we use the fake worker.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).globalWorkerOptions.workerSrc = ''
import { createCanvas, Canvas, Image, CanvasRenderingContext2D } from 'canvas'
import jsQR from 'jsqr'

// ────────────────────────────────────────────────────────────────────────
// Node canvas factory for pdfjs
// ────────────────────────────────────────────────────────────────────────
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height)
    return { canvas, context: canvas.getContext('2d') }
  }
  reset(contextAndCanvas: { canvas: Canvas; context: CanvasRenderingContext2D }, width: number, height: number) {
    contextAndCanvas.canvas.width = width
    contextAndCanvas.canvas.height = height
  }
  destroy(contextAndCanvas: { canvas: Canvas; context: CanvasRenderingContext2D }) {
    contextAndCanvas.canvas.width = 0
    contextAndCanvas.canvas.height = 0
  }
}

const factory = new NodeCanvasFactory()

/**
 * Count the pages in a PDF file (no rendering, very fast).
 */
export async function countPdfPages(buffer: Uint8Array): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = await (pdfjs as any).getDocument({ data: buffer, useWorkerFetch: false, isEvalSupported: false }).promise
  const n = doc.numPages
  await doc.destroy()
  return n
}

export type DecodedQR = { url: string; pageNumber: number; x: number; y: number }

/**
 * Decode every QR code on the given page range (1-indexed, inclusive).
 *
 * jsQR only finds ONE QR per image. To find multiple QRs per page (TCB PDFs
 * typically have 6-12 QR codes per page) we split each page into a grid and
 * scan each cell independently. This is simple and reliable for grids of QR
 * codes laid out in rows/columns (which is how TCB prints them).
 */
export async function decodeQRCodesFromPdf(
  buffer: Uint8Array,
  fromPage: number,
  toPage: number,
  onProgress?: (page: number, found: number) => void,
): Promise<DecodedQR[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = await (pdfjs as any).getDocument({ data: buffer, useWorkerFetch: false, isEvalSupported: false }).promise
  const results: DecodedQR[] = []

  try {
    for (let page = fromPage; page <= toPage; page++) {
      const pdfPage = await doc.getPage(page)
      const viewport = pdfPage.getViewport({ scale: 2.0 }) // 2x for sharper QRs
      const width = Math.floor(viewport.width)
      const height = Math.floor(viewport.height)
      const { canvas, context } = factory.create(width, height)

      // pdfjs renders PDF content into our node-canvas
      await pdfPage.render({ canvasContext: context, viewport, canvasFactory: factory }).promise

      const imgData = context.getImageData(0, 0, width, height)
      const pageFound = scanImageDataGridForQRs(imgData, page)
      results.push(...pageFound)

      onProgress?.(page, pageFound.length)

      // free memory
      factory.destroy({ canvas, context })
      pdfPage.cleanup()
    }
  } finally {
    await doc.destroy()
  }

  return results
}

/**
 * Scan a single ImageData for QR codes using a grid-split approach.
 * Splits the image into a 4x4 grid of cells and scans each cell. This catches
 * multiple QR codes per page (jsQR only finds the first QR in a full image).
 */
function scanImageDataGridForQRs(imgData: ImageData, pageNumber: number): DecodedQR[] {
  const { width, height, data } = imgData
  const found: DecodedQR[] = []
  const seen = new Set<string>()

  const GRID = 4
  const cellW = Math.floor(width / GRID)
  const cellH = Math.floor(height / GRID)

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = gx * cellW
      const y0 = gy * cellH
      const cellImg = extractSubImageData(data, width, x0, y0, cellW, cellH)
      const code = jsQR(cellImg.data, cellImg.width, cellImg.height, { inversionAttempts: 'attemptBoth' })
      if (code && code.data && !seen.has(code.data)) {
        seen.add(code.data)
        found.push({
          url: code.data,
          pageNumber,
          x: x0 + code.location.topLeftCorner.x,
          y: y0 + code.location.topLeftCorner.y,
        })
      }
    }
  }

  // If grid found nothing, try the whole image once (covers full-page single QR)
  if (found.length === 0) {
    const code = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
    if (code && code.data) {
      found.push({
        url: code.data,
        pageNumber,
        x: code.location.topLeftCorner.x,
        y: code.location.topLeftCorner.y,
      })
    }
  }

  return found
}

/** Extract a sub-image (copy) from a larger RGBA buffer. */
function extractSubImageData(
  data: Uint8ClampedArray,
  fullWidth: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): ImageData {
  const sub = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const srcOffset = ((y0 + y) * fullWidth + x0) * 4
    const dstOffset = y * w * 4
    sub.set(data.subarray(srcOffset, srcOffset + w * 4), dstOffset)
  }
  return new ImageData(sub, w, h)
}

// ────────────────────────────────────────────────────────────────────────
// TCB ACCEPT HOOK  ──  THE INTEGRATION POINT
// ────────────────────────────────────────────────────────────────────────
//
// This is the ONE function a backend developer needs to implement to make
// BaleTrack Pro actually talk to the Tanzania Cotton Board (TCB) portal.
//
// As discussed in the planning chat:
//   1. The user pastes a "device registration" URL into the dashboard.
//   2. Your server visits that URL with `requests.Session()` / `fetch` and
//      keeps the cookie it sets — this is `sessionCookie` below.
//   3. For every QR code decoded from the PDF, the server opens the decoded
//      URL (a TCB page showing one bale), then programmatically "clicks" the
//      Accept button.
//
// To implement this for real, the developer needs to:
//   a. Open one of the TCB QR-code links in a desktop browser.
//   b. Right-click the Accept button → Inspect → look at the HTML.
//   c. Determine if it's:
//        - A simple <a href="..."> link          → just GET that href
//        - A <form> with method=POST             → POST the form data
//        - A <button onclick="..."> JS handler   → read the JS, replicate the XHR/fetch
//   d. Replicate that exact request here, sending the session cookie.
//
// While the stub is in place, `acceptBaleOnTCB` returns a deterministic
// "accepted" result so the rest of the pipeline (job tracking, reporting,
// quota usage) can be fully tested end-to-end.

export type TcbAcceptResult = {
  ok: boolean
  message: string
  httpStatus?: number
}

/**
 * ⚠️ STUB IMPLEMENTATION — replace with real TCB integration.
 *
 * @param qrUrl       The URL decoded from the QR code (a TCB bale page).
 * @param sessionCookie  The cookie string obtained by visiting the
 *                       device-registration URL once at job start.
 * @returns           { ok, message } describing whether TCB accepted the bale.
 */
export async function acceptBaleOnTCB(
  qrUrl: string,
  sessionCookie: string,
): Promise<TcbAcceptResult> {
  // ── TODO: REAL IMPLEMENTATION ────────────────────────────────────────
  //
  // Example real implementation (commented out) once you know the TCB
  // page's Accept button is a simple form POST:
  //
  // const pageRes = await fetch(qrUrl, {
  //   headers: { Cookie: sessionCookie, 'User-Agent': 'BaleTrackPro/1.0' },
  // })
  // if (!pageRes.ok) return { ok: false, message: `TCB page ${pageRes.status}`, httpStatus: pageRes.status }
  // const html = await pageRes.text()
  // const match = html.match(/<form[^>]*action="([^"]+)"[^>]*>/i)
  // if (!match) return { ok: false, message: 'No form found on TCB page' }
  // const acceptUrl = new URL(match[1], qrUrl).toString()
  // const acceptRes = await fetch(acceptUrl, {
  //   method: 'POST',
  //   headers: {
  //     Cookie: sessionCookie,
  //     'Content-Type': 'application/x-www-form-urlencoded',
  //     'User-Agent': 'BaleTrackPro/1.0',
  //   },
  //   body: 'action=accept',
  // })
  // return {
  //   ok: acceptRes.ok,
  //   message: acceptRes.ok ? 'Accepted by TCB' : `TCB returned ${acceptRes.status}`,
  //   httpStatus: acceptRes.status,
  // }
  //
  // ── STUB BEHAVIOUR (safe for demo) ───────────────────────────────────
  //
  // Deterministic 95% success rate so the rest of the pipeline can be
  // tested without ever touching TCB. Each call sleeps pacingMs so the
  // progress UI feels realistic.
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 100))

  // Simulate rare TCB-side errors (e.g. invalid lot number)
  const ok = Math.random() > 0.05
  return {
    ok,
    message: ok
      ? 'Accepted by TCB (stub)'
      : 'TCB returned 404 — lot number not found (stub)',
    httpStatus: ok ? 200 : 404,
  }
}

/**
 * Visit the TCB device-registration URL once and return the cookie string
 * that subsequent acceptBaleOnTCB calls must send.
 *
 * Also a stub: real implementation should use `fetch` with a cookie jar
 * (or `requests.Session` equivalent). For now we return a fake cookie so
 * the rest of the flow works.
 */
export async function registerTcbDevice(regUrl: string): Promise<{
  ok: boolean
  cookie: string
  message: string
}> {
  // ── TODO: REAL IMPLEMENTATION ────────────────────────────────────────
  //
  // const res = await fetch(regUrl, { headers: { 'User-Agent': 'BaleTrackPro/1.0' } })
  // const setCookie = res.headers.get('set-cookie') || ''
  // return { ok: res.ok, cookie: setCookie.split(';')[0], message: res.ok ? 'Registered' : `HTTP ${res.status}` }
  //
  // ── STUB ─────────────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 300))
  if (!regUrl.startsWith('http')) {
    return { ok: false, cookie: '', message: 'Invalid URL' }
  }
  return {
    ok: true,
    cookie: 'tcb_device=STUB-DEVICE-ID-' + Math.random().toString(36).slice(2, 10),
    message: 'Device registered (stub)',
  }
}
