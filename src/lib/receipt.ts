import { RECEIPT_MAX_BYTES, type ReceiptType } from '../data/orders';
import { decode, fitWithin } from './image';

/*
 * Prepares a payment receipt for upload. Receipts are read by a person, so
 * text must stay sharp: small PNG/JPEG/WebP files go as they are; big or
 * exotic images (HEIC, huge screenshots) become a high-quality JPEG; PDFs go
 * as they are when they fit.
 */

/** Images up to this size are sent untouched. */
export const KEEP_AS_IS_BYTES = 400_000;
/** Target for images re-encoded in the browser (server CPU grows with the file size). */
export const RECEIPT_IMAGE_TARGET_BYTES = 380_000;
/** Files bigger than this are refused before decoding (protects memory on phones). */
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export type PreparedReceipt = { ok: true; blob: Blob; type: ReceiptType; name: string } | { ok: false; message: string };

/** JPEG attempts, sharpest first. */
export const RECEIPT_STEPS = [
  { maxSide: 1800, quality: 0.82 },
  { maxSide: 1600, quality: 0.76 },
  { maxSide: 1400, quality: 0.72 },
  { maxSide: 1200, quality: 0.68 },
  { maxSide: 1000, quality: 0.62 },
] as const;

const IMAGE_TYPES: Record<string, ReceiptType> = { 'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/webp': 'image/webp' };

export const isPdf = (file: Pick<File, 'type' | 'name'>) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export async function prepareReceipt(file: File): Promise<PreparedReceipt> {
  if (!file.size) return { ok: false, message: 'O arquivo está vazio.' };
  if (isPdf(file)) {
    if (file.size > RECEIPT_MAX_BYTES) return { ok: false, message: 'Este PDF passou de 700 KB. Envie um print do comprovante.' };
    return { ok: true, blob: file, type: 'application/pdf', name: file.name };
  }
  const asIs = IMAGE_TYPES[file.type.toLowerCase()];
  if (asIs && file.size <= KEEP_AS_IS_BYTES) return { ok: true, blob: file, type: asIs, name: file.name };
  if (file.size > MAX_INPUT_BYTES) return { ok: false, message: 'Este arquivo é grande demais. Envie um print do comprovante.' };
  const decoded = await decode(file);
  if (!decoded) return { ok: false, message: 'Não conseguimos abrir este arquivo. Envie um print (PNG ou JPG) ou o PDF do comprovante.' };
  const canvas = document.createElement('canvas');
  try {
    for (const step of RECEIPT_STEPS) {
      const { width, height } = fitWithin(decoded.width, decoded.height, step.maxSide);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.fillStyle = '#ffffff'; // transparent screenshots become white, not black, in JPEG
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(decoded.source, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', step.quality));
      if (blob && blob.size <= RECEIPT_IMAGE_TARGET_BYTES) return { ok: true, blob, type: 'image/jpeg', name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
    }
    return { ok: false, message: 'Não conseguimos reduzir esta imagem. Envie um print menor ou o PDF do comprovante.' };
  } finally {
    decoded.release();
    canvas.width = 0;
    canvas.height = 0;
  }
}
