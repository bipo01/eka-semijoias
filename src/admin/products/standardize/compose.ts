/*
 * Canvas side of the photo standardizer: the working copy of the photo, the
 * mask (alpha channel of a canvas the brush paints on), the brand composition
 * and the retouch view. Not covered by unit tests (jsdom has no canvas); the
 * math lives in geometry.ts.
 */
import { decode, MAX_INPUT_BYTES, MAX_INPUT_PIXELS } from '../../../lib/image';
import { fitSide, matteBounds, OUTPUT_HEIGHT, OUTPUT_WIDTH, placePiece, WORK_MAX_SIDE, type Rect } from './geometry';

/** Brand background: ivory at the top settling into champagne (tokens.css), a soft light behind the piece. */
export const BACKGROUND = { top: '#FBF8F5', bottom: '#F3E6DC', glow: 'rgba(255, 255, 255, 0.55)' } as const;
/** Shadow under the piece (ink #2B1D18, low alpha), relative to the output height. */
export const SHADOW = { color: 'rgba(43, 29, 24, 0.20)', blur: 0.016, offsetY: 0.008 } as const;
/** Tint over the parts the cut-out removed, in the retouch view. */
const REMOVED_TINT = 'rgba(43, 29, 24, 0.62)';

export type SourceError = 'too-large' | 'unsupported';

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function ctx2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', opts);
  if (!ctx) throw new Error('no-2d-context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/** Frees a canvas's backing store right away (iOS caps the total canvas memory per page). */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

/** Decodes the photo (EXIF-aware) into a working canvas with the long side ≤ WORK_MAX_SIDE. */
export async function loadSource(blob: Blob): Promise<HTMLCanvasElement | SourceError> {
  if (blob.size > MAX_INPUT_BYTES) return 'too-large';
  const decoded = await decode(blob);
  if (!decoded) return 'unsupported';
  try {
    if (decoded.width * decoded.height > MAX_INPUT_PIXELS) return 'too-large';
    const { width, height } = fitSide(decoded.width, decoded.height, WORK_MAX_SIDE);
    const c = makeCanvas(width, height);
    ctx2d(c).drawImage(decoded.source, 0, 0, width, height);
    return c;
  } finally {
    decoded.release();
  }
}

/** RGBA pixels of the photo stretched to the model's square input (as the models were trained). */
export function modelInput(source: HTMLCanvasElement, size: number): Uint8ClampedArray {
  const c = makeCanvas(size, size);
  try {
    const ctx = ctx2d(c, { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, size, size);
    return ctx.getImageData(0, 0, size, size).data;
  } finally {
    releaseCanvas(c);
  }
}

/** The model's square matte → a mask canvas at the working size (white, alpha = matte). */
export function matteToMask(matte: Uint8ClampedArray, size: number, width: number, height: number): HTMLCanvasElement {
  const square = makeCanvas(size, size);
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < matte.length; i++) {
    const p = i * 4;
    rgba[p] = rgba[p + 1] = rgba[p + 2] = 255;
    rgba[p + 3] = matte[i]!;
  }
  ctx2d(square).putImageData(new ImageData(rgba, size, size), 0, 0);
  const mask = makeCanvas(width, height);
  // The mask is read back often (bounds, undo snapshots): keep it CPU-side.
  ctx2d(mask, { willReadFrequently: true }).drawImage(square, 0, 0, width, height);
  releaseCanvas(square);
  return mask;
}

/** Alpha channel of the mask, one byte per pixel (bounds and undo snapshots). */
export function readAlpha(mask: HTMLCanvasElement): Uint8ClampedArray {
  const data = ctx2d(mask, { willReadFrequently: true }).getImageData(0, 0, mask.width, mask.height).data;
  const alpha = new Uint8ClampedArray(mask.width * mask.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
  return alpha;
}

export function writeAlpha(mask: HTMLCanvasElement, alpha: Uint8ClampedArray) {
  const rgba = new Uint8ClampedArray(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) {
    const p = i * 4;
    rgba[p] = rgba[p + 1] = rgba[p + 2] = 255;
    rgba[p + 3] = alpha[i]!;
  }
  const ctx = ctx2d(mask);
  ctx.clearRect(0, 0, mask.width, mask.height);
  ctx.putImageData(new ImageData(rgba, mask.width, mask.height), 0, 0);
}

export function paintBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const linear = ctx.createLinearGradient(0, 0, 0, height);
  linear.addColorStop(0, BACKGROUND.top);
  linear.addColorStop(1, BACKGROUND.bottom);
  ctx.fillStyle = linear;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width / 2, height * 0.46, 0, width / 2, height * 0.46, Math.max(width, height) * 0.6);
  glow.addColorStop(0, BACKGROUND.glow);
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

/**
 * The standardized photo: brand background, the piece cut out with the mask,
 * scaled to the fixed fill and centred, with a soft shadow. 4:5, OUTPUT_WIDTH × OUTPUT_HEIGHT.
 * `bounds` (in working pixels) defaults to the mask's own bounds; null when the mask is empty.
 */
export function compose(source: HTMLCanvasElement, mask: HTMLCanvasElement, bounds?: Rect | null, out = makeCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT)): HTMLCanvasElement | null {
  const box = bounds === undefined ? matteBounds(readAlpha(mask), mask.width, mask.height) : bounds;
  if (!box) return null;
  const cut = makeCanvas(source.width, source.height);
  try {
    const cctx = ctx2d(cut);
    cctx.drawImage(source, 0, 0);
    cctx.globalCompositeOperation = 'destination-in';
    cctx.drawImage(mask, 0, 0);

    const { scale, dx, dy } = placePiece(box, out.width, out.height);
    const ctx = ctx2d(out);
    ctx.clearRect(0, 0, out.width, out.height);
    paintBackground(ctx, out.width, out.height);
    ctx.save();
    ctx.shadowColor = SHADOW.color;
    ctx.shadowBlur = SHADOW.blur * out.height;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = SHADOW.offsetY * out.height;
    ctx.drawImage(cut, dx, dy, source.width * scale, source.height * scale);
    ctx.restore();
    return out;
  } finally {
    releaseCanvas(cut);
  }
}

/** Retouch view: the photo with the removed parts darkened, so what stays is obvious. */
export function renderRetouchView(view: HTMLCanvasElement, source: HTMLCanvasElement, mask: HTMLCanvasElement, scratch: HTMLCanvasElement) {
  if (scratch.width !== source.width || scratch.height !== source.height) {
    scratch.width = source.width;
    scratch.height = source.height;
  }
  const sctx = ctx2d(scratch);
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, scratch.width, scratch.height);
  sctx.fillStyle = REMOVED_TINT;
  sctx.fillRect(0, 0, scratch.width, scratch.height);
  sctx.globalCompositeOperation = 'destination-out';
  sctx.drawImage(mask, 0, 0);
  sctx.globalCompositeOperation = 'source-over';

  const ctx = ctx2d(view);
  ctx.drawImage(source, 0, 0, view.width, view.height);
  ctx.drawImage(scratch, 0, 0, view.width, view.height);
}

export type BrushMode = 'erase' | 'restore';

/** Paints one brush segment on the mask (working pixels): erase clears it, restore makes it opaque. */
export function paintStroke(mask: HTMLCanvasElement, from: { x: number; y: number }, to: { x: number; y: number }, diameter: number, mode: BrushMode) {
  const ctx = ctx2d(mask);
  ctx.save();
  ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = diameter;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (from.x === to.x && from.y === to.y) {
    ctx.arc(to.x, to.y, diameter / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Runs the background remover on the working photo and returns its mask at the working size. */
export async function cutOut(segment: (rgba: Uint8ClampedArray) => Promise<Uint8ClampedArray>, size: number, source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const matte = await segment(modelInput(source, size));
  return matteToMask(matte, size, source.width, source.height);
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode-failed'))), type, quality));
}
