import sharp from 'sharp';

// pdfjs-dist requires a canvas implementation in Node
// We use the `canvas` npm package as the backend
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

export interface PageImage {
  pageNum: number;
  buffer: Buffer; // PNG buffer
}

/**
 * Rasterise every page of a PDF into PNG buffers.
 * Scale controls DPI: 2.0 ≈ 192 DPI — enough for QR decode without being excessive.
 */
export async function pdfToImages(pdfBuffer: Buffer, scale = 2.0): Promise<PageImage[]> {
  const { createCanvas } = require('canvas');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const results: PageImage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const pngBuffer = canvas.toBuffer('image/png');
    // Compress slightly with sharp to reduce memory pressure
    const compressed = await sharp(pngBuffer).png({ compressionLevel: 3 }).toBuffer();
    results.push({ pageNum: i, buffer: compressed });
  }

  return results;
}
