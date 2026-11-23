/*
 * Pure parts of the photo standardizer: model input/output conversion, the
 * bounding box of the cut-out piece and the layout of the 4:5 frame. No DOM,
 * no canvas: unit-tested in jsdom.
 */

/** Output frame (4:5). Matches the main photo size the upload pipeline keeps (long side 1200). */
export const OUTPUT_WIDTH = 960;
export const OUTPUT_HEIGHT = 1200;
/** Share of the frame the piece's bounding box occupies on its limiting side. */
export const PIECE_FILL = 0.72;
/** Vertical position of the piece's centre (slightly above the middle leaves room for the shadow). */
export const PIECE_CENTER_Y = 0.48;
/** Never enlarge the source more than this (a tiny piece would turn blurry); it then fills less of the frame. */
export const MAX_UPSCALE = 3;
/** Long side of the working copy (compositing and the retouch brush). Caps memory on phones. */
export const WORK_MAX_SIDE = 1600;
/** Alpha (0–255) above which a mask pixel counts as part of the piece when measuring its bounds. */
export const BOUNDS_THRESHOLD = 96;
/** Share of the piece's pixels ignored on each side when measuring its bounds (stray specks of noise). */
export const BOUNDS_TRIM = 0.001;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Normalization {
  /** Per-channel mean, in the 0–1 range. */
  mean: readonly [number, number, number];
  /** Per-channel standard deviation, in the 0–1 range. */
  std: readonly [number, number, number];
}

/**
 * RGBA pixels (already resized to the model's input) → planar float32 RGB
 * (`[1, 3, h, w]`), scaled to 0–1 and normalized with the model's mean/std.
 */
export function toModelInput(rgba: Uint8ClampedArray, width: number, height: number, norm: Normalization): Float32Array {
  const plane = width * height;
  if (rgba.length < plane * 4) throw new Error('rgba buffer is smaller than width × height × 4');
  const out = new Float32Array(plane * 3);
  const [mr, mg, mb] = norm.mean;
  const [sr, sg, sb] = norm.std;
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    out[i] = (rgba[p]! / 255 - mr) / sr;
    out[plane + i] = (rgba[p + 1]! / 255 - mg) / sg;
    out[2 * plane + i] = (rgba[p + 2]! / 255 - mb) / sb;
  }
  return out;
}

/** How a model's raw output becomes a 0–1 matte. */
export type OutputKind = 'logits' | 'probability-minmax';

/**
 * Model output → 8-bit matte. `logits` go through a sigmoid (BiRefNet);
 * `probability-minmax` is stretched to the full range per image, as rembg does
 * for ISNet (its raw probabilities rarely reach 0 and 1).
 */
export function toMatte(output: ArrayLike<number>, kind: OutputKind): Uint8ClampedArray {
  const n = output.length;
  const out = new Uint8ClampedArray(n);
  if (kind === 'logits') {
    for (let i = 0; i < n; i++) out[i] = Math.round(255 / (1 + Math.exp(-output[i]!)));
    return out;
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = output[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (!(range > 1e-6)) return out; // flat output: nothing found
  for (let i = 0; i < n; i++) out[i] = Math.round(((output[i]! - min) / range) * 255);
  return out;
}

/**
 * Bounding box of the piece in a single-channel matte: pixels at or above
 * `threshold`, ignoring the outermost `trim` share of them on each side so a
 * few stray specks do not stretch the box. `null` when the matte is empty.
 */
export function matteBounds(alpha: ArrayLike<number>, width: number, height: number, threshold = BOUNDS_THRESHOLD, trim = BOUNDS_TRIM): Rect | null {
  const cols = new Uint32Array(width);
  const rows = new Uint32Array(height);
  let total = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x]! >= threshold) {
        cols[x]!++;
        count++;
      }
    }
    rows[y] = count;
    total += count;
  }
  if (total === 0) return null;
  const skip = Math.floor(total * trim);
  const [x0, x1] = trimmedRange(cols, skip);
  const [y0, y1] = trimmedRange(rows, skip);
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** First and last index of a histogram after dropping `skip` counts from each end. */
function trimmedRange(hist: Uint32Array, skip: number): [number, number] {
  let lo = 0;
  let acc = 0;
  while (lo < hist.length - 1 && acc + hist[lo]! <= skip) acc += hist[lo++]!;
  let hi = hist.length - 1;
  acc = 0;
  while (hi > lo && acc + hist[hi]! <= skip) acc += hist[hi--]!;
  return [lo, hi];
}

export interface Placement {
  /** Scale from source pixels to output pixels. */
  scale: number;
  /** Where the source's top-left corner lands in the output. */
  dx: number;
  dy: number;
}

/**
 * Places the piece: its bounding box fills `fill` of the frame on the limiting
 * side, centred horizontally and at `centerY` vertically. Enlarging is capped
 * at `maxUpscale`.
 */
export function placePiece(bounds: Rect, outWidth = OUTPUT_WIDTH, outHeight = OUTPUT_HEIGHT, fill = PIECE_FILL, centerY = PIECE_CENTER_Y, maxUpscale = MAX_UPSCALE): Placement {
  const scale = Math.min((fill * outWidth) / bounds.width, (fill * outHeight) / bounds.height, maxUpscale);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return { scale, dx: outWidth / 2 - cx * scale, dy: outHeight * centerY - cy * scale };
}

/** Same as `fitWithin` in lib/image, kept local so this module stays dependency-free. */
export function fitSide(width: number, height: number, maxSide: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxSide) return { width, height };
  const s = maxSide / long;
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

/** Maps a pointer position on the displayed (CSS-scaled) canvas to canvas pixels. */
export function toCanvasPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, canvasWidth: number, canvasHeight: number): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvasWidth,
    y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvasHeight,
  };
}
