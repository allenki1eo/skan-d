import { createCanvas, Image, ImageData as NapiImageData } from '@napi-rs/canvas';
import { readBarcodesFromImageData } from 'zxing-wasm/reader';

// pdfjs legacy build runs in Node without a DOM.
let pdfjs;
async function getPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjs;
}

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(cw, width, height) {
    cw.canvas.width = width;
    cw.canvas.height = height;
  }
  destroy(cw) {
    cw.canvas.width = 0;
    cw.canvas.height = 0;
  }
}

async function scanImageData({ data, width, height }) {
  const results = await readBarcodesFromImageData(
    { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height },
    { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 255 },
  );
  return results.map((r) => r.text).filter(Boolean);
}

/** Decode every QR code from a PDF buffer. Renders each page at high DPI, scans all symbols. */
export async function decodePdf(buffer) {
  const { getDocument } = await getPdfjs();
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    canvasFactory: new NodeCanvasFactory(),
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const found = new Set();
  // Render each page at a couple of resolutions; dense/blurry QR grids sometimes
  // only resolve cleanly at higher DPI, so we union the results.
  const scales = [3.0, 4.5];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    for (const scale of scales) {
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      for (const text of await scanImageData(imageData)) found.add(text);
    }
    page.cleanup();
  }
  await doc.destroy();
  return [...found];
}

/** Decode QR codes from an image buffer (jpg/png/webp). */
export async function decodeImage(buffer) {
  const img = new Image();
  img.src = buffer;
  const width = img.width;
  const height = img.height;
  if (!width || !height) return [];
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  return scanImageData(imageData);
}

export async function decodeBuffer(buffer, mimetype = '', filename = '') {
  const isPdf =
    mimetype.includes('pdf') ||
    /\.pdf$/i.test(filename) ||
    (buffer.length > 4 && buffer.slice(0, 5).toString('latin1') === '%PDF-');
  return isPdf ? decodePdf(buffer) : decodeImage(buffer);
}

// keep NapiImageData referenced for environments that expect it
export const _ImageData = NapiImageData;
