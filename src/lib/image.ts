/*
 * Client-side photo pipeline for the admin: decode (EXIF-aware) → resize →
 * encode as WebP (JPEG where the browser cannot encode WebP) → step quality
 * and size down until the photo fits the per-image budget → data URL.
 * The step planning is pure so it can be tested without a canvas.
 */

export type ImageMime = 'image/webp' | 'image/jpeg';

export interface EncodeStep {
  maxSide: number;
  quality: number;
}

/** Target size of one stored photo. */
export const IMAGE_BUDGET_BYTES = 180 * 1024;
/** Above this, even the smallest step is refused (it would not fit the catalog). */
export const IMAGE_HARD_LIMIT_BYTES = 320 * 1024;
/** Files bigger than this are refused before decoding (protects memory on phones). */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;
/** Decoded images above this pixel count are refused (a 48 MP phone photo is ~48 M). */
export const MAX_INPUT_PIXELS = 60_000_000;
export const THUMB_STEP: Record<ImageMime, EncodeStep> = {
  'image/webp': { maxSide: 480, quality: 0.75 },
  'image/jpeg': { maxSide: 480, quality: 0.78 },
};

const FIRST_QUALITY: Record<ImageMime, number> = { 'image/webp': 0.8, 'image/jpeg': 0.82 };

/** Encode attempts in order: quality first (start, 0.7, 0.6), then size (1000, 800). */
export function encodeSteps(mime: ImageMime): EncodeStep[] {
  return [
    { maxSide: 1200, quality: FIRST_QUALITY[mime] },
    { maxSide: 1200, quality: 0.7 },
    { maxSide: 1200, quality: 0.6 },
    { maxSide: 1000, quality: 0.6 },
    { maxSide: 800, quality: 0.6 },
  ];
}

/** Scales (width, height) so the long side is at most `maxSide`. Never upscales. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type Encoder = (step: EncodeStep, mime: ImageMime) => Promise<Blob>;

export interface EncodedImage {
  blob: Blob;
  mime: ImageMime;
  step: EncodeStep;
}

/**
 * Runs the encode steps until one fits `budget`, returning the first that fits
 * (or the last, smallest attempt). If the browser answers a WebP request with
 * another type (Safari without a WebP encoder), it switches to the JPEG plan.
 */
export async function encodeWithinBudget(encode: Encoder, budget = IMAGE_BUDGET_BYTES, startMime: ImageMime = 'image/webp'): Promise<EncodedImage> {
  let mime: ImageMime = startMime;
  let steps = encodeSteps(mime);
  let last: EncodedImage | null = null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const blob = await encode(step, mime);
    if (mime === 'image/webp' && blob.type !== 'image/webp') {
      mime = 'image/jpeg';
      steps = encodeSteps(mime);
      i = -1;
      continue;
    }
    last = { blob, mime, step };
    if (blob.size <= budget) return last;
  }
  return last!;
}

// ---------------------------------------------------------------------------
// Browser side (canvas). Not covered by unit tests: jsdom has no canvas.
// ---------------------------------------------------------------------------

export type ProcessedImage =
  | { ok: true; src: string; thumb: string; bytes: number }
  | { ok: false; reason: 'unsupported' | 'too-large' | 'unknown'; message: string };

const MESSAGES = {
  unsupported: 'Formato não suportado — envie em JPG ou PNG.',
  'too-large': 'Esta foto é grande demais. Tente outra ou recorte antes de enviar.',
  unknown: 'Não foi possível preparar a foto. Tente de novo.',
} as const;

function fail(reason: keyof typeof MESSAGES): ProcessedImage {
  return { ok: false, reason, message: MESSAGES[reason] };
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall through: some engines reject the options bag; <img> also applies EXIF orientation.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    if (!img.naturalWidth) return null;
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => undefined };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One canvas per photo, reused across encode steps and released afterwards (iOS caps total canvas memory). */
function canvasEncoder(decoded: Decoded, canvas: HTMLCanvasElement): Encoder {
  return (step, mime) =>
    new Promise<Blob>((resolve, reject) => {
      const { width, height } = fitWithin(decoded.width, decoded.height, step.maxSide);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no-2d-context'));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(decoded.source, 0, 0, width, height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode-failed'))), mime, step.quality);
    });
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read-failed'));
    reader.readAsDataURL(blob);
  });
}

const DATA_URL = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

let webpSupport: Promise<boolean> | null = null;
/** Detects once whether the browser can encode WebP (Safari cannot), so no photo pays for a wasted encode. */
function canEncodeWebp(): Promise<boolean> {
  webpSupport ??= new Promise((resolve) => {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    probe.toBlob((blob) => resolve(blob?.type === 'image/webp'), 'image/webp', 0.8);
  });
  return webpSupport;
}

/** Turns a picked photo into a compact data URL plus a 480 px thumbnail. */
export async function processImage(file: File): Promise<ProcessedImage> {
  if (file.size > MAX_INPUT_BYTES) return fail('too-large');
  // HEIC decodes only in a few browsers (Safari); elsewhere decoding fails and is reported as unsupported.
  const decoded = await decode(file);
  if (!decoded) return fail('unsupported');
  if (decoded.width * decoded.height > MAX_INPUT_PIXELS) {
    decoded.release();
    return fail('too-large');
  }
  const canvas = document.createElement('canvas');
  try {
    const encode = canvasEncoder(decoded, canvas);
    const main = await encodeWithinBudget(encode, IMAGE_BUDGET_BYTES, (await canEncodeWebp()) ? 'image/webp' : 'image/jpeg');
    if (main.blob.size > IMAGE_HARD_LIMIT_BYTES) return fail('too-large');
    const thumbBlob = await encode(THUMB_STEP[main.mime], main.mime);
    const [src, thumb] = await Promise.all([toDataUrl(main.blob), toDataUrl(thumbBlob)]);
    if (!DATA_URL.test(src) || !DATA_URL.test(thumb)) return fail('unsupported');
    return { ok: true, src, thumb, bytes: main.blob.size + thumbBlob.size };
  } catch {
    return fail('unknown');
  } finally {
    decoded.release();
    canvas.width = 0;
    canvas.height = 0;
  }
}
