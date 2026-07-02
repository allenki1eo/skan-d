// In-browser QR decoding for PDFs and images, so the app works on serverless
// (Vercel) with no native server dependencies. PDF pages are rasterised with
// pdf.js and scanned with zxing-wasm (which returns every QR on a page).
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { readBarcodesFromImageData, setZXingModuleOverrides } from 'zxing-wasm/reader';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
// Load the wasm from our own bundle instead of a CDN.
setZXingModuleOverrides({ locateFile: (p) => (p.endsWith('.wasm') ? zxingWasmUrl : p) });

async function scan(imageData) {
  const results = await readBarcodesFromImageData(imageData, {
    formats: ['QRCode'],
    tryHarder: true,
    maxNumberOfSymbols: 255,
  });
  return results.map((r) => r.text).filter(Boolean);
}

async function decodePdf(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const found = new Set();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    // Union a couple of resolutions so dense/blurry sheets still resolve.
    for (const scale of [3.0, 4.5]) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      await page.render({ canvasContext: ctx, viewport }).promise;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (const t of await scan(img)) found.add(t);
    }
    page.cleanup();
  }
  await doc.destroy();
  return [...found];
}

async function decodeImage(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return scan(img);
}

/** Decode all QR codes from a File (PDF or image). Returns an array of URLs/text. */
export async function decodeFile(file) {
  const isPdf = file.type.includes('pdf') || /\.pdf$/i.test(file.name);
  return isPdf ? decodePdf(file) : decodeImage(file);
}

/** Decode multiple files, returning the de-duplicated union of results. */
export async function decodeFiles(files) {
  const all = new Set();
  for (const f of files) {
    for (const t of await decodeFile(f)) all.add(t);
  }
  return [...all];
}
