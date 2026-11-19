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
