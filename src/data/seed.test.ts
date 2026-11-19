import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { catalogStateSchema } from './schema';
import { createSeed } from './seed';
import { checkIntegrity } from './storage';
import { isOnSale, isPurchasable } from './catalog';

describe('seed catalog', () => {
  const seed = createSeed();

  it('is valid and consistent', () => {
    expect(catalogStateSchema.safeParse(seed).success).toBe(true);
    expect(checkIntegrity(seed)).toBeNull();
  });

  it('has the agreed shape', () => {
    expect(seed.products).toHaveLength(24);
    expect(seed.categories.map((c) => c.name)).toEqual(['Brincos', 'Colares', 'Anéis', 'Pulseiras', 'Conjuntos', 'Tornozeleiras']);
    const featured = seed.products.filter((p) => p.featured).length;
    expect(featured).toBeGreaterThanOrEqual(4);
    expect(featured).toBeLessThanOrEqual(6);
    expect(seed.products.filter(isOnSale)).toHaveLength(3);
    expect(seed.products.filter((p) => !isPurchasable(p))).toHaveLength(2);
    const prices = seed.products.map((p) => p.promoPrice ?? p.price);
    expect(Math.min(...prices)).toBeGreaterThanOrEqual(4990);
    expect(Math.max(...seed.products.map((p) => p.price))).toBeLessThanOrEqual(28990);
    expect(seed.collections.filter((c) => c.featuredOnHome)).toHaveLength(1);
  });

  it('references image files that exist for every width', () => {
    const publicDir = path.resolve(process.cwd(), 'public');
    const stems = new Set([...seed.products.flatMap((p) => p.images.map((i) => i.src)), ...seed.collections.map((c) => c.heroImage!).filter(Boolean)]);
    for (const stem of stems) {
      for (const w of [480, 960]) expect(existsSync(path.join(publicDir, `${stem}-${w}.webp`)), `${stem}-${w}`).toBe(true);
    }
  });

  it('gives every image a meaningful alt and marks stand-ins in data only', () => {
    for (const p of seed.products) for (const img of p.images) {
      expect(img.alt).toMatch(new RegExp(`^${p.name} em `));
      expect(img.placeholder).toBe(true);
    }
  });
});
