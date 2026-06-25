import sharp from 'sharp';

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

export interface PageImage {
  pageNum: number;
  buffer: Buffer;
}

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
    const compressed = await sharp(pngBuffer).png({ compressionLevel: 3 }).toBuffer();
    results.push({ pageNum: i, buffer: compressed });
  }

  return results;
}
