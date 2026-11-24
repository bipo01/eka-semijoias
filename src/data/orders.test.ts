import { describe, expect, it } from 'vitest';
import { createCatalogSeed } from './seed';
import { effectivePrice } from './catalog';
import { awaitingReview, canTransition, chargeAmount, HOLDS_STOCK, payState, saleCents, NEXT_STEP, ORDER_STATUSES, orderRequestSchema, priceOrder, pricingMessage, TRANSITIONS, UNDO_STEP } from './orders';
import { materializeStock } from './stock';

const catalog = createCatalogSeed();
const plain = catalog.products.find((p) => p.variants.every((v) => !v.sizes?.length) && p.available && p.variants.every((v) => v.available))!;
const ring = catalog.products.find((p) => p.variants.some((v) => v.sizes?.length) && p.available && p.variants.every((v) => v.available))!;
const soldOut = catalog.products.find((p) => !p.available)!;

describe('order statuses', () => {
  it('only allows the documented moves, and every next/undo step is allowed', () => {
    for (const from of ORDER_STATUSES) {
      const next = NEXT_STEP[from];
      if (next) expect(canTransition(from, next.to)).toBe(true);
      const undo = UNDO_STEP[from];
      if (undo) expect(canTransition(from, undo)).toBe(true);
    }
    expect(canTransition('enviado', 'entregue')).toBe(false);
    expect(canTransition('entregue', 'cancelado')).toBe(false);
    expect(TRANSITIONS.cancelado).toEqual(['enviado']);
    expect([...HOLDS_STOCK]).toEqual(['confirmado', 'pago', 'entregue']);
  });
});

describe('orderRequestSchema', () => {
  it('requires name and city and trims them', () => {
    const base = { items: [{ productId: 'p', variantId: 'v', qty: 1 }] };
    expect(orderRequestSchema.safeParse({ ...base, name: ' ', city: 'Rio' }).success).toBe(false);
    const ok = orderRequestSchema.parse({ ...base, name: '  Ana   Luiza ', city: ' Várzea   Grande ', note: '  ' });
    expect(ok.name).toBe('Ana Luiza');
    expect(ok.city).toBe('Várzea Grande');
    expect(ok.note).toBeUndefined();
  });
});

describe('priceOrder', () => {
  it('prices from the catalog and merges repeated lines', () => {
    const v = plain.variants[0]!;
    const result = priceOrder(catalog, [
      { productId: plain.id, variantId: v.id, qty: 1 },
      { productId: plain.id, variantId: v.id, qty: 2 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.qty).toBe(3);
    expect(result.items[0]!.unitCents).toBe(effectivePrice(plain));
    expect(result.totalCents).toBe(effectivePrice(plain) * 3);
    expect(result.items[0]!.categoryName).toBeTruthy();
  });

  it('refuses missing, unavailable, wrong-size and over-stock lines', () => {
    const rv = ring.variants[0]!;
    expect(priceOrder(catalog, [{ productId: 'nope', variantId: 'x', qty: 1 }])).toMatchObject({ ok: false, problems: [{ reason: 'missing' }] });
    expect(priceOrder(catalog, [{ productId: soldOut.id, variantId: soldOut.variants[0]!.id, qty: 1 }])).toMatchObject({ ok: false, problems: [{ reason: 'unavailable' }] });
    expect(priceOrder(catalog, [{ productId: ring.id, variantId: rv.id, qty: 1 }])).toMatchObject({ ok: false, problems: [{ reason: 'size' }] });
    expect(priceOrder(catalog, [{ productId: ring.id, variantId: rv.id, size: '99', qty: 1 }])).toMatchObject({ ok: false, problems: [{ reason: 'size' }] });
    const size = rv.sizes![0]!;
    const stock = materializeStock(catalog.products, [ring.id], [{ product_id: ring.id, variant_id: rv.id, size, qty: 2 }]);
    const limited = { ...catalog, stock };
    expect(priceOrder(limited, [{ productId: ring.id, variantId: rv.id, size, qty: 2 }]).ok).toBe(true);
    const over = priceOrder(limited, [{ productId: ring.id, variantId: rv.id, size, qty: 3 }]);
    expect(over).toMatchObject({ ok: false, problems: [{ reason: 'stock', available: 2 }] });
    if (!over.ok) expect(pricingMessage(over.problems)).toContain('Só temos 2 unidades');
    expect(priceOrder(limited, [{ productId: ring.id, variantId: rv.id, size: rv.sizes![1]!, qty: 1 }])).toMatchObject({ ok: false, problems: [{ reason: 'unavailable' }] });
  });
});

describe('charges and receipts', () => {
  it('computes the charge and the sale value', () => {
    expect(chargeAmount(10000, 2000, 500)).toBe(11500);
    expect(saleCents({ totalCents: 10000, charge: { token: 'x'.repeat(32), shippingCents: 2000, discountCents: 500, amountCents: 11500, createdAt: '2026-11-23T00:00:00Z' } })).toBe(9500);
    expect(saleCents({ totalCents: 10000 })).toBe(10000);
  });

  it('maps the order to the payment page state', () => {
    const r = [{ id: 'rcp_1', at: '2026-11-23T00:00:00Z', contentType: 'image/png' as const, size: 10 }];
    expect(payState({ status: 'confirmado' })).toBe('aguardando');
    expect(payState({ status: 'confirmado', receipts: r })).toBe('analise');
    expect(payState({ status: 'pago', receipts: r })).toBe('pago');
    expect(payState({ status: 'entregue' })).toBe('pago');
    expect(payState({ status: 'cancelado', receipts: r })).toBe('cancelado');
    expect(awaitingReview({ status: 'confirmado', receipts: r })).toBe(true);
    expect(awaitingReview({ status: 'pago', receipts: r })).toBe(false);
    expect(awaitingReview({ status: 'confirmado' })).toBe(false);
  });
});
