import { describe, expect, it } from 'vitest';
import { fitSide, matteBounds, OUTPUT_HEIGHT, OUTPUT_WIDTH, PIECE_FILL, placePiece, toCanvasPoint, toMatte, toModelInput } from './geometry';

function matte(width: number, height: number, on: (x: number, y: number) => boolean): Uint8ClampedArray {
  const a = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (on(x, y)) a[y * width + x] = 255;
  return a;
}

describe('toModelInput', () => {
  it('writes planar RGB, scaled to 0–1 and normalized per channel', () => {
    // 2 × 1 image: a red pixel and a white one (alpha is ignored).
    const rgba = new Uint8ClampedArray([255, 0, 0, 10, 255, 255, 255, 255]);
    const out = toModelInput(rgba, 2, 1, { mean: [0.5, 0.5, 0.5], std: [1, 1, 1] });
    expect(Array.from(out)).toEqual([0.5, 0.5, -0.5, 0.5, -0.5, 0.5]);
  });

  it('applies ImageNet statistics', () => {
    const out = toModelInput(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1, { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] });
    expect(out[0]).toBeCloseTo(-0.485 / 0.229, 5);
    expect(out[2]).toBeCloseTo(-0.406 / 0.225, 5);
  });

  it('refuses a buffer smaller than the declared size', () => {
    expect(() => toModelInput(new Uint8ClampedArray(4), 2, 2, { mean: [0, 0, 0], std: [1, 1, 1] })).toThrow();
  });
});

describe('toMatte', () => {
  it('turns logits into alpha through a sigmoid', () => {
    expect(Array.from(toMatte([0, 20, -20], 'logits'))).toEqual([128, 255, 0]);
  });

  it('stretches probabilities to the full range per image', () => {
    expect(Array.from(toMatte([0.2, 0.6, 0.4], 'probability-minmax'))).toEqual([0, 255, 128]);
  });

  it('returns an empty matte for a flat output instead of dividing by zero', () => {
    expect(Array.from(toMatte([0.3, 0.3], 'probability-minmax'))).toEqual([0, 0]);
  });
});

describe('matteBounds', () => {
  it('is null when nothing is above the threshold', () => {
    expect(matteBounds(new Uint8ClampedArray(16).fill(50), 4, 4)).toBeNull();
  });

  it('finds the box of the piece', () => {
    const a = matte(10, 8, (x, y) => x >= 2 && x <= 6 && y >= 3 && y <= 4);
    expect(matteBounds(a, 10, 8, 96, 0)).toEqual({ x: 2, y: 3, width: 5, height: 2 });
  });

  it('ignores a stray speck far from a large piece', () => {
    const a = matte(200, 200, (x, y) => (x >= 50 && x < 150 && y >= 60 && y < 140) || (x === 199 && y === 0));
    expect(matteBounds(a, 200, 200)).toEqual({ x: 50, y: 60, width: 100, height: 80 });
  });

  it('keeps a thin chain that spans the frame', () => {
    // A one-pixel diagonal line: every pixel matters, none is trimmed as noise.
    const a = matte(100, 100, (x, y) => x === y);
    expect(matteBounds(a, 100, 100)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

describe('placePiece', () => {
  it('fills the fixed share of the frame on the limiting side and centres the piece', () => {
    const bounds = { x: 100, y: 200, width: 400, height: 200 }; // wide piece: width limits
    const { scale, dx, dy } = placePiece(bounds);
    expect(bounds.width * scale).toBeCloseTo(PIECE_FILL * OUTPUT_WIDTH);
    const centreX = (bounds.x + bounds.width / 2) * scale + dx;
    const centreY = (bounds.y + bounds.height / 2) * scale + dy;
    expect(centreX).toBeCloseTo(OUTPUT_WIDTH / 2);
    expect(centreY).toBeCloseTo(OUTPUT_HEIGHT * 0.48);
  });

  it('uses the height when the piece is tall', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 1000 };
    expect(bounds.height * placePiece(bounds).scale).toBeCloseTo(PIECE_FILL * OUTPUT_HEIGHT);
  });

  it('never enlarges a tiny piece more than the cap', () => {
    expect(placePiece({ x: 0, y: 0, width: 10, height: 10 }).scale).toBe(3);
  });

  it('gives the same size to the same piece photographed at different distances', () => {
    const near = placePiece({ x: 0, y: 0, width: 800, height: 600 });
    const far = placePiece({ x: 300, y: 300, width: 400, height: 300 });
    expect(800 * near.scale).toBeCloseTo(400 * far.scale);
  });
});

describe('fitSide', () => {
  it('caps the long side and keeps the aspect ratio', () => {
    expect(fitSide(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitSide(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe('toCanvasPoint', () => {
  it('maps a pointer on the CSS-scaled canvas to canvas pixels', () => {
    const rect = { left: 10, top: 20, width: 400, height: 500 };
    expect(toCanvasPoint(210, 270, rect, 1200, 1500)).toEqual({ x: 600, y: 750 });
  });
});
