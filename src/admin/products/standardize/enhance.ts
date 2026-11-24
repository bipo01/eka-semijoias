/*
 * "Realce": the colour treatment that gives a home photo of a piece the warm,
 * lively look of the catalog photos (more saturation, a touch of warmth, light
 * and contrast). Pure pixel math on RGBA buffers, no canvas: unit-tested in jsdom.
 *
 * Strength is a percentage (0 = the photo's own colours, 100 = the full look).
 * Near-white pixels (zirconia, pearl highlights) keep their colour: the warmth
 * fades out towards white, so stones never turn yellow.
 */

/** Strength used until the owner picks her own (then her last choice is remembered on the device). */
export const DEFAULT_ENHANCE = 50;
export const MIN_ENHANCE = 0;
export const MAX_ENHANCE = 100;

/** The full-strength look, tuned against the catalog photos (docs/qa/standardizer/). */
export const LOOK = {
  /** Saturation added to every pixel. */
  saturation: 0.26,
  /** Extra saturation for muted pixels (vibrance): dull metal gains more than already-vivid colour. */
  vibrance: 0.4,
  /** Midtone lift (0–1): opens the shadows of a phone photo without clipping the highlights. */
  lift: 0.18,
  /** Gentle S-curve mixed in for a little more depth. */
  contrast: 0.24,
  /**
   * Per-channel warmth (multipliers at full strength), towards the catalog's warm light. Kept small:
   * yellow gold must not turn copper, nor silver gold (the photo has to show the real piece).
   */
  warmth: { r: 0.022, g: 0.006, b: -0.028 },
} as const;

export function clampStrength(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ENHANCE;
  return Math.round(Math.min(MAX_ENHANCE, Math.max(MIN_ENHANCE, n)));
}

/** Per-channel tone curves for a strength (lift + S-curve + warmth that fades towards white). */
export function toneCurves(strength: number): [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] {
  const t = clampStrength(strength) / 100;
  const warm = [LOOK.warmth.r, LOOK.warmth.g, LOOK.warmth.b];
  return warm.map((w) => {
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      let x = v / 255;
      x += LOOK.lift * t * x * (1 - x);
      const s = x * x * (3 - 2 * x);
      x += (s - x) * LOOK.contrast * t;
      x *= 1 + w * t * (1 - x * x * x);
      lut[v] = Math.round(x * 255);
    }
    return lut;
  }) as [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray];
}

/**
 * Applies the look in place to every visible pixel of an RGBA buffer (alpha untouched,
 * fully transparent pixels skipped). Strength 0 leaves the buffer as it is.
 */
export function enhancePixels(data: Uint8ClampedArray, strength: number): void {
  const t = clampStrength(strength) / 100;
  if (t === 0) return;
  const [lr, lg, lb] = toneCurves(strength);
  const base = LOOK.saturation * t;
  const vib = LOOK.vibrance * t;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] === 0) continue;
    const r = lr[data[p]!]!;
    const g = lg[data[p + 1]!]!;
    const b = lb[data[p + 2]!]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const factor = 1 + base + vib * (1 - sat);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    data[p] = luma + (r - luma) * factor;
    data[p + 1] = luma + (g - luma) * factor;
    data[p + 2] = luma + (b - luma) * factor;
  }
}
