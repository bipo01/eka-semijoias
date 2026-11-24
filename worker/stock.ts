import { z } from 'zod';
import type { Catalog } from '../src/data/schema';
import { comboKey, combosOf, materializeStock, MAX_STOCK_QTY, type MovementReason, type StockRow } from '../src/data/stock';
import { requireSession } from './auth';
import { IDEMPOTENCY_TTL_MS, nextVersion, parseSnapshotBody, snapshotBody, SNAPSHOT_MAX_BYTES, WRITE_ATTEMPTS } from './catalog';
import { guard, isGuardMiss, toHttpError, withReadRetry } from './db';
import { HttpError, json, readJson, zodDetails } from './http';
import { notifyCatalog } from './live';
import type { Context } from './router';

/*
 * Stock control. stock_levels is the truth; every change also rewrites the
 * public snapshot (materialized `stock` map) and bumps the catalog version in
 * the same batch, guarded by the version read. So the catalog version guards
 * stock too: two concurrent writers can never both apply on the same state.
 */

export interface StockState {
  catalog: Catalog;
  version: number;
  rows: StockRow[];
  tracked: Set<string>;
}

/** Reads the snapshot, every stock row and the tracked products in one round trip. */
export async function loadStockState(db: D1Database): Promise<StockState> {
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT version, body FROM catalog_snapshot WHERE id = 1'),
      db.prepare('SELECT product_id, variant_id, size, qty FROM stock_levels'),
      db.prepare('SELECT product_id FROM stock_tracked'),
    ]),
  );
  const snapshot = results[0]?.results[0] as { version: number; body: string } | undefined;
  if (!snapshot) throw new HttpError('internal');
  return {
    catalog: parseSnapshotBody(snapshot.body),
    version: snapshot.version,
    rows: (results[1]?.results ?? []) as unknown as StockRow[],
    tracked: new Set((results[2]?.results ?? []).map((r) => r.product_id as string)),
  };
}

export const rowKey = (productId: string, variantId: string, size: string) => `${productId}|${comboKey(variantId, size)}`;

/**
 * The statements that publish a stock change: the version guard (first) and
 * the rewritten snapshot. `rows`/`tracked` are the state after the change.
 */
export function publishStatements(db: D1Database, state: StockState, rows: StockRow[], tracked: Set<string>): { version: number; statements: D1PreparedStatement[]; first: D1PreparedStatement } {
  const version = nextVersion(state.version);
  const catalog: Catalog = { ...state.catalog, stock: materializeStock(state.catalog.products, tracked, rows) };
  const body = snapshotBody(catalog, version);
  if (new TextEncoder().encode(body).byteLength > SNAPSHOT_MAX_BYTES) throw new HttpError('integrity', 'O catálogo ficou grande demais para salvar.');
  return {
    version,
    first: guard(db, '(SELECT version FROM catalog_snapshot WHERE id = 1) = ?1', state.version),
    statements: [db.prepare('UPDATE catalog_snapshot SET version = ?1, body = ?2 WHERE id = 1').bind(version, body)],
  };
}

/** Inserts a movement whose `qty_after` is read from the row just updated (same batch, so it is exact). */
export function movementStatement(
  db: D1Database,
  at: string,
  productId: string,
  variantId: string,
  size: string,
  delta: number,
  reason: MovementReason,
  orderNumber: number | null,
  extra: { note?: string; kitId?: string } = {},
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO stock_movements (at, product_id, variant_id, size, delta, qty_after, reason, order_number, note, kit_id)
       SELECT ?1, ?2, ?3, ?4, ?5, qty, ?6, ?7, ?8, ?9 FROM stock_levels WHERE product_id = ?2 AND variant_id = ?3 AND size = ?4`,
    )
    .bind(at, productId, variantId, size, delta, reason, orderNumber, extra.note ?? null, extra.kitId ?? null);
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

const MOVEMENTS_LIMIT = 500;

/** GET /api/admin/stock — exact levels, tracked products and the latest movements. */
export async function handleGetStock(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT product_id, variant_id, size, qty, updated_at FROM stock_levels'),
      db.prepare('SELECT product_id FROM stock_tracked'),
      db.prepare('SELECT id, at, product_id, variant_id, size, delta, qty_after, reason, order_number FROM stock_movements ORDER BY id DESC LIMIT ?1').bind(MOVEMENTS_LIMIT),
    ]),
  );
  return json({
    levels: (results[0]?.results ?? []).map((r) => ({ productId: r.product_id, variantId: r.variant_id, size: r.size, qty: r.qty, updatedAt: r.updated_at })),
    tracked: (results[1]?.results ?? []).map((r) => r.product_id),
    movements: (results[2]?.results ?? []).map((r) => ({
      id: r.id,
      at: r.at,
      productId: r.product_id,
      variantId: r.variant_id,
      size: r.size,
      delta: r.delta,
      qtyAfter: r.qty_after,
      reason: r.reason,
      orderNumber: r.order_number ?? null,
    })),
  });
}

const putSchema = z.object({
  tracked: z.boolean(),
  levels: z
    .array(
      z.object({
        variantId: z.string().min(1).max(64),
        size: z.string().max(12),
        qty: z.number().int().min(0).max(MAX_STOCK_QTY),
        /** The quantity the editor started from (null: no row). A mismatch means someone else changed it. */
        expected: z.number().int().min(0).nullable(),
      }),
    )
    .max(400),
});

/**
 * PUT /api/admin/stock/:productId { tracked, levels } — sets the units of a
 * product's combinations (compare-and-swap per combination via `expected`),
 * or turns stock control on/off.
 */
export async function handlePutStock(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const productId = ctx.params.productId ?? '';
  const input = putSchema.safeParse(await readJson(ctx.request, 64 * 1024));
  if (!input.success) throw new HttpError('bad_request', 'Dados de estoque inválidos.', zodDetails(input.error.issues));
  const { tracked: wantTracked, levels } = input.data;

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const state = await loadStockState(db);
    const product = state.catalog.products.find((p) => p.id === productId);
    if (!product) throw new HttpError('not_found', 'Esta peça não existe mais.');
    const valid = new Set(combosOf(product).map((c) => comboKey(c.variantId, c.size)));
    const current = new Map(state.rows.filter((r) => r.product_id === productId).map((r) => [comboKey(r.variant_id, r.size), r.qty]));
    const wasTracked = state.tracked.has(productId);
    const now = new Date().toISOString();

    const statements: D1PreparedStatement[] = [];
    let rows = state.rows;
    const tracked = new Set(state.tracked);
    let changed = 0;

    if (!wantTracked) {
      if (!wasTracked) return json({ version: state.version, changed: 0 });
      tracked.delete(productId);
      rows = rows.filter((r) => r.product_id !== productId);
      statements.push(
        db.prepare('DELETE FROM stock_tracked WHERE product_id = ?1').bind(productId),
        db.prepare('DELETE FROM stock_levels WHERE product_id = ?1').bind(productId),
      );
      changed = 1;
    } else {
      const seen = new Set<string>();
      const conflicts: { variantId: string; size: string; current: number | null }[] = [];
      for (const level of levels) {
        const key = comboKey(level.variantId, level.size);
        if (!valid.has(key)) throw new HttpError('bad_request', 'Acabamento ou tamanho que não existe nesta peça. Recarregue a página.');
        if (seen.has(key)) throw new HttpError('bad_request', 'Combinação repetida.');
        seen.add(key);
        const now_ = current.get(key) ?? null;
        if (now_ !== level.expected) conflicts.push({ variantId: level.variantId, size: level.size, current: now_ });
      }
      if (conflicts.length) {
        throw new HttpError('conflict', 'O estoque desta peça mudou enquanto você editava (um pedido foi confirmado ou outro aparelho salvou). Confira os números e salve de novo.', { conflicts });
      }
      if (!wasTracked) {
        tracked.add(productId);
        statements.push(db.prepare('INSERT INTO stock_tracked (product_id, since) VALUES (?1, ?2) ON CONFLICT (product_id) DO NOTHING').bind(productId, now));
        changed++;
      }
      const nextRows = new Map(rows.map((r) => [rowKey(r.product_id, r.variant_id, r.size), r]));
      for (const level of levels) {
        const before = current.get(comboKey(level.variantId, level.size)) ?? null;
        if (before === level.qty) continue;
        changed++;
        nextRows.set(rowKey(productId, level.variantId, level.size), { product_id: productId, variant_id: level.variantId, size: level.size, qty: level.qty });
        statements.push(
          db
            .prepare(
              `INSERT INTO stock_levels (product_id, variant_id, size, qty, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
               ON CONFLICT (product_id, variant_id, size) DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at`,
            )
            .bind(productId, level.variantId, level.size, level.qty, now),
          movementStatement(db, now, productId, level.variantId, level.size, level.qty - (before ?? 0), 'ajuste', null),
        );
      }
      rows = [...nextRows.values()];
    }
    if (!changed) return json({ version: state.version, changed: 0 });

    const publish = publishStatements(db, state, rows, tracked);
    const summary = wantTracked ? `Estoque de ${product.name} ajustado` : `Controle de estoque desligado: ${product.name}`;
    try {
      await db.batch([
        publish.first,
        ...statements,
        ...publish.statements,
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(now, 'stock.set', summary.slice(0, 500)),
        db.prepare('DELETE FROM idempotency WHERE created_at < ?1').bind(Date.now() - IDEMPOTENCY_TTL_MS),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyCatalog(ctx.env, publish.version));
    return json({ version: publish.version, changed });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}
