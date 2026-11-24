import type { Product, StockMap, Variant } from './schema';

/*
 * Stock (shared by the browser and the Worker). The truth is the server's
 * stock_levels table; the public snapshot carries a materialized copy:
 * productId → "<variantId>|<size>" → units, only for products with stock
 * control. Rules:
 * - A product without an entry is not tracked: it behaves as before (the
 *   "available" switches decide).
 * - In a tracked product, a combination without a row counts as 0: nothing
 *   that was not counted is sold.
 * - Public numbers are capped (the bag never holds more than 20 of a line),
 *   so the exact inventory stays in the admin.
 */

export const MOVEMENT_REASONS = ['ajuste', 'pedido', 'devolucao', 'entrada', 'saida', 'maleta', 'retorno_maleta'] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];
export const MOVEMENT_REASON_LABEL: Record<MovementReason, string> = {
  ajuste: 'Ajuste',
  pedido: 'Pedido',
  devolucao: 'Devolução',
  entrada: 'Entrada',
  saida: 'Saída',
  maleta: 'Maleta',
  retorno_maleta: 'Volta da maleta',
};

export const STOCK_PUBLIC_CAP = 20;
export const DEFAULT_LOW_STOCK = 2;
export const MAX_STOCK_QTY = 100_000;

export interface StockRow {
  product_id: string;
  variant_id: string;
  size: string;
  qty: number;
}

export interface Combo {
  variantId: string;
  size: string;
}

export const comboKey = (variantId: string, size?: string | null) => `${variantId}|${size ?? ''}`;

/** Every sellable combination of a product: one per size, or one with size '' when the finish has no sizes. */
export function combosOf(product: Product): Combo[] {
  return product.variants.flatMap((v) => (v.sizes?.length ? v.sizes.map((size) => ({ variantId: v.id, size })) : [{ variantId: v.id, size: '' }]));
}

export const isTracked = (stock: StockMap | undefined, productId: string): boolean => !!stock && Object.hasOwn(stock, productId);

/** Units of one combination, or null when the product has no stock control. */
export function stockOf(stock: StockMap | undefined, productId: string, variantId: string, size?: string | null): number | null {
  if (!stock || !Object.hasOwn(stock, productId)) return null;
  return stock[productId]![comboKey(variantId, size)] ?? 0;
}

/** Units of a finish across its sizes, or null when the product has no stock control. */
export function variantStock(stock: StockMap | undefined, product: Product, variant: Variant): number | null {
  if (!isTracked(stock, product.id)) return null;
  const sizes = variant.sizes?.length ? variant.sizes : [''];
  return sizes.reduce((sum, size) => sum + (stockOf(stock, product.id, variant.id, size) ?? 0), 0);
}

/** A finish can be bought: its switch is on and, when tracked, at least one size has units. */
export function variantInStock(stock: StockMap | undefined, product: Product, variant: Variant): boolean {
  if (!variant.available) return false;
  const units = variantStock(stock, product, variant);
  return units === null || units > 0;
}

/** True when a tracked quantity is at or below the "Últimas unidades" threshold. */
export function isLowStock(units: number | null, threshold: number | undefined): boolean {
  const limit = threshold ?? DEFAULT_LOW_STOCK;
  return units !== null && units > 0 && limit > 0 && units <= limit;
}

/**
 * Builds the public stock map: every tracked product that still exists gets an
 * entry (possibly empty, which means sold out), with only the combinations
 * that exist in the catalog.
 */
export function materializeStock(products: Product[], tracked: Iterable<string>, rows: StockRow[], cap = STOCK_PUBLIC_CAP): StockMap {
  const trackedIds = new Set(tracked);
  const byProduct = new Map<string, StockRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.product_id);
    if (list) list.push(row);
    else byProduct.set(row.product_id, [row]);
  }
  const map: StockMap = {};
  for (const product of products) {
    if (!trackedIds.has(product.id)) continue;
    const productRows = byProduct.get(product.id) ?? [];
    const valid = new Set(combosOf(product).map((c) => comboKey(c.variantId, c.size)));
    const entry: Record<string, number> = {};
    for (const row of productRows) {
      const key = comboKey(row.variant_id, row.size);
      if (valid.has(key)) entry[key] = Math.min(cap, Math.max(0, row.qty));
    }
    map[product.id] = entry;
  }
  return map;
}

/** Rows that no longer match a product, finish or size of the catalog (to delete; the tracking flag stays). */
export function orphanRows(products: Product[], rows: StockRow[]): StockRow[] {
  const valid = new Map(products.map((p) => [p.id, new Set(combosOf(p).map((c) => comboKey(c.variantId, c.size)))]));
  return rows.filter((row) => !valid.get(row.product_id)?.has(comboKey(row.variant_id, row.size)));
}
