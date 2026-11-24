/*
 * Canvas side of the photo standardizer: the working copy of the photo, the
 * mask (alpha channel of a canvas the brush paints on), the brand composition
 * and the retouch view. Not covered by unit tests (jsdom has no canvas); the
 * math lives in geometry.ts.
 */
import { decode, MAX_INPUT_BYTES, MAX_INPUT_PIXELS } from '../../../lib/image';
import { enhancePixels } from './enhance';
import { fitSide, matteBounds, OUTPUT_HEIGHT, OUTPUT_WIDTH, placePiece, WORK_MAX_SIDE, type Rect } from './geometry';

/**
 * Backdrop of the catalog photos (public/images/products/p*), measured on 13 of them:
 * the median background colour of each cell of a 5 × 6 grid, pieces and shadows left out.
 * Warm champagne paper lit from the upper left. Rows top to bottom, columns left to right.
 */
export const BACKDROP = [
  ['#F5DCCC', '#F4DACB', '#F3D9C8', '#F2D9C8', '#F2D9C6'],
  ['#F5DBCB', '#F3DAC9', '#F3D9C7', '#F2D9C8', '#F2D8C7'],
  ['#F4DBCB', '#F3D9C8', '#F2D8C7', '#F1D8C7', '#F0D8C7'],
  ['#F3DBC9', '#F3DAC7', '#F2D8C6', '#F1D7C6', '#F0D7C6'],
  ['#F3DAC9', '#F2D8C7', '#F2D8C6', '#F1D7C5', '#F1D7C6'],
  ['#F3DAC9', '#F3D9C7', '#F3D9C7', '#F3D8C6', '#F2D8C6'],
] as const;
/** Paper grain of the same photos: standard deviation in 8-bit levels, and its size in output pixels. */
export const GRAIN = { amount: 1.6, size: 2 } as const;
/** Contact shadow under the piece: warm brown (as in the catalog), light from the upper left. Relative to the output height. */
export const SHADOW = { color: 'rgba(125, 72, 42, 0.30)', blur: 0.018, offsetX: 0.003, offsetY: 0.009 } as const;
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

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Deterministic pseudo-random numbers (mulberry32): the grain is the same on every photo. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The catalog backdrop as RGBA pixels: the measured light map, smoothly interpolated
 * between cell centres, plus fine paper grain. Pure (no canvas), so it is unit-tested.
 */
export function backdropPixels(width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const rows = BACKDROP.length;
  const cols = BACKDROP[0].length;
  const grid = BACKDROP.map((row) => row.map(hexRgb));
  // Grain: gaussian-ish noise on a coarse lattice, bilinearly sampled (soft, paper-like, no pixel noise).
  const gw = Math.ceil(width / GRAIN.size) + 2;
  const gh = Math.ceil(height / GRAIN.size) + 2;
  const rand = random(0xe4a);
  const noise = new Float32Array(gw * gh);
  // Bilinear sampling of independent values averages them (std × ~0.68); scale so the result keeps GRAIN.amount.
  const gain = GRAIN.amount / 0.68;
  for (let i = 0; i < noise.length; i++) noise[i] = (rand() + rand() + rand() - 1.5) * 2 * gain;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(rows - 1, Math.max(0, ((y + 0.5) / height) * rows - 0.5));
    const y0 = Math.floor(gy);
    const y1 = Math.min(rows - 1, y0 + 1);
    const fy = smooth(gy - y0);
    const ny = y / GRAIN.size;
    const ny0 = Math.floor(ny);
    const nfy = ny - ny0;
    for (let x = 0; x < width; x++) {
      const gx = Math.min(cols - 1, Math.max(0, ((x + 0.5) / width) * cols - 0.5));
      const x0 = Math.floor(gx);
      const x1 = Math.min(cols - 1, x0 + 1);
      const fx = smooth(gx - x0);
      const nx = x / GRAIN.size;
      const nx0 = Math.floor(nx);
      const nfx = nx - nx0;
      const n00 = noise[ny0 * gw + nx0]!;
      const n10 = noise[ny0 * gw + nx0 + 1]!;
      const n01 = noise[(ny0 + 1) * gw + nx0]!;
      const n11 = noise[(ny0 + 1) * gw + nx0 + 1]!;
      const grain = n00 + (n10 - n00) * nfx + (n01 - n00) * nfy + (n00 - n10 - n01 + n11) * nfx * nfy;
      const p = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = grid[y0]![x0]![c]! + (grid[y0]![x1]![c]! - grid[y0]![x0]![c]!) * fx;
        const bottom = grid[y1]![x0]![c]! + (grid[y1]![x1]![c]! - grid[y1]![x0]![c]!) * fx;
        out[p + c] = Math.round(top + (bottom - top) * fy + grain);
      }
      out[p + 3] = 255;
    }
  }
  return out;
}

/** The backdrop is the same for every photo: built once per size (preview and output) and kept (CPU memory, not a canvas). */
const backdropCache = new Map<string, ImageData>();
function backdrop(width: number, height: number): ImageData {
  const key = `${width}x${height}`;
  let data = backdropCache.get(key);
  if (!data) {
    if (backdropCache.size >= 2) backdropCache.clear();
    data = new ImageData(backdropPixels(width, height), width, height);
    backdropCache.set(key, data);
  }
  return data;
}

/** The cut-out piece placed on the output frame (transparent around it), cropped to its visible pixels. */
export interface PieceLayer {
  /** Frame size (the output photo). */
  frame: { width: number; height: number };
  /** Where `pixels` sits in the frame. */
  x: number;
  y: number;
  /** The piece's pixels, colours untouched (the filter is applied at render time). */
  pixels: ImageData;
}

/**
 * Cuts the piece out with the mask and places it on the frame (fixed fill, centred) without
 * the backdrop, so the colour filter can be re-applied quickly while she drags the slider.
 * `bounds` (in working pixels) defaults to the mask's own bounds; null when the mask is empty.
 */
export function placeOnFrame(source: HTMLCanvasElement, mask: HTMLCanvasElement, bounds?: Rect | null, width = OUTPUT_WIDTH, height = OUTPUT_HEIGHT): PieceLayer | null {
  const box = bounds === undefined ? matteBounds(readAlpha(mask), mask.width, mask.height) : bounds;
  if (!box) return null;
  const cut = makeCanvas(source.width, source.height);
  const frame = makeCanvas(width, height);
  try {
    const cctx = ctx2d(cut);
    cctx.drawImage(source, 0, 0);
    cctx.globalCompositeOperation = 'destination-in';
    cctx.drawImage(mask, 0, 0);
    const { scale, dx, dy } = placePiece(box, width, height);
    const fctx = ctx2d(frame, { willReadFrequently: true });
    fctx.drawImage(cut, dx, dy, source.width * scale, source.height * scale);
    const all = fctx.getImageData(0, 0, width, height).data;
    // Crop to the visible pixels: the filter then only touches the piece.
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (all[(y * width + x) * 4 + 3] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    const pixels = fctx.getImageData(minX, minY, maxX - minX + 1, maxY - minY + 1);
    return { frame: { width, height }, x: minX, y: minY, pixels };
  } finally {
    releaseCanvas(cut);
    releaseCanvas(frame);
  }
}

/**
 * Draws the standardized photo into `out` (resized to the frame): catalog backdrop, then the piece
 * with the colour filter at `strength` (0–100 %) and a soft contact shadow. `scratch` is reused between calls.
 */
export function renderStandardized(out: HTMLCanvasElement, layer: PieceLayer, strength: number, scratch: HTMLCanvasElement) {
  const { width, height } = layer.frame;
  if (out.width !== width || out.height !== height) {
    out.width = width;
    out.height = height;
  }
  const { pixels } = layer;
  if (scratch.width !== pixels.width || scratch.height !== pixels.height) {
    scratch.width = pixels.width;
    scratch.height = pixels.height;
  }
  const piece = new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  enhancePixels(piece.data, strength);
  ctx2d(scratch).putImageData(piece, 0, 0);

  const ctx = ctx2d(out);
  ctx.putImageData(backdrop(width, height), 0, 0);
  ctx.save();
  ctx.shadowColor = SHADOW.color;
  ctx.shadowBlur = SHADOW.blur * height;
  ctx.shadowOffsetX = SHADOW.offsetX * height;
  ctx.shadowOffsetY = SHADOW.offsetY * height;
  ctx.drawImage(scratch, layer.x, layer.y);
  ctx.restore();
}

/**
 * The standardized photo in one call: catalog backdrop, the piece cut out with the mask,
 * scaled to the fixed fill and centred, colour filter at `strength`, soft shadow.
 * 4:5, OUTPUT_WIDTH × OUTPUT_HEIGHT. Null when the mask is empty.
 */
export function compose(source: HTMLCanvasElement, mask: HTMLCanvasElement, bounds?: Rect | null, strength = 0, out = makeCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT)): HTMLCanvasElement | null {
  const layer = placeOnFrame(source, mask, bounds, out.width, out.height);
  if (!layer) return null;
  const scratch = makeCanvas(1, 1);
  try {
    renderStandardized(out, layer, strength, scratch);
    return out;
  } finally {
    releaseCanvas(scratch);
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
