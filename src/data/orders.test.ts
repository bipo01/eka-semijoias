import { describe, expect, it } from 'vitest';
import { createCatalogSeed } from './seed';
import { effectivePrice } from './catalog';
import { awaitingReview, receiptsEraseAt, receiptsExpired, RECEIPT_KEEP_MS, settledSince, storedReceipts, withReceiptsErased, canTransition, chargeAmount, HOLDS_STOCK, payState, saleCents, NEXT_STEP, ORDER_STATUSES, orderRequestSchema, priceOrder, pricingMessage, TRANSITIONS, UNDO_STEP } from './orders';
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

describe('receipt files after the payment', () => {
  const day = 24 * 3600_000;
  const t0 = Date.parse('2026-12-01T12:00:00.000Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  const receipt = { id: 'rcp_1', at: iso(t0 - day), contentType: 'image/png' as const, size: 1000 };
  const order = (status: 'confirmado' | 'pago' | 'entregue' | 'cancelado', history: { at: string; status: 'enviado' | 'confirmado' | 'pago' | 'entregue' | 'cancelado'; event?: 'itens' }[]) => ({ status, history, receipts: [receipt] });

  it('counts from the first settled step of the current run (paid then delivered keeps counting from paid)', () => {
    const o = order('entregue', [
      { at: iso(t0 - 3 * day), status: 'confirmado' },
      { at: iso(t0), status: 'pago' },
      { at: iso(t0 + day), status: 'pago', event: 'itens' },
      { at: iso(t0 + 2 * day), status: 'entregue' },
    ]);
    expect(settledSince(o)).toBe(iso(t0));
    expect(receiptsExpired(o, t0 + RECEIPT_KEEP_MS - 1)).toBe(false);
    expect(receiptsExpired(o, t0 + RECEIPT_KEEP_MS)).toBe(true);
  });

  it('never erases while the payment is open, and a reopened order starts over', () => {
    expect(settledSince(order('confirmado', [{ at: iso(t0), status: 'confirmado' }]))).toBeNull();
    const reopened = order('pago', [
      { at: iso(t0), status: 'pago' },
      { at: iso(t0 + day), status: 'confirmado' },
      { at: iso(t0 + 2 * day), status: 'pago' },
    ]);
    expect(settledSince(reopened)).toBe(iso(t0 + 2 * day));
    expect(receiptsExpired(reopened, t0 + RECEIPT_KEEP_MS + day)).toBe(false);
  });

  it('keeps the record of an erased file and stops counting it as waiting for review', () => {
    const paid = order('pago', [{ at: iso(t0), status: 'pago' }]);
    const erased = withReceiptsErased(paid, iso(t0 + day));
    expect(erased.receipts).toEqual([{ ...receipt, erasedAt: iso(t0 + day) }]);
    expect(storedReceipts(erased)).toEqual([]);
    expect(receiptsExpired(erased, t0 + 30 * day)).toBe(false);
    // Reopened after the erasure: nothing left to check, and the payment page asks for the payment again.
    expect(awaitingReview({ ...erased, status: 'confirmado' })).toBe(false);
    expect(payState({ ...erased, status: 'confirmado', charge: undefined })).toBe('aguardando');
    expect(awaitingReview({ ...paid, status: 'confirmado' })).toBe(true);
  });

  it('tells the day of the daily run that erases the files (03:00 in Cuiabá, never later than 7 days)', () => {
    expect(receiptsEraseAt('2026-12-01T12:00:00.000Z').toISOString()).toBe('2026-12-08T07:00:00.000Z');
    expect(receiptsEraseAt('2026-12-01T06:30:00.000Z').toISOString()).toBe('2026-12-07T07:00:00.000Z');
    expect(receiptsEraseAt('2026-12-01T07:00:00.000Z').toISOString()).toBe('2026-12-07T07:00:00.000Z');
  });
});
