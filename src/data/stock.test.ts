import { describe, expect, it } from 'vitest';
import { createCatalogSeed } from './seed';
import { isPurchasable, productBadge } from './catalog';
import { combosOf, isLowStock, materializeStock, orphanRows, stockOf, variantInStock, variantStock } from './stock';

const catalog = createCatalogSeed();
const ring = catalog.products.find((p) => p.variants.some((v) => v.sizes?.length) && p.available && p.variants.every((v) => v.available))!;
const plain = catalog.products.find((p) => p.variants.every((v) => !v.sizes?.length) && p.available && p.variants.every((v) => v.available))!;

describe('stock', () => {
  it('lists one combination per size, or one per finish without sizes', () => {
    expect(combosOf(plain)).toEqual(plain.variants.map((v) => ({ variantId: v.id, size: '' })));
    expect(combosOf(ring).length).toBe(ring.variants.reduce((n, v) => n + (v.sizes?.length ?? 1), 0));
  });

  it('treats untracked products as before and missing combinations of tracked ones as 0', () => {
    const v = ring.variants[0]!;
    const size = v.sizes![0]!;
    expect(stockOf(undefined, ring.id, v.id, size)).toBeNull();
    const stock = materializeStock(catalog.products, [ring.id], [{ product_id: ring.id, variant_id: v.id, size, qty: 3 }]);
    expect(stockOf(stock, ring.id, v.id, size)).toBe(3);
    expect(stockOf(stock, ring.id, v.id, v.sizes![1]!)).toBe(0);
    expect(variantStock(stock, ring, v)).toBe(3);
    expect(stockOf(stock, plain.id, plain.variants[0]!.id)).toBeNull();
  });

  it('marks a tracked product with no units as sold out everywhere', () => {
    const stock = materializeStock(catalog.products, [plain.id], []);
    expect(stock[plain.id]).toEqual({});
    expect(isPurchasable(plain, stock)).toBe(false);
    expect(productBadge(plain, stock)).toBe('esgotado');
    expect(isPurchasable(plain)).toBe(true);
    const one = materializeStock(catalog.products, [plain.id], [{ product_id: plain.id, variant_id: plain.variants[0]!.id, size: '', qty: 1 }]);
    expect(isPurchasable(plain, one)).toBe(true);
    expect(variantInStock(one, plain, plain.variants[0]!)).toBe(true);
  });

  it('caps the public number and drops combinations that no longer exist', () => {
    const v = plain.variants[0]!;
    const rows = [
      { product_id: plain.id, variant_id: v.id, size: '', qty: 500 },
      { product_id: plain.id, variant_id: 'var-gone', size: '', qty: 4 },
      { product_id: 'prod-gone', variant_id: 'x', size: '', qty: 4 },
    ];
    expect(materializeStock(catalog.products, [plain.id, 'prod-gone'], rows)).toEqual({ [plain.id]: { [`${v.id}|`]: 20 } });
    expect(orphanRows(catalog.products, rows).map((r) => r.variant_id)).toEqual(['var-gone', 'x']);
  });

  it('flags the last units', () => {
    expect(isLowStock(2, undefined)).toBe(true);
    expect(isLowStock(3, undefined)).toBe(false);
    expect(isLowStock(0, 5)).toBe(false);
    expect(isLowStock(1, 0)).toBe(false);
    expect(isLowStock(null, 5)).toBe(false);
  });
});
