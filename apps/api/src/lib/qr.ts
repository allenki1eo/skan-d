import sharp from 'sharp';
import { readBarcodesFromImageData } from 'zxing-wasm/reader';

export interface QrResult {
  url: string;
  pageNum?: number;
}

/**
 * Decode all QR codes found in a PNG buffer.
 * Tries the full image first, then subdivides into a grid for dense PDFs.
 */
export async function decodeQrCodes(imageBuffer: Buffer, pageNum?: number): Promise<QrResult[]> {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const imageData = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };

  const results = await readBarcodesFromImageData(imageData, {
    formats: ['QRCode'],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
  });

  return results
    .filter((r) => r.isValid && r.text.startsWith('http'))
    .map((r) => ({ url: r.text, pageNum }));
}
