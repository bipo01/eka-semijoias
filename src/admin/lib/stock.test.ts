import { describe, expect, it } from 'vitest';
import { createCatalogSeed } from '../../data/seed';
import { effectivePrice } from '../../data/catalog';
import type { Product } from '../../data/schema';
import { movementOrigin, reasonCounts } from '../sections/StockHistory';
import { stockLine } from '../sections/StockPage';
import { holdingKey, matchesFilter, productStock, stockOverview, type StockData } from './stock';

const products = createCatalogSeed().products;
const plain = products.find((p) => p.variants.length >= 2 && p.variants.every((v) => !v.sizes?.length))!;
const sized = products.find((p) => p.variants.some((v) => v.sizes?.length))!;
const untracked = products.find((p) => p.id !== plain.id && p.id !== sized.id && p.variants.every((v) => !v.sizes?.length))!;

const level = (p: Product, variantIndex: number, qty: number, size = '') => ({ productId: p.id, variantId: p.variants[variantIndex]!.id, size, qty, updatedAt: '2026-11-23T10:00:00.000Z' });

function data(over: Partial<StockData> = {}): StockData {
  return { levels: [], tracked: [], movements: [], inKits: {}, kitsByCombo: {}, motives: { entrada: [], saida: [] }, ...over };
}

describe('productStock', () => {
  it('sums the units at home of the current combinations only, and the units in kits', () => {
    const d = data({
      tracked: [plain.id],
      levels: [level(plain, 0, 3), level(plain, 1, 4), { ...level(plain, 0, 9), variantId: 'removed-finish' }],
      inKits: { [holdingKey(plain.id, plain.variants[0]!.id, '')]: 2, [holdingKey('other', 'x', '')]: 7 },
    });
    expect(productStock(plain, d, 2)).toEqual({ tracked: true, home: 7, inKits: 2, soldOut: false, low: false });
  });

  it('flags sold out (nothing at home) and low (a combination at or below the threshold)', () => {
    expect(productStock(plain, data({ tracked: [plain.id] }), 2)).toMatchObject({ home: 0, soldOut: true, low: false });
    expect(productStock(plain, data({ tracked: [plain.id], levels: [level(plain, 0, 2), level(plain, 1, 10)] }), 2)).toMatchObject({ soldOut: false, low: true });
    expect(productStock(plain, data({ tracked: [plain.id], levels: [level(plain, 0, 2)] }), 0).low).toBe(false);
  });

  it('counts kit units of untracked products, but nothing at home', () => {
    const d = data({ inKits: { [holdingKey(untracked.id, untracked.variants[0]!.id, '')]: 3 } });
    expect(productStock(untracked, d, 2)).toEqual({ tracked: false, home: 0, inKits: 3, soldOut: false, low: false });
  });

  it('keys sized combinations by size', () => {
    const v = sized.variants.find((x) => x.sizes?.length)!;
    const size = v.sizes![0]!;
    const d = data({ tracked: [sized.id], levels: [{ ...level(sized, 0, 5, size), variantId: v.id }], inKits: { [holdingKey(sized.id, v.id, size)]: 1 } });
    expect(productStock(sized, d, 2)).toMatchObject({ home: 5, inKits: 1 });
  });
});

describe('stockOverview', () => {
  it('adds home and kit units, values them at the selling price and counts sold out / low', () => {
    const d = data({
      tracked: [plain.id, sized.id],
      levels: [level(plain, 0, 1), level(plain, 1, 5)],
      inKits: { [holdingKey(plain.id, plain.variants[0]!.id, '')]: 2, [holdingKey(untracked.id, untracked.variants[0]!.id, '')]: 1 },
    });
    const rows = [plain, sized, untracked].map((product) => ({ product, stock: productStock(product, d, 2) }));
    expect(stockOverview(rows)).toEqual({
      home: 6,
      inKits: 3,
      total: 9,
      valueCents: 8 * effectivePrice(plain) + effectivePrice(untracked),
      soldOut: 1, // sized: tracked, nothing at home
      low: 1, // plain: one finish with 1
    });
  });
});

describe('matchesFilter', () => {
  const tracked = { tracked: true, home: 3, inKits: 0, soldOut: false, low: false };
  const soldOut = { tracked: true, home: 0, inKits: 2, soldOut: true, low: false };
  const free = { tracked: false, home: 0, inKits: 0, soldOut: false, low: false };
  it.each([
    ['todas', [true, true, true]],
    ['com-estoque', [true, false, false]],
    ['esgotadas', [false, true, false]],
    ['poucas', [false, false, false]],
    ['maletas', [false, true, false]],
    ['sem-controle', [false, false, true]],
  ] as const)('%s', (filter, expected) => {
    expect([tracked, soldOut, free].map((s) => matchesFilter(s, filter))).toEqual(expected);
  });
});

describe('stock wording', () => {
  it('describes a product row', () => {
    expect(stockLine({ tracked: true, home: 3, inKits: 2, soldOut: false, low: false })).toBe('3 em casa · 2\u00a0nas\u00a0maletas');
    expect(stockLine({ tracked: true, home: 1, inKits: 0, soldOut: false, low: true })).toBe('1 em casa · poucas unidades');
    expect(stockLine({ tracked: true, home: 0, inKits: 0, soldOut: true, low: false })).toBe('Esgotada em casa');
    expect(stockLine({ tracked: false, home: 0, inKits: 4, soldOut: false, low: false })).toBe('Sem controle de estoque · 4\u00a0nas\u00a0maletas');
  });

  it('names the order or the kit of a movement', () => {
    expect(movementOrigin({ orderNumber: 1042, kitId: null, resellerName: null })).toBe('Pedido nº 1042');
    expect(movementOrigin({ orderNumber: null, kitId: 'kit_1', resellerName: 'Ana' })).toBe('Maleta de Ana');
    expect(movementOrigin({ orderNumber: null, kitId: 'kit_1', resellerName: null })).toBe('Maleta');
    expect(movementOrigin({ orderNumber: null, kitId: null, resellerName: null })).toBeNull();
  });

  it('lists the reasons present in canonical order with counts', () => {
    expect(reasonCounts([{ reason: 'saida' }, { reason: 'ajuste' }, { reason: 'saida' }, { reason: 'maleta' }])).toEqual([
      { reason: 'ajuste', count: 1 },
      { reason: 'saida', count: 2 },
      { reason: 'maleta', count: 1 },
    ]);
  });
});
