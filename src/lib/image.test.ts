import { describe, expect, it } from 'vitest';
import { encodeSteps, encodeWithinBudget, fitWithin, IMAGE_BUDGET_BYTES, type EncodeStep, type ImageMime } from './image';

const KB = 1024;

/** Fake encoder: the size depends on the step, the mime is whatever the "browser" supports. */
function fakeEncoder(sizeFor: (step: EncodeStep) => number, supportsWebp = true) {
  const calls: { step: EncodeStep; mime: ImageMime }[] = [];
  const encode = async (step: EncodeStep, mime: ImageMime) => {
    calls.push({ step, mime });
    const type = mime === 'image/webp' && !supportsWebp ? 'image/png' : mime;
    return new Blob([new Uint8Array(sizeFor(step))], { type });
  };
  return { encode, calls };
}

describe('encodeSteps', () => {
  it('steps quality down first, then size', () => {
    expect(encodeSteps('image/webp')).toEqual([
      { maxSide: 1200, quality: 0.8 },
      { maxSide: 1200, quality: 0.7 },
      { maxSide: 1200, quality: 0.6 },
      { maxSide: 1000, quality: 0.6 },
      { maxSide: 800, quality: 0.6 },
    ]);
    expect(encodeSteps('image/jpeg')[0]).toEqual({ maxSide: 1200, quality: 0.82 });
  });

  it('keeps product photos on exactly the 1200 px plan by default', () => {
    expect(encodeSteps('image/webp', 'product')).toEqual(encodeSteps('image/webp'));
    expect(encodeSteps('image/jpeg', 'product')).toEqual(encodeSteps('image/jpeg'));
    expect(Math.max(...encodeSteps('image/webp').map((s) => s.maxSide))).toBe(1200);
  });

  it('gives banners (wide profile) a 1600 px long side with the same quality steps', () => {
    expect(encodeSteps('image/webp', 'wide')).toEqual([
      { maxSide: 1600, quality: 0.8 },
      { maxSide: 1600, quality: 0.7 },
      { maxSide: 1600, quality: 0.6 },
      { maxSide: 1300, quality: 0.6 },
      { maxSide: 1000, quality: 0.6 },
    ]);
    expect(encodeSteps('image/jpeg', 'wide')[0]).toEqual({ maxSide: 1600, quality: 0.82 });
  });
});

describe('fitWithin', () => {
  it('scales the long side down to the limit and keeps the ratio', () => {
    expect(fitWithin(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 });
  });
  it('never upscales', () => {
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });
});

describe('encodeWithinBudget', () => {
  it('stops at the first attempt when it already fits', async () => {
    const { encode, calls } = fakeEncoder(() => 120 * KB);
    const result = await encodeWithinBudget(encode);
    expect(calls).toHaveLength(1);
    expect(result.mime).toBe('image/webp');
    expect(result.step).toEqual({ maxSide: 1200, quality: 0.8 });
  });

  it('steps quality then size down until the photo fits 180 KB', async () => {
    const sizes: Record<string, number> = { '1200:0.8': 400, '1200:0.7': 300, '1200:0.6': 240, '1000:0.6': 170, '800:0.6': 110 };
    const { encode, calls } = fakeEncoder((s) => sizes[`${s.maxSide}:${s.quality}`]! * KB);
    const result = await encodeWithinBudget(encode);
    expect(calls.map((c) => `${c.step.maxSide}:${c.step.quality}`)).toEqual(['1200:0.8', '1200:0.7', '1200:0.6', '1000:0.6']);
    expect(result.blob.size).toBeLessThanOrEqual(IMAGE_BUDGET_BYTES);
    expect(result.step).toEqual({ maxSide: 1000, quality: 0.6 });
  });

  it('returns the smallest attempt when nothing fits', async () => {
    const { encode, calls } = fakeEncoder((s) => (s.maxSide === 800 ? 200 * KB : 500 * KB));
    const result = await encodeWithinBudget(encode);
    expect(calls).toHaveLength(5);
    expect(result.step).toEqual({ maxSide: 800, quality: 0.6 });
    expect(result.blob.size).toBe(200 * KB);
  });

  it('runs the wide plan within the same 180 KB budget', async () => {
    const { encode, calls } = fakeEncoder((s) => (s.maxSide >= 1600 ? 260 * KB : 160 * KB));
    const result = await encodeWithinBudget(encode, IMAGE_BUDGET_BYTES, 'image/webp', 'wide');
    expect(calls.map((c) => `${c.step.maxSide}:${c.step.quality}`)).toEqual(['1600:0.8', '1600:0.7', '1600:0.6', '1300:0.6']);
    expect(result.blob.size).toBeLessThanOrEqual(IMAGE_BUDGET_BYTES);
  });

  it('keeps the wide plan when falling back to JPEG', async () => {
    const { encode, calls } = fakeEncoder(() => 100 * KB, false);
    const result = await encodeWithinBudget(encode, IMAGE_BUDGET_BYTES, 'image/webp', 'wide');
    expect(calls[1]).toEqual({ step: { maxSide: 1600, quality: 0.82 }, mime: 'image/jpeg' });
    expect(result.mime).toBe('image/jpeg');
  });

  it('falls back to JPEG when the browser cannot encode WebP', async () => {
    const { encode, calls } = fakeEncoder((s) => (s.quality >= 0.8 ? 250 * KB : 150 * KB), false);
    const result = await encodeWithinBudget(encode);
    expect(calls[0]!.mime).toBe('image/webp');
    expect(calls.slice(1).every((c) => c.mime === 'image/jpeg')).toBe(true);
    expect(calls[1]!.step.quality).toBe(0.82);
    expect(result.mime).toBe('image/jpeg');
    expect(result.step).toEqual({ maxSide: 1200, quality: 0.7 });
  });
});
