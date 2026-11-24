import { z } from 'zod';
import { kitSchema, kitState, lineKey, resellerSaleSchema } from '../src/data/revenda';
import { sizeLabel } from '../src/data/catalog';
import { FINISH_LABEL, type Catalog } from '../src/data/schema';
import { comboKey, combosOf, materializeStock, MAX_STOCK_QTY, type MovementReason, type StockRow } from '../src/data/stock';
import { requireSession } from './auth';
import { ensureSeeded, IDEMPOTENCY_TTL_MS, nextVersion, parseSnapshotBody, snapshotBody, SNAPSHOT_MAX_BYTES, WRITE_ATTEMPTS } from './catalog';
import { sha256Hex } from './crypto';
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

/** Units of one kit combination still with a reseller (pieces in an open kit minus what she sold). */
export interface KitHolding {
  kitId: string;
  resellerId: string;
  /** First name only (enough to tell resellers apart on the stock page). */
  resellerName: string;
  qty: number;
}

function parseDoc(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'string') return null;
  try {
    const value: unknown = JSON.parse(data);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The first name in a reseller document ('' when unreadable). */
function firstName(data: unknown): string {
  const name = parseDoc(data)?.name;
  return typeof name === 'string' ? (name.trim().split(/\s+/)[0] ?? '') : '';
}

/**
 * Units with resellers, per "productId|variantId|size": for every open kit, each line's quantity
 * minus what its active sales sold. Rows that do not parse are skipped (the stock page never fails
 * because of one). The row columns win over the document: they are the truth for id, status, dates.
 */
export function unitsInKits(kitRows: Record<string, unknown>[], saleRows: Record<string, unknown>[]): { inKits: Record<string, number>; kitsByCombo: Record<string, KitHolding[]> } {
  const salesByKit = new Map<string, z.infer<typeof resellerSaleSchema>[]>();
  for (const row of saleRows) {
    const doc = parseDoc(row.data);
    if (!doc) continue;
    const sale = resellerSaleSchema.safeParse({ ...doc, id: row.id, resellerId: row.reseller_id, kitId: row.kit_id, createdAt: row.created_at, status: row.status, totalCents: row.total_cents });
    if (!sale.success) continue;
    const list = salesByKit.get(sale.data.kitId);
    if (list) list.push(sale.data);
    else salesByKit.set(sale.data.kitId, [sale.data]);
  }
  const inKits: Record<string, number> = {};
  const kitsByCombo: Record<string, KitHolding[]> = {};
  for (const row of kitRows) {
    const doc = parseDoc(row.data);
    if (!doc) continue;
    const kit = kitSchema.safeParse({ ...doc, id: row.id, resellerId: row.reseller_id, status: row.status, openedAt: row.opened_at, dueAt: row.due_at, updatedAt: row.updated_at });
    if (!kit.success || kit.data.status !== 'aberta') continue;
    const resellerName = firstName(row.reseller_data);
    for (const line of kitState(kit.data, salesByKit.get(kit.data.id) ?? [])) {
      if (line.available <= 0) continue;
      const key = lineKey(line);
      inKits[key] = (inKits[key] ?? 0) + line.available;
      const holders = (kitsByCombo[key] ??= []);
      const same = holders.find((h) => h.kitId === kit.data.id);
      if (same) same.qty += line.available;
      else holders.push({ kitId: kit.data.id, resellerId: kit.data.resellerId, resellerName, qty: line.available });
    }
  }
  return { inKits, kitsByCombo };
}

/**
 * GET /api/admin/stock — exact levels, tracked products, the latest movements and the units with
 * resellers (`inKits`, `kitsByCombo`), in one round trip.
 */
export async function handleGetStock(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT product_id, variant_id, size, qty, updated_at FROM stock_levels'),
      db.prepare('SELECT product_id FROM stock_tracked'),
      db
        .prepare(
          `SELECT m.id, m.at, m.product_id, m.variant_id, m.size, m.delta, m.qty_after, m.reason, m.order_number, m.note, m.kit_id, r.data AS reseller_data
           FROM stock_movements m LEFT JOIN kits k ON k.id = m.kit_id LEFT JOIN resellers r ON r.id = k.reseller_id
           ORDER BY m.id DESC LIMIT ?1`,
        )
        .bind(MOVEMENTS_LIMIT),
      db.prepare(
        `SELECT k.id, k.reseller_id, k.status, k.opened_at, k.due_at, k.updated_at, k.data, r.data AS reseller_data
         FROM kits k LEFT JOIN resellers r ON r.id = k.reseller_id WHERE k.status = 'aberta'`,
      ),
      db.prepare(
        `SELECT s.id, s.reseller_id, s.kit_id, s.created_at, s.status, s.total_cents, s.data
         FROM reseller_sales s JOIN kits k ON k.id = s.kit_id WHERE k.status = 'aberta' AND s.status = 'ativa'`,
      ),
    ]),
  );
  const kits = unitsInKits(results[3]?.results ?? [], results[4]?.results ?? []);
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
      note: r.note ?? null,
      kitId: r.kit_id ?? null,
      resellerName: r.kit_id ? firstName(r.reseller_data) || null : null,
    })),
    inKits: kits.inKits,
    kitsByCombo: kits.kitsByCombo,
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

// ---------------------------------------------------------------------------
// Entries and exits (docs/revenda/PLAN.md §6)
// ---------------------------------------------------------------------------

export const ENTRY_MOTIVES = ['compra', 'troca', 'outro'] as const;
export const EXIT_MOTIVES = ['perda', 'brinde', 'uso', 'outro'] as const;
/** Labels written into the movement note (the admin shows the same words on its chips: src/admin/lib/stock.ts). */
export const MOTIVE_LABEL = {
  entrada: { compra: 'Compra do fornecedor', troca: 'Troca', outro: 'Outra entrada' },
  saida: { perda: 'Perda ou defeito', brinde: 'Brinde', uso: 'Uso próprio', outro: 'Outra saída' },
} as const;
export const MOVE_NOTE_MAX = 200;

const moveCommon = {
  productId: z.string().min(1).max(64),
  variantId: z.string().min(1).max(64),
  size: z.string().max(12).default(''),
  qty: z.number().int('Use um número inteiro.').min(1, 'Informe pelo menos 1 unidade.').max(MAX_STOCK_QTY, 'Quantidade acima do limite.'),
  note: z
    .string()
    .max(MOVE_NOTE_MAX, `A observação tem no máximo ${MOVE_NOTE_MAX} caracteres.`)
    .optional()
    .transform((v) => (v?.trim() ? v.trim().replace(/\s+/g, ' ') : undefined)),
};

export const moveRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entrada'), motive: z.enum(ENTRY_MOTIVES), ...moveCommon }),
  z.object({ kind: z.literal('saida'), motive: z.enum(EXIT_MOTIVES), ...moveCommon }),
]);
export type MoveRequest = z.infer<typeof moveRequestSchema>;

/** "Compra do fornecedor — NF 123": the motive label, plus the owner's text when there is one. */
export function moveNote(move: { kind: MoveRequest['kind']; motive: string; note?: string | undefined }): string {
  const label = (MOTIVE_LABEL[move.kind] as Record<string, string>)[move.motive] ?? '';
  return move.note ? `${label} — ${move.note}` : label;
}

/**
 * POST /api/admin/stock/moves (Idempotency-Key required) — an entry ("entrada": purchase, swap…)
 * or an exit ("saida": loss, gift, own use…) of N units of one combination. An entry on a product
 * without stock control turns control on (its other combinations start at 0). An exit needs control
 * and enough units: guarded `qty >= n`, the table's CHECK and the catalog-version guard, so two
 * exits of the last unit never both pass. The public snapshot is rewritten in the same batch.
 */
export async function handleStockMove(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const key = ctx.request.headers.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new HttpError('bad_request', 'Chave de envio inválida.');
  const parsed = moveRequestSchema.safeParse(await readJson(ctx.request, 8 * 1024));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.message && !issue.message.startsWith('Invalid') && !issue.message.startsWith('Too') ? issue.message : 'Confira os dados da movimentação.';
    throw new HttpError('bad_request', message, zodDetails(parsed.error.issues));
  }
  const move = parsed.data;
  const idemKey = `stock-move:${key}`;
  const requestHash = await sha256Hex(JSON.stringify(move));
  const note = moveNote(move);

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const results = await withReadRetry(() =>
      db.batch<Record<string, unknown>>([
        db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey),
        db.prepare('SELECT version, body FROM catalog_snapshot WHERE id = 1'),
        db.prepare('SELECT product_id, variant_id, size, qty FROM stock_levels'),
        db.prepare('SELECT product_id FROM stock_tracked'),
      ]),
    );
    const replay = results[0]?.results[0] as { request_hash: string; response: string } | undefined;
    if (replay) {
      if (replay.request_hash !== requestHash) throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outra movimentação.');
      return json(JSON.parse(replay.response), { status: 201 });
    }
    const snapshot = (results[1]?.results[0] as { version: number; body: string } | undefined) ?? (await ensureSeeded(db));
    const state: StockState = {
      catalog: parseSnapshotBody(snapshot.body),
      version: snapshot.version,
      rows: (results[2]?.results ?? []) as unknown as StockRow[],
      tracked: new Set((results[3]?.results ?? []).map((r) => r.product_id as string)),
    };
    const product = state.catalog.products.find((p) => p.id === move.productId);
    if (!product) throw new HttpError('not_found', 'Esta peça não existe mais.');
    const variant = product.variants.find((v) => v.id === move.variantId);
    if (!variant || !combosOf(product).some((c) => c.variantId === move.variantId && c.size === move.size)) {
      throw new HttpError('bad_request', 'Acabamento ou tamanho que não existe nesta peça. Recarregue a página.');
    }
    const wasTracked = state.tracked.has(product.id);
    const key_ = rowKey(product.id, move.variantId, move.size);
    const current = state.rows.find((r) => rowKey(r.product_id, r.variant_id, r.size) === key_)?.qty ?? 0;
    const label = [product.name, FINISH_LABEL[variant.finish], move.size && sizeLabel(move.size)].filter(Boolean).join(', ');
    const at = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    const tracked = new Set(state.tracked);
    let after: number;

    if (move.kind === 'entrada') {
      after = current + move.qty;
      if (after > MAX_STOCK_QTY) throw new HttpError('integrity', `O estoque desta peça passaria do limite de ${MAX_STOCK_QTY.toLocaleString('pt-BR')} unidades.`);
      if (!wasTracked) {
        tracked.add(product.id);
        statements.push(db.prepare('INSERT INTO stock_tracked (product_id, since) VALUES (?1, ?2) ON CONFLICT (product_id) DO NOTHING').bind(product.id, at));
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO stock_levels (product_id, variant_id, size, qty, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (product_id, variant_id, size) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at`,
          )
          .bind(product.id, move.variantId, move.size, move.qty, at),
      );
    } else {
      if (!wasTracked) throw new HttpError('conflict', 'Esta peça não tem controle de estoque. Para registrar uma saída, ligue o controle em “Ajustar contagem”.', { available: null });
      if (current < move.qty) throw new HttpError('conflict', current === 0 ? 'Não há unidades desta peça em estoque.' : `Só há ${current} em estoque.`, { available: current });
      after = current - move.qty;
      statements.push(
        guard(db, '(SELECT qty FROM stock_levels WHERE product_id = ?1 AND variant_id = ?2 AND size = ?3) >= ?4', product.id, move.variantId, move.size, move.qty),
        db.prepare('UPDATE stock_levels SET qty = qty - ?4, updated_at = ?5 WHERE product_id = ?1 AND variant_id = ?2 AND size = ?3').bind(product.id, move.variantId, move.size, move.qty, at),
      );
    }
    statements.push(movementStatement(db, at, product.id, move.variantId, move.size, move.kind === 'entrada' ? move.qty : -move.qty, move.kind, null, { note }));

    const rows = state.rows.filter((r) => rowKey(r.product_id, r.variant_id, r.size) !== key_);
    rows.push({ product_id: product.id, variant_id: move.variantId, size: move.size, qty: after });
    const publish = publishStatements(db, state, rows, tracked);
    const response = {
      version: publish.version,
      kind: move.kind,
      productId: product.id,
      variantId: move.variantId,
      size: move.size,
      qty: move.qty,
      qtyAfter: after,
      note,
      // True when this entry turned stock control on for the product (its other combinations start at 0).
      trackingStarted: move.kind === 'entrada' && !wasTracked,
    };
    // The owner's free text stays out of the audit log (it may name someone); the motive is enough.
    const summary = `${move.kind === 'entrada' ? 'Entrada' : 'Saída'} de ${move.qty} · ${label} (${moveNote({ kind: move.kind, motive: move.motive })})`;
    try {
      await db.batch([
        publish.first,
        ...statements,
        ...publish.statements,
        db.prepare('INSERT INTO idempotency (key, request_hash, created_at, response) VALUES (?1, ?2, ?3, ?4)').bind(idemKey, requestHash, Date.now(), JSON.stringify(response)),
        db.prepare('DELETE FROM idempotency WHERE created_at < ?1').bind(Date.now() - IDEMPOTENCY_TTL_MS),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, `stock.${move.kind}`, summary.slice(0, 500)),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue; // the stock or the catalog changed meanwhile: re-read
      const message = error instanceof Error ? error.message : '';
      if (/UNIQUE constraint failed: idempotency/i.test(message)) {
        // A concurrent retry of the same request committed first: answer with its result.
        const stored = await withReadRetry(() => db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey).first<{ request_hash: string; response: string }>());
        if (stored && stored.request_hash === requestHash) return json(JSON.parse(stored.response), { status: 201 });
        throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outra movimentação.');
      }
      if (/CHECK constraint failed/i.test(message)) throw new HttpError('integrity', 'O estoque ficaria fora do limite permitido. Confira o estoque desta peça.');
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyCatalog(ctx.env, publish.version));
    return json(response, { status: 201 });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}
