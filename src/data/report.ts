import { FINISH_LABEL } from './schema';
import { IS_SALE, saleCents, type Order } from './orders';

/*
 * Sales report, computed in the browser from the orders the admin already
 * loaded (pure, unit-tested). Dates group in the device's time zone. Only
 * confirmed, paid and delivered orders count as sales; orders still "em
 * negociação" are reported apart, cancelled ones are left out.
 */

export type PeriodId = 'hoje' | '7d' | '30d' | 'mes' | 'mes-passado' | '12m';

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mes-passado', label: 'Mês passado' },
  { id: '12m', label: '12 meses' },
];

export interface Period {
  from: Date;
  /** Exclusive. */
  to: Date;
  bucket: 'day' | 'month';
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function periodRange(id: PeriodId, now = new Date()): Period {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (id) {
    case 'hoje':
      return { from: today, to: tomorrow, bucket: 'day' };
    case '7d':
      return { from: addDays(today, -6), to: tomorrow, bucket: 'day' };
    case '30d':
      return { from: addDays(today, -29), to: tomorrow, bucket: 'day' };
    case 'mes':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow, bucket: 'day' };
    case 'mes-passado':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1), bucket: 'day' };
    case '12m':
      return { from: new Date(now.getFullYear(), now.getMonth() - 11, 1), to: tomorrow, bucket: 'month' };
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export interface Ranked {
  key: string;
  label: string;
  units: number;
  cents: number;
}

export interface Bucket {
  key: string;
  date: Date;
  cents: number;
  orders: number;
}

export interface SalesReport {
  revenueCents: number;
  orders: number;
  units: number;
  averageCents: number;
  buckets: Bucket[];
  products: Ranked[];
  categories: Ranked[];
  finishes: Ranked[];
  cities: Ranked[];
  negotiating: { orders: number; cents: number };
  cancelled: number;
  /** Orders still "em negociação" for longer than `staleHours` (any date), oldest first. */
  stale: Order[];
}

export const STALE_HOURS = 48;

const inRange = (iso: string, p: Period) => {
  const t = Date.parse(iso);
  return t >= p.from.getTime() && t < p.to.getTime();
};

function rank(map: Map<string, Ranked>): Ranked[] {
  return [...map.values()].sort((a, b) => b.cents - a.cents || b.units - a.units || a.label.localeCompare(b.label, 'pt-BR'));
}

function bump(map: Map<string, Ranked>, key: string, label: string, units: number, cents: number) {
  const entry = map.get(key);
  if (entry) {
    entry.units += units;
    entry.cents += cents;
  } else map.set(key, { key, label, units, cents });
}

/** Normalizes a city for grouping ("  cuiabá " and "Cuiabá" are the same). */
export const cityKey = (city: string) =>
  city
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function buckets(period: Period): Bucket[] {
  const out: Bucket[] = [];
  if (period.bucket === 'month') {
    for (let d = new Date(period.from); d < period.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push({ key: monthKey(d), date: d, cents: 0, orders: 0 });
  } else {
    for (let d = new Date(period.from); d < period.to; d = addDays(d, 1)) out.push({ key: dayKey(d), date: d, cents: 0, orders: 0 });
  }
  return out;
}

export function computeReport(orders: Order[], period: Period, now = new Date()): SalesReport {
  const series = buckets(period);
  const byKey = new Map(series.map((b) => [b.key, b]));
  const products = new Map<string, Ranked>();
  const categories = new Map<string, Ranked>();
  const finishes = new Map<string, Ranked>();
  const cities = new Map<string, Ranked>();
  let revenueCents = 0;
  let count = 0;
  let units = 0;
  const negotiating = { orders: 0, cents: 0 };
  let cancelled = 0;

  for (const order of orders) {
    if (!inRange(order.createdAt, period)) continue;
    if (order.status === 'enviado') {
      negotiating.orders++;
      negotiating.cents += order.totalCents;
      continue;
    }
    if (order.status === 'cancelado') {
      cancelled++;
      continue;
    }
    if (!IS_SALE.has(order.status)) continue;
    count++;
    const value = saleCents(order);
    revenueCents += value;
    const created = new Date(order.createdAt);
    const bucket = byKey.get(period.bucket === 'month' ? monthKey(created) : dayKey(created));
    if (bucket) {
      bucket.cents += value;
      bucket.orders++;
    }
    for (const item of order.items) {
      const cents = item.unitCents * item.qty;
      units += item.qty;
      bump(products, item.productId, item.name, item.qty, cents);
      bump(categories, item.categoryId, item.categoryName || 'Sem categoria', item.qty, cents);
      bump(finishes, item.finish, FINISH_LABEL[item.finish], item.qty, cents);
    }
    if (!order.anonymized && order.customer.city.trim()) {
      const key = cityKey(order.customer.city);
      const label = cities.get(key)?.label ?? order.customer.city.trim();
      bump(cities, key, label, 1, value);
    }
  }

  const staleBefore = now.getTime() - STALE_HOURS * 3600_000;
  const stale = orders.filter((o) => o.status === 'enviado' && Date.parse(o.createdAt) < staleBefore).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    revenueCents,
    orders: count,
    units,
    averageCents: count ? Math.round(revenueCents / count) : 0,
    buckets: series,
    products: rank(products),
    categories: rank(categories),
    finishes: rank(finishes),
    cities: rank(cities),
    negotiating,
    cancelled,
    stale,
  };
}
