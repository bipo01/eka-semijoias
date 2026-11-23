import { describe, expect, it } from 'vitest';
import type { Order, OrderStatus } from './orders';
import { computeReport, periodRange } from './report';

let n = 1000;
function order(status: OrderStatus, createdAt: string, items: [string, string, number, number][], city = 'Campo Grande'): Order {
  const list = items.map(([productId, categoryId, qty, unitCents]) => ({
    productId,
    variantId: `${productId}-v`,
    qty,
    name: productId.toUpperCase(),
    finish: 'dourado' as const,
    categoryId,
    categoryName: categoryId,
    unitCents,
  }));
  return {
    id: `o${++n}`,
    number: n,
    status,
    createdAt,
    updatedAt: createdAt,
    customer: { name: 'Ana', city },
    items: list,
    totalCents: list.reduce((s, i) => s + i.qty * i.unitCents, 0),
    pix: false,
    history: [{ at: createdAt, status }],
  };
}

describe('computeReport', () => {
  const now = new Date(2026, 10, 20, 15, 0);
  const local = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
  const orders = [
    order('confirmado', local(19), [['anel', 'aneis', 2, 5000]]),
    order('pago', local(20, 9), [['anel', 'aneis', 1, 5000], ['brinco', 'brincos', 1, 3000]], ' campo grande '),
    order('entregue', local(10), [['colar', 'colares', 1, 9000]], 'Dourados'),
    order('enviado', local(20), [['brinco', 'brincos', 1, 3000]]),
    order('enviado', local(15), [['brinco', 'brincos', 1, 3000]]),
    order('cancelado', local(19), [['anel', 'aneis', 5, 5000]]),
    order('pago', local(1, 12).replace('2026-11', '2026-10'), [['anel', 'aneis', 1, 5000]]),
  ];

  it('counts only confirmed, paid and delivered orders as sales', () => {
    const r = computeReport(orders, periodRange('7d', now), now);
    expect(r.orders).toBe(2);
    expect(r.revenueCents).toBe(10000 + 8000);
    expect(r.averageCents).toBe(9000);
    expect(r.units).toBe(4);
    expect(r.cancelled).toBe(1);
    expect(r.negotiating).toEqual({ orders: 2, cents: 6000 });
    expect(r.products[0]).toMatchObject({ key: 'anel', units: 3, cents: 15000 });
    expect(r.categories.map((c) => c.key)).toEqual(['aneis', 'brincos']);
    expect(r.cities).toHaveLength(1); // "Campo Grande" and " campo grande " are one city
    expect(r.cities[0]).toMatchObject({ units: 2, cents: 18000 });
  });

  it('builds one bucket per day (or month) and places sales in local days', () => {
    const r = computeReport(orders, periodRange('7d', now), now);
    expect(r.buckets).toHaveLength(7);
    expect(r.buckets.at(-1)).toMatchObject({ cents: 8000, orders: 1 });
    expect(r.buckets.at(-2)).toMatchObject({ cents: 10000, orders: 1 });
    const year = computeReport(orders, periodRange('12m', now), now);
    expect(year.buckets).toHaveLength(12);
    expect(year.orders).toBe(4);
  });

  it('lists orders stuck in negotiation for more than two days, oldest first', () => {
    const r = computeReport(orders, periodRange('hoje', now), now);
    expect(r.stale.map((o) => o.createdAt)).toEqual([local(15)]);
  });
});
