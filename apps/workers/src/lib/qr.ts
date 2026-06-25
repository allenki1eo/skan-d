import sharp from 'sharp';
import { readBarcodesFromImageData } from 'zxing-wasm/reader';

export interface QrResult {
  url: string;
  pageNum?: number;
}

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
