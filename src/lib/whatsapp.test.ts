import { describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import { orderTotal, resolveCart, whatsappUrl, type OrderLine } from './whatsapp';

const lines: OrderLine[] = [
  { name: 'Brinco Gota Cristal', finish: 'Rosé', qty: 1, unitCents: 12990 },
  { name: 'Anel Solitário Delicado', finish: 'Dourado', size: '16', qty: 2, unitCents: 13990 },
];

describe('orderTotal', () => {
  it('sums totals in integer centavos', () => {
    expect(orderTotal([{ name: 'a', finish: 'Rosé', qty: 3, unitCents: 3333 }])).toBe(9999);
    expect(orderTotal(lines)).toBe(40970);
  });
});

describe('whatsappUrl', () => {
  it('uses the contact picker while the number is not set', () => {
    expect(whatsappUrl(null, 'Olá & tchau')).toBe('https://wa.me/?text=Ol%C3%A1%20%26%20tchau');
  });
  it('strips non-digits from the number', () => {
    expect(whatsappUrl('+55 (65) 99999-0000', 'oi')).toBe('https://wa.me/5565999990000?text=oi');
  });
});

describe('resolveCart', () => {
  it('prices with the promo price and separates unavailable items', () => {
    const data = createSeed();
    const gota = data.products.find((p) => p.slug === 'brinco-gota-cristal')!;
    const esgotada = data.products.find((p) => !p.available)!;
    const { lines: resolved, unavailable } = resolveCart(
      [
        { productId: gota.id, variantId: gota.variants[0]!.id, qty: 2 },
        { productId: esgotada.id, variantId: esgotada.variants[0]!.id, qty: 1 },
        { productId: 'gone', variantId: 'gone', qty: 1 },
      ],
      data,
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.unitCents).toBe(12990);
    expect(unavailable).toHaveLength(2);
  });
});
