import { beforeEach, describe, expect, it } from 'vitest';
import { BACKDROP, backdropPixels, GRAIN } from './compose';
import { clampStrength, DEFAULT_ENHANCE, enhancePixels, toneCurves } from './enhance';
import { enhanceStrength, markTipsSeen, saveEnhanceStrength, tipsSeen } from './prefs';

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);
const saturation = (r: number, g: number, b: number) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);

describe('enhancePixels (Realce de cor)', () => {
  it('leaves the photo untouched at 0%', () => {
    const data = px(120, 90, 60, 255, 10, 200, 30, 128);
    enhancePixels(data, 0);
    expect([...data]).toEqual([120, 90, 60, 255, 10, 200, 30, 128]);
  });

  it('makes a dull rose-gold metal livelier and warmer as the strength grows', () => {
    const at = (strength: number) => {
      const d = px(176, 140, 120, 255);
      enhancePixels(d, strength);
      return [d[0]!, d[1]!, d[2]!] as const;
    };
    const s0 = saturation(176, 140, 120);
    const [r50, g50, b50] = at(50);
    const [r100, g100, b100] = at(100);
    expect(saturation(r50, g50, b50)).toBeGreaterThan(s0);
    expect(saturation(r100, g100, b100)).toBeGreaterThan(saturation(r50, g50, b50));
    expect(r100 - b100).toBeGreaterThan(176 - 120); // warmer
  });

  it('keeps white stones white and grey stays neutral-ish (no yellow zirconia)', () => {
    const white = px(250, 250, 250, 255);
    enhancePixels(white, 100);
    expect(Math.max(white[0]!, white[1]!, white[2]!) - Math.min(white[0]!, white[1]!, white[2]!)).toBeLessThanOrEqual(3);
    expect(white[2]!).toBeGreaterThanOrEqual(245);
  });

  it('never touches alpha nor fully transparent pixels', () => {
    const data = px(100, 80, 60, 0, 100, 80, 60, 77);
    enhancePixels(data, 100);
    expect([...data.slice(0, 4)]).toEqual([100, 80, 60, 0]);
    expect(data[7]).toBe(77);
  });

  it('tone curves are monotonic (no banding or inverted tones) at any strength', () => {
    for (const s of [0, 25, 50, 75, 100]) {
      for (const lut of toneCurves(s)) {
        for (let v = 1; v < 256; v++) expect(lut[v]!).toBeGreaterThanOrEqual(lut[v - 1]!);
        expect(lut[0]).toBe(0);
      }
    }
  });

  it('clamps strengths to 0–100 and falls back to the default on junk', () => {
    expect(clampStrength(-5)).toBe(0);
    expect(clampStrength(140)).toBe(100);
    expect(clampStrength(33.6)).toBe(34);
    expect(clampStrength('abc')).toBe(DEFAULT_ENHANCE);
    expect(clampStrength(Number.NaN)).toBe(DEFAULT_ENHANCE);
  });
});

describe('backdropPixels (the catalog backdrop)', () => {
  const W = 96;
  const H = 120;
  const data = backdropPixels(W, H);
  const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const mean = (x0: number, y0: number, size: number) => {
    const sum = [0, 0, 0];
    for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) for (let c = 0; c < 3; c++) sum[c]! += data[(y * W + x) * 4 + c]!;
    return sum.map((v) => v / (size * size));
  };

  it('matches the measured colours of the catalog photos (corner and centre cells)', () => {
    const cases: [number, number, string][] = [
      [0, 0, BACKDROP[0][0]],
      [W - 8, 0, BACKDROP[0][4]],
      [W - 8, H - 8, BACKDROP[5][4]],
    ];
    for (const [x, y, expected] of cases) {
      const got = mean(x, y, 8);
      hex(expected).forEach((v, c) => expect(Math.abs(got[c]! - v)).toBeLessThan(1.5));
    }
  });

  it('is opaque, deterministic and carries a paper grain of the measured size', () => {
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
    expect([...backdropPixels(W, H)]).toEqual([...data]);
    // Grain: deviation of the green channel around the local mean in a flat area.
    let sq = 0;
    let n = 0;
    const local = mean(40, 50, 16)[1]!;
    for (let y = 50; y < 66; y++) for (let x = 40; x < 56; x++) {
      const d = data[(y * W + x) * 4 + 1]! - local;
      sq += d * d;
      n++;
    }
    const std = Math.sqrt(sq / n);
    expect(std).toBeGreaterThan(GRAIN.amount * 0.5);
    expect(std).toBeLessThan(GRAIN.amount * 1.8);
  });
});

describe('standardizer preferences', () => {
  beforeEach(() => localStorage.clear());

  it('starts at the default strength and remembers the last one she used', () => {
    expect(enhanceStrength()).toBe(DEFAULT_ENHANCE);
    expect(saveEnhanceStrength(72)).toBe(true);
    expect(enhanceStrength()).toBe(72);
    saveEnhanceStrength(0);
    expect(enhanceStrength()).toBe(0);
  });

  it('keeps the tips flag and the strength side by side', () => {
    saveEnhanceStrength(30);
    markTipsSeen();
    expect(tipsSeen()).toBe(true);
    expect(enhanceStrength()).toBe(30);
  });

  it('ignores a corrupt or out-of-range saved value', () => {
    localStorage.setItem('eka:standardizer:v1', JSON.stringify({ realce: 999 }));
    expect(enhanceStrength()).toBe(100);
    localStorage.setItem('eka:standardizer:v1', '{');
    expect(enhanceStrength()).toBe(DEFAULT_ENHANCE);
  });
});
