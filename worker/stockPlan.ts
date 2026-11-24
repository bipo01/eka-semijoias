import type { StockMove } from '../src/data/orders';
import { combosOf, type StockRow } from '../src/data/stock';
import { sizeLabel } from '../src/data/catalog';
import { FINISH_LABEL, type Finish } from '../src/data/schema';
import { guard } from './db';
import { rowKey, type StockState } from './stock';

/*
 * Stock moves for orders and reseller kits (docs/revenda/PLAN.md §4): give
 * back what an owner held and take what it holds now, netted per
 * combination, every decrease guarded. Callers add the catalog-version guard
 * (publishStatements) to the same batch.
 */

/** True when a stock move applies: the product is tracked and the finish/size still exists. */
export function counted(state: StockState, move: StockMove): boolean {
  if (!state.tracked.has(move.productId)) return false;
  const product = state.catalog.products.find((p) => p.id === move.productId);
  return !!product && combosOf(product).some((c) => c.variantId === move.variantId && c.size === move.size);
}

/** "Anel Solitário, Dourado, aro 16" for stock messages (labels, never internal ids). */
export const describe = (m: { name: string; size: string }, finish: Finish) => [m.name, FINISH_LABEL[finish], m.size && sizeLabel(m.size)].filter(Boolean).join(', ');

/** Who holds the units: an order (movements 'pedido' / 'devolucao') or a reseller kit ('maleta' / 'retorno_maleta'). */
export type StockHolder = { orderId: string } | { kitId: string };

/** A movement row whose `qty_after` is read from the row just updated (same batch, so it is exact). */
function holderMovement(db: D1Database, at: string, move: { productId: string; variantId: string; size: string }, delta: number, holder: StockHolder): D1PreparedStatement {
  if ('orderId' in holder) {
    // The order number is read in the same batch, so a brand-new order's works too.
    return db
      .prepare(
        `INSERT INTO stock_movements (at, product_id, variant_id, size, delta, qty_after, reason, order_number)
         SELECT ?1, ?2, ?3, ?4, ?5, qty, ?6, (SELECT number FROM orders WHERE id = ?7) FROM stock_levels WHERE product_id = ?2 AND variant_id = ?3 AND size = ?4`,
      )
      .bind(at, move.productId, move.variantId, move.size, delta, delta < 0 ? 'pedido' : 'devolucao', holder.orderId);
  }
  return db
    .prepare(
      `INSERT INTO stock_movements (at, product_id, variant_id, size, delta, qty_after, reason, kit_id)
       SELECT ?1, ?2, ?3, ?4, ?5, qty, ?6, ?7 FROM stock_levels WHERE product_id = ?2 AND variant_id = ?3 AND size = ?4`,
    )
    .bind(at, move.productId, move.variantId, move.size, delta, delta < 0 ? 'maleta' : 'retorno_maleta', holder.kitId);
}

export interface StockPlan {
  /** Guarded updates and movements, net per combination. Empty when nothing moves. */
  statements: D1PreparedStatement[];
  /** Every stock row after the change (for the snapshot). */
  rows: StockRow[];
  /** What the holder keeps afterwards (its new `stockMoves`). */
  taken: StockMove[];
  /** pt-BR lines for combinations without enough units. */
  problems: string[];
}

/**
 * Gives back `give` and takes `take` (only combinations still under stock control), netted per
 * combination: swapping a piece moves only the difference, and every decrease is guarded
 * (`qty >= n`) besides the CHECK on the table and the catalog-version guard.
 */
export function planStock(
  db: D1Database,
  state: StockState,
  at: string,
  holder: StockHolder,
  give: StockMove[],
  take: StockMove[],
  items: { productId: string; variantId: string; size?: string | undefined; name: string; finish: Finish }[],
): StockPlan {
  const before = new Map(state.rows.map((r) => [rowKey(r.product_id, r.variant_id, r.size), r.qty]));
  const qty = new Map(before);
  const touched = new Map<string, StockMove>();
  for (const move of give) {
    if (!counted(state, move)) continue;
    const key = rowKey(move.productId, move.variantId, move.size);
    qty.set(key, (qty.get(key) ?? 0) + move.qty);
    touched.set(key, move);
  }
  const taken: StockMove[] = [];
  const problems: string[] = [];
  for (const move of take) {
    if (!counted(state, move)) continue;
    const key = rowKey(move.productId, move.variantId, move.size);
    const have = qty.get(key) ?? 0;
    if (have < move.qty) {
      const item = items.find((i) => i.productId === move.productId && i.variantId === move.variantId && (i.size ?? '') === move.size);
      problems.push(`${item ? describe({ name: item.name, size: move.size }, item.finish) : 'Peça'}: pedido ${move.qty}, disponível ${have}`);
      continue;
    }
    qty.set(key, have - move.qty);
    taken.push(move);
    touched.set(key, move);
  }
  const rows = new Map(state.rows.map((r) => [rowKey(r.product_id, r.variant_id, r.size), r]));
  const statements: D1PreparedStatement[] = [];
  for (const [key, move] of touched) {
    const after = qty.get(key) ?? 0;
    const delta = after - (before.get(key) ?? 0);
    if (!delta) continue;
    rows.set(key, { product_id: move.productId, variant_id: move.variantId, size: move.size, qty: after });
    if (delta < 0) {
      statements.push(
        guard(db, '(SELECT qty FROM stock_levels WHERE product_id = ?1 AND variant_id = ?2 AND size = ?3) >= ?4', move.productId, move.variantId, move.size, -delta),
        db.prepare('UPDATE stock_levels SET qty = qty + ?4, updated_at = ?5 WHERE product_id = ?1 AND variant_id = ?2 AND size = ?3').bind(move.productId, move.variantId, move.size, delta, at),
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO stock_levels (product_id, variant_id, size, qty, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (product_id, variant_id, size) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at`,
          )
          .bind(move.productId, move.variantId, move.size, delta, at),
      );
    }
    statements.push(holderMovement(db, at, move, delta, holder));
  }
  return { statements, rows: [...rows.values()], taken, problems };
}

/**
 * What a holder (order or kit) must take for its new lines, given what it held. A line confirmed
 * while its piece had no stock control held fewer units than it had (its "untracked share", which
 * never left the counted stock); only quantities beyond that share are taken. Give back `held` in
 * full: planStock nets the two per combination.
 */
export function takeForLines(lines: StockMove[], before: { productId: string; variantId: string; size: string; qty: number }[], held: StockMove[]): StockMove[] {
  const heldQty = new Map(held.map((m) => [rowKey(m.productId, m.variantId, m.size), m.qty]));
  const prior = new Map(before.map((b) => [rowKey(b.productId, b.variantId, b.size), b.qty]));
  return lines.flatMap((m) => {
    const k = rowKey(m.productId, m.variantId, m.size);
    const previous = prior.get(k);
    if (previous === undefined) return [m];
    const untracked = Math.max(0, previous - (heldQty.get(k) ?? 0));
    const qty = m.qty - untracked;
    return qty > 0 ? [{ ...m, qty }] : [];
  });
}
