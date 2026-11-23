import { z } from 'zod';
import {
  ANONYMIZED_NAME,
  canTransition,
  FIRST_ORDER_NUMBER,
  HOLDS_STOCK,
  movesOf,
  ORDER_STATUSES,
  orderRequestSchema,
  orderSchema,
  priceOrder,
  pricingMessage,
  STATUS_LABEL,
  type Order,
  type OrderStatus,
  type StockMove,
} from '../src/data/orders';
import { hitStatement, ipKey, pruneThrottle, requireSession, retryAfter } from './auth';
import { ensureSeeded, IDEMPOTENCY_TTL_MS, parseSnapshotBody, WRITE_ATTEMPTS } from './catalog';
import { randomToken, sha256Hex } from './crypto';
import { guard, isGuardMiss, toHttpError, withReadRetry } from './db';
import { HttpError, json, readBody, readJson, zodDetails } from './http';
import { notifyCatalog, notifyOrders } from './live';
import type { Context } from './router';
import { movementStatement, publishStatements, rowKey, type StockState } from './stock';
import { combosOf, type StockRow } from '../src/data/stock';
import { sizeLabel } from '../src/data/catalog';
import { FINISH_LABEL, type Finish } from '../src/data/schema';

/*
 * Orders. Public: POST /api/orders registers what the bag holds, priced by
 * the server from the catalog snapshot. Admin: list, status changes (which
 * take items out of stock or give them back, atomically), anonymize, delete.
 * Personal data never reaches logs, the public snapshot or the WebSocket.
 */

const ORDER_MAX_BYTES = 16 * 1024;
const ORDER_WINDOW_MS = 60 * 60 * 1000;
export const ORDERS_PER_WINDOW = 15;
export const ORDERS_GLOBAL_PER_WINDOW = 300;
const LIST_DAYS = 400;
const LIST_LIMIT = 5000;

interface OrderRow {
  id: string;
  number: number;
  status: OrderStatus;
  updated_at: string;
  data: string;
}

/** The stored row as an Order (number and status come from their columns). */
function toOrder(row: OrderRow): Order {
  return { ...(JSON.parse(row.data) as Omit<Order, 'number' | 'status'>), number: row.number, status: row.status };
}

/** What is stored in `data`: everything but the column-backed fields. */
function toData(order: Order): string {
  const { number: _number, status: _status, ...rest } = order;
  return JSON.stringify(rest);
}

// ---------------------------------------------------------------------------
// Public: register an order
// ---------------------------------------------------------------------------

/** POST /api/orders (Idempotency-Key required). */
export async function handleCreateOrder(ctx: Context): Promise<Response> {
  const db = ctx.env.DB;
  const type = ctx.request.headers.get('Content-Type') ?? '';
  if (!/^application\/json\b/i.test(type)) throw new HttpError('unsupported_type', 'Envie os dados em JSON.');
  const key = ctx.request.headers.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new HttpError('bad_request', 'Chave de envio inválida.');
  const bytes = await readBody(ctx.request, ORDER_MAX_BYTES);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError('bad_request', 'Não foi possível ler os dados enviados.');
  }
  const parsed = orderRequestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError('bad_request', issue?.message && !issue.message.startsWith('Invalid') && !issue.message.startsWith('Too') ? issue.message : 'Confira os dados do pedido.', zodDetails(parsed.error.issues));
  }
  // Honeypot: real visitors never see this field. Answer without registering anything.
  if (parsed.data.website) return json({ order: null }, { status: 202 });

  const idemKey = `order:${key}`;
  const requestHash = await sha256Hex(bytes);
  const now = Date.now();
  if (!ctx.env.PIN_PEPPER || ctx.env.PIN_PEPPER.length < 32) throw new HttpError('not_configured', 'Não foi possível registrar o pedido agora.');
  const ip = await ipKey(ctx.env.PIN_PEPPER, ctx.request);

  // One round trip to the database for everything the order needs to know (D1 may be far from
  // the visitor: every sequential query costs a full trip). Writes only touch the throttle counters.
  let first: D1Result<Record<string, unknown>>[];
  try {
    first = await db.batch<Record<string, unknown>>([
      db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey),
      hitStatement(db, `order:ip:${ip}`, ORDER_WINDOW_MS, now),
      hitStatement(db, 'order:global', ORDER_WINDOW_MS, now),
      db.prepare('SELECT version, body FROM catalog_snapshot WHERE id = 1'),
    ]);
  } catch (error) {
    throw toHttpError(error);
  }
  const replay = first[0]?.results[0] as { request_hash: string; response: string } | undefined;
  if (replay) {
    if (replay.request_hash !== requestHash) throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outro pedido.');
    return json(JSON.parse(replay.response), { status: 201 });
  }
  const counter = first[1]?.results[0] as { count: number; window_start: number } | undefined;
  if (counter && counter.count > ORDERS_PER_WINDOW) throw retryAfter(counter.window_start + ORDER_WINDOW_MS, now, 'Recebemos vários pedidos deste aparelho.');
  const global = first[2]?.results[0] as { count: number; window_start: number } | undefined;
  if (global && global.count > ORDERS_GLOBAL_PER_WINDOW) throw retryAfter(global.window_start + ORDER_WINDOW_MS, now, 'Recebemos muitos pedidos agora.');

  const snapshot = (first[3]?.results[0] as { version: number; body: string } | undefined) ?? (await ensureSeeded(db));
  const catalog = parseSnapshotBody(snapshot.body);
  const priced = priceOrder(catalog, parsed.data.items);
  if (!priced.ok) throw new HttpError('conflict', pricingMessage(priced.problems), { problems: priced.problems, version: snapshot.version });

  const at = new Date(now).toISOString();
  const order: Order = orderSchema.parse({
    id: `ord_${randomToken().slice(0, 16)}`,
    number: FIRST_ORDER_NUMBER, // placeholder: the real number is assigned by the INSERT below
    status: 'enviado',
    createdAt: at,
    updatedAt: at,
    customer: { name: parsed.data.name, city: parsed.data.city },
    ...(parsed.data.note ? { note: parsed.data.note } : {}),
    items: priced.items,
    totalCents: priced.totalCents,
    pix: !!catalog.settings.pix,
    history: [{ at, status: 'enviado' }],
  });
  const response = { order: { id: order.id, number: 0, createdAt: at, items: order.items, totalCents: order.totalCents, pix: order.pix } };

  let number: number | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const results = await db.batch<{ number?: number }>([
        // A counter that only goes up (a deleted order's number is never reused). The batch is one
        // transaction and D1 runs writes one at a time; the UNIQUE index backs it up.
        db
          .prepare(
            `INSERT INTO counters (name, value) VALUES ('order', (SELECT COALESCE(MAX(number), ?1 - 1) FROM orders) + 1)
             ON CONFLICT (name) DO UPDATE SET value = MAX(value, (SELECT COALESCE(MAX(number), ?1 - 1) FROM orders)) + 1`,
          )
          .bind(FIRST_ORDER_NUMBER),
        db
          .prepare(
            `INSERT INTO orders (id, number, status, created_at, updated_at, total_cents, data)
             SELECT ?1, value, 'enviado', ?2, ?2, ?3, ?4 FROM counters WHERE name = 'order' RETURNING number`,
          )
          .bind(order.id, at, order.totalCents, toData(order)),
        db
          .prepare(
            `INSERT INTO idempotency (key, request_hash, created_at, response)
             SELECT ?1, ?2, ?3, json_set(?4, '$.order.number', number) FROM orders WHERE id = ?5`,
          )
          .bind(idemKey, requestHash, now, JSON.stringify(response), order.id),
        db.prepare('DELETE FROM idempotency WHERE created_at < ?1').bind(now - IDEMPOTENCY_TTL_MS),
        pruneThrottle(db, now),
      ]);
      number = results[1]?.results[0]?.number;
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/UNIQUE constraint failed: idempotency/i.test(message)) {
        // A concurrent retry of the same request committed first: answer with its order.
        const stored = await withReadRetry(() => db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey).first<{ request_hash: string; response: string }>());
        if (stored && stored.request_hash === requestHash) return json(JSON.parse(stored.response), { status: 201 });
        throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outro pedido.');
      }
      if (/UNIQUE constraint failed: orders\.number/i.test(message) && attempt < 2) continue;
      throw toHttpError(error);
    }
  }
  if (number === undefined) {
    const row = await withReadRetry(() => db.prepare('SELECT number FROM orders WHERE id = ?1').bind(order.id).first<{ number: number }>());
    if (!row) throw new HttpError('internal');
    number = row.number;
  }
  ctx.waitUntil(notifyOrders(ctx.env));
  return json({ order: { ...response.order, number } }, { status: 201 });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** GET /api/admin/orders — the last 400 days plus every order still open, newest first. */
export async function handleListOrders(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const since = new Date(Date.now() - LIST_DAYS * 24 * 3600_000).toISOString();
  const { results } = await withReadRetry(() =>
    ctx.env.DB.prepare(`SELECT id, number, status, data FROM orders WHERE created_at >= ?1 OR status = 'enviado' ORDER BY created_at DESC LIMIT ?2`)
      .bind(since, LIST_LIMIT)
      .all<OrderRow>(),
  );
  return json({ orders: results.map(toOrder), limit: LIST_LIMIT });
}

/** The order plus the stored `updated_at`, which every write checks (compare-and-swap on the whole row). */
async function readOrder(db: D1Database, id: string): Promise<{ order: Order; stamp: string }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError('not_found', 'Pedido não encontrado.');
  const row = await withReadRetry(() => db.prepare('SELECT id, number, status, updated_at, data FROM orders WHERE id = ?1').bind(id).first<OrderRow>());
  if (!row) throw new HttpError('not_found', 'Pedido não encontrado.');
  return { order: toOrder(row), stamp: row.updated_at };
}

/** A write timestamp strictly after the stored one (two writes in the same millisecond still differ). */
function nextStamp(previous: string): string {
  const now = Date.now();
  const prev = Date.parse(previous);
  return new Date(Number.isNaN(prev) ? now : Math.max(now, prev + 1)).toISOString();
}

/**
 * The order and, in the same round trip, the stock state a status change may need (the snapshot is
 * parsed only when stock actually moves).
 */
async function readOrderAndStock(db: D1Database, id: string): Promise<{ order: Order; stamp: string; stock: () => StockState }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError('not_found', 'Pedido não encontrado.');
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT id, number, status, updated_at, data FROM orders WHERE id = ?1').bind(id),
      db.prepare('SELECT version, body FROM catalog_snapshot WHERE id = 1'),
      db.prepare('SELECT product_id, variant_id, size, qty FROM stock_levels'),
      db.prepare('SELECT product_id FROM stock_tracked'),
    ]),
  );
  const row = results[0]?.results[0] as OrderRow | undefined;
  if (!row) throw new HttpError('not_found', 'Pedido não encontrado.');
  const snapshot = results[1]?.results[0] as { version: number; body: string } | undefined;
  let state: StockState | null = null;
  return {
    order: toOrder(row),
    stamp: row.updated_at,
    stock: () => {
      if (!snapshot) throw new HttpError('internal');
      state ??= {
        catalog: parseSnapshotBody(snapshot.body),
        version: snapshot.version,
        rows: (results[2]?.results ?? []) as unknown as StockRow[],
        tracked: new Set((results[3]?.results ?? []).map((r) => r.product_id as string)),
      };
      return state;
    },
  };
}

const unchanged = (db: D1Database, id: string, stamp: string) => guard(db, '(SELECT updated_at FROM orders WHERE id = ?1) = ?2', id, stamp);

/** True when a stock move applies: the product is tracked and the finish/size still exists. */
function counted(state: StockState, move: StockMove): boolean {
  if (!state.tracked.has(move.productId)) return false;
  const product = state.catalog.products.find((p) => p.id === move.productId);
  return !!product && combosOf(product).some((c) => c.variantId === move.variantId && c.size === move.size);
}

const statusSchema = z.object({ from: z.enum(ORDER_STATUSES), to: z.enum(ORDER_STATUSES) });

/** "Anel Solitário, Dourado, aro 16" for stock messages (labels, never internal ids). */
const describe = (m: { name: string; size: string }, finish: Finish) => [m.name, FINISH_LABEL[finish], m.size && sizeLabel(m.size)].filter(Boolean).join(', ');

/**
 * POST /api/admin/orders/:id/status { from, to } — compare-and-swap on the
 * status. Entering a stock-holding status takes the tracked items out of
 * stock; leaving one gives back exactly what was taken. All in one batch.
 */
export async function handleOrderStatus(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const body = statusSchema.safeParse(await readJson(ctx.request, 2048));
  if (!body.success) throw new HttpError('bad_request', 'Status inválido.');
  const { from, to } = body.data;
  const id = ctx.params.id ?? '';

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const { order, stamp, stock } = await readOrderAndStock(db, id);
    if (order.status === to) return json({ order }); // already there (a retried request): nothing to do
    if (order.status !== from) throw new HttpError('conflict', `Este pedido já está como “${STATUS_LABEL[order.status]}”. A tela foi atualizada.`, { order });
    if (!canTransition(from, to)) throw new HttpError('bad_request', 'Essa mudança de status não é permitida.');

    const at = nextStamp(stamp);
    const taking = !HOLDS_STOCK.has(from) && HOLDS_STOCK.has(to);
    const giving = HOLDS_STOCK.has(from) && !HOLDS_STOCK.has(to);
    const next: Order = { ...order, status: to, updatedAt: at, history: [...order.history, { at, status: to }].slice(-200) };
    const statements: D1PreparedStatement[] = [];
    let publishVersion: number | null = null;
    let first: D1PreparedStatement | null = null;

    if (taking || giving) {
      const state = stock();
      const qtyOf = new Map(state.rows.map((r) => [rowKey(r.product_id, r.variant_id, r.size), r]));
      const rows = new Map(qtyOf);
      const moves: StockMove[] = [];
      if (taking) {
        const problems: string[] = [];
        for (const move of movesOf(order.items)) {
          if (!counted(state, move)) continue;
          const key = rowKey(move.productId, move.variantId, move.size);
          const have = rows.get(key)?.qty ?? 0;
          if (have < move.qty) {
            const item = order.items.find((i) => i.productId === move.productId && i.variantId === move.variantId && (i.size ?? '') === move.size)!;
            problems.push(`${describe({ name: item.name, size: move.size }, item.finish)}: pedido ${move.qty}, em estoque ${have}`);
            continue;
          }
          rows.set(key, { product_id: move.productId, variant_id: move.variantId, size: move.size, qty: have - move.qty });
          moves.push(move);
          statements.push(
            guard(db, '(SELECT qty FROM stock_levels WHERE product_id = ?1 AND variant_id = ?2 AND size = ?3) >= ?4', move.productId, move.variantId, move.size, move.qty),
            db.prepare('UPDATE stock_levels SET qty = qty - ?4, updated_at = ?5 WHERE product_id = ?1 AND variant_id = ?2 AND size = ?3').bind(move.productId, move.variantId, move.size, move.qty, at),
            movementStatement(db, at, move.productId, move.variantId, move.size, -move.qty, 'pedido', order.number),
          );
        }
        if (problems.length) {
          throw new HttpError('conflict', `Estoque insuficiente para confirmar: ${problems.join('; ')}. Ajuste o estoque ou o pedido.`, { stock: problems });
        }
        next.stockMoves = moves;
      } else {
        for (const move of order.stockMoves ?? []) {
          // Give back only to combinations still under stock control (turning control off, or removing
          // the finish or size, discarded those counts).
          if (!counted(state, move)) continue;
          const key = rowKey(move.productId, move.variantId, move.size);
          const have = rows.get(key)?.qty ?? 0;
          rows.set(key, { product_id: move.productId, variant_id: move.variantId, size: move.size, qty: have + move.qty });
          statements.push(
            db
              .prepare(
                `INSERT INTO stock_levels (product_id, variant_id, size, qty, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT (product_id, variant_id, size) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at`,
              )
              .bind(move.productId, move.variantId, move.size, move.qty, at),
            movementStatement(db, at, move.productId, move.variantId, move.size, move.qty, 'devolucao', order.number),
          );
        }
        delete next.stockMoves;
      }
      if (statements.length) {
        const publish = publishStatements(db, state, [...rows.values()], state.tracked);
        first = publish.first;
        statements.push(...publish.statements);
        publishVersion = publish.version;
      }
    }

    try {
      await db.batch([
        ...(first ? [first] : []),
        guard(db, '(SELECT status FROM orders WHERE id = ?1) = ?2', order.id, from),
        unchanged(db, order.id, stamp),
        ...statements,
        db.prepare('UPDATE orders SET status = ?2, updated_at = ?3, data = ?4 WHERE id = ?1').bind(order.id, to, at, toData(next)),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'order.status', `Pedido ${order.number}: ${from} → ${to}`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue; // the catalog, the stock or the order changed meanwhile: re-read
      if (/CHECK constraint failed/i.test(error instanceof Error ? error.message : '')) throw new HttpError('integrity', 'O estoque ficaria fora do limite permitido. Confira o estoque desta peça.');
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(ctx.env));
    if (publishVersion !== null) ctx.waitUntil(notifyCatalog(ctx.env, publishVersion));
    return json({ order: next, ...(publishVersion !== null ? { version: publishVersion } : {}) });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

/** POST /api/admin/orders/:id/anonymize — erases the customer's personal data (LGPD), keeps the amounts. */
export async function handleAnonymizeOrder(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const { order, stamp } = await readOrder(db, ctx.params.id ?? '');
    if (order.anonymized) return json({ order });
    const at = nextStamp(stamp);
    const { note: _note, ...rest } = order;
    const next: Order = { ...rest, customer: { name: ANONYMIZED_NAME, city: '' }, anonymized: true, updatedAt: at };
    try {
      await db.batch([
        unchanged(db, order.id, stamp), // a status change landed meanwhile: re-read so neither write is lost
        db.prepare('UPDATE orders SET data = ?2, updated_at = ?3 WHERE id = ?1').bind(order.id, toData(next), at),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'order.anonymize', `Dados da cliente do pedido ${order.number} apagados`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(ctx.env));
    return json({ order: next });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

/** DELETE /api/admin/orders/:id — only orders that hold no stock. Idempotent. */
export async function handleDeleteOrder(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const id = ctx.params.id ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError('not_found', 'Pedido não encontrado.');
  const result = await ctx.env.DB.prepare(`DELETE FROM orders WHERE id = ?1 AND status IN ('enviado', 'cancelado') RETURNING number`).bind(id).first<{ number: number }>();
  if (!result) {
    const exists = await ctx.env.DB.prepare('SELECT status FROM orders WHERE id = ?1').bind(id).first<{ status: string }>();
    if (exists) throw new HttpError('conflict', 'Cancele o pedido antes de excluir (assim as peças voltam ao estoque).');
    return json({ deleted: false });
  }
  await ctx.env.DB.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(new Date().toISOString(), 'order.delete', `Pedido ${result.number} excluído`).run();
  ctx.waitUntil(notifyOrders(ctx.env));
  return json({ deleted: true });
}
