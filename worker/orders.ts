import { z } from 'zod';
import {
  adminOrderRequestSchema,
  ANONYMIZED_NAME,
  canTransition,
  EDITABLE_ITEMS,
  editItemsRequestSchema,
  FIRST_ORDER_NUMBER,
  MAX_ORDER_LINE_QTY,
  HOLDS_STOCK,
  movesOf,
  ORDER_STATUSES,
  orderRequestSchema,
  orderSchema,
  priceOrder,
  pricingMessage,
  STATUS_LABEL,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PricingProblem,
} from '../src/data/orders';
import { hitStatement, ipKey, pruneThrottle, requireSession, retryAfter } from './auth';
import { ensureSeeded, IDEMPOTENCY_TTL_MS, parseSnapshotBody, WRITE_ATTEMPTS } from './catalog';
import { randomToken, sha256Hex } from './crypto';
import { guard, isGuardMiss, toHttpError, withReadRetry } from './db';
import { HttpError, json, readBody, readJson, zodDetails } from './http';
import { notifyCatalog, notifyOrders } from './live';
import { notifyOwner, orderNotice } from './push';
import { cancelMpPix, mpEnabled } from './mercadopago';
import type { Context } from './router';
import { publishStatements, rowKey, type StockState } from './stock';
import { planStock } from './stockPlan';
import type { StockRow } from '../src/data/stock';

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

export interface OrderRow {
  id: string;
  number: number;
  status: OrderStatus;
  updated_at: string;
  data: string;
  /** Selected only by some queries; when present it is the truth about the customer link. */
  customer_id?: string | null;
}

/** The stored row as an Order (number and status come from their columns; so does the customer link when selected). */
export function toOrder(row: OrderRow): Order {
  const order: Order = { ...(JSON.parse(row.data) as Omit<Order, 'number' | 'status'>), number: row.number, status: row.status };
  if (row.customer_id !== undefined) {
    if (row.customer_id) order.customerId = row.customer_id;
    else delete order.customerId;
  }
  return order;
}

/** What is stored in `data`: everything but the column-backed fields. */
export function toData(order: Order): string {
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
    pix: false, // payment is agreed on WhatsApp; the Pix goes out later as a payment link (charge)
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
  ctx.waitUntil(notifyOwner(ctx.env, ctx.url.origin, orderNotice(number, order.totalCents, order.items.reduce((n, i) => n + i.qty, 0))));
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
    ctx.env.DB.prepare(`SELECT id, number, status, data, customer_id FROM orders WHERE created_at >= ?1 OR status = 'enviado' ORDER BY created_at DESC LIMIT ?2`)
      .bind(since, LIST_LIMIT)
      .all<OrderRow>(),
  );
  return json({ orders: results.map(toOrder), limit: LIST_LIMIT, autoPix: mpEnabled(ctx.env) });
}

/** The order plus the stored `updated_at`, which every write checks (compare-and-swap on the whole row). */
export async function readOrder(db: D1Database, id: string): Promise<{ order: Order; stamp: string }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError('not_found', 'Pedido não encontrado.');
  const row = await withReadRetry(() => db.prepare('SELECT id, number, status, updated_at, data, customer_id FROM orders WHERE id = ?1').bind(id).first<OrderRow>());
  if (!row) throw new HttpError('not_found', 'Pedido não encontrado.');
  return { order: toOrder(row), stamp: row.updated_at };
}

/** A write timestamp strictly after the stored one (two writes in the same millisecond still differ). */
export function nextStamp(previous: string): string {
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
      db.prepare('SELECT id, number, status, updated_at, data, customer_id FROM orders WHERE id = ?1').bind(id),
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

export const unchanged = (db: D1Database, id: string, stamp: string) => guard(db, '(SELECT updated_at FROM orders WHERE id = ?1) = ?2', id, stamp);

const statusSchema = z.object({ from: z.enum(ORDER_STATUSES), to: z.enum(ORDER_STATUSES) });

/** pt-BR sentence for pricing problems of an order the owner registers or edits. */
function ownerPricingMessage(problems: PricingProblem[]): string {
  const first = problems[0];
  if (!first) return 'Confira as peças do pedido.';
  const more = problems.length > 1 ? ` (e mais ${problems.length - 1})` : '';
  if (first.reason === 'size') return `Escolha o tamanho de ${first.name}${more}.`;
  return `${first.name}${more} não existe mais no catálogo (ou mudou de acabamento). Recarregue a página e escolha de novo.`;
}

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
    // Back to "em negociação" (undo, or reopening a cancelled order): the pieces are no longer held,
    // so the payment link dies; a new charge is created after confirming again.
    const dropCharge = to === 'enviado' && !!order.charge;
    if (dropCharge) delete next.charge;
    const statements: D1PreparedStatement[] = [];
    let publishVersion: number | null = null;
    let first: D1PreparedStatement | null = null;

    if (taking || giving) {
      const state = stock();
      const plan = planStock(db, state, at, { orderId: order.id }, giving ? (order.stockMoves ?? []) : [], taking ? movesOf(order.items) : [], order.items);
      if (plan.problems.length) {
        throw new HttpError('conflict', `Estoque insuficiente para confirmar: ${plan.problems.join('; ')}. Ajuste o estoque ou o pedido.`, { stock: plan.problems });
      }
      if (taking) next.stockMoves = plan.taken;
      else delete next.stockMoves;
      if (plan.statements.length) {
        const publish = publishStatements(db, state, plan.rows, state.tracked);
        first = publish.first;
        statements.push(...plan.statements, ...publish.statements);
        publishVersion = publish.version;
      }
    }

    try {
      await db.batch([
        ...(first ? [first] : []),
        guard(db, '(SELECT status FROM orders WHERE id = ?1) = ?2', order.id, from),
        unchanged(db, order.id, stamp),
        ...statements,
        dropCharge
          ? db.prepare('UPDATE orders SET status = ?2, updated_at = ?3, data = ?4, pay_token = NULL WHERE id = ?1').bind(order.id, to, at, toData(next))
          : db.prepare('UPDATE orders SET status = ?2, updated_at = ?3, data = ?4 WHERE id = ?1').bind(order.id, to, at, toData(next)),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'order.status', `Pedido ${order.number}: ${from} → ${to}`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue; // the catalog, the stock or the order changed meanwhile: re-read
      if (/CHECK constraint failed/i.test(error instanceof Error ? error.message : '')) throw new HttpError('integrity', 'O estoque ficaria fora do limite permitido. Confira o estoque desta peça.');
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(ctx.env));
    if (publishVersion !== null) ctx.waitUntil(notifyCatalog(ctx.env, publishVersion));
    // Back to negotiation or cancelled: a pending automatic Pix must not stay payable.
    if ((to === 'enviado' || to === 'cancelado') && order.charge?.mp && !order.charge.paidBy) ctx.waitUntil(cancelMpPix(ctx.env, order.charge.mp.id));
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
    const { receipts: _receipts, ...kept } = rest;
    // The link to a registered customer goes too: an anonymized order no longer says whose it was.
    const { customerId: _customerId, ...unlinked } = kept;
    const next: Order = { ...unlinked, customer: { name: ANONYMIZED_NAME, city: '' }, anonymized: true, updatedAt: at };
    try {
      await db.batch([
        unchanged(db, order.id, stamp), // a status change landed meanwhile: re-read so neither write is lost
        // The payment link dies too: nothing personal can be sent to an anonymized order.
        db.prepare('UPDATE orders SET data = ?2, updated_at = ?3, pay_token = NULL, customer_id = NULL WHERE id = ?1').bind(order.id, toData(next), at),
        // Receipts carry the payer's name and bank details: erased with the rest.
        db.prepare('DELETE FROM receipts WHERE order_id = ?1').bind(order.id),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'order.anonymize', `Dados da cliente do pedido ${order.number} apagados`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(ctx.env));
    if (order.charge?.mp && !order.charge.paidBy) ctx.waitUntil(cancelMpPix(ctx.env, order.charge.mp.id));
    return json({ order: next });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

/** DELETE /api/admin/orders/:id — only orders that hold no stock; the receipts go in the same batch. Idempotent. */
export async function handleDeleteOrder(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const id = ctx.params.id ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError('not_found', 'Pedido não encontrado.');
  let results: D1Result<{ number?: number }>[];
  try {
    results = await db.batch<{ number?: number }>([
      db.prepare(`DELETE FROM orders WHERE id = ?1 AND status IN ('enviado', 'cancelado') RETURNING number`).bind(id),
      // Runs after the delete in the same transaction: receipts go whenever the order is gone
      // (also cleans up after an earlier attempt that may have failed half way).
      db.prepare('DELETE FROM receipts WHERE order_id = ?1 AND NOT EXISTS (SELECT 1 FROM orders WHERE id = ?1)').bind(id),
    ]);
  } catch (error) {
    throw toHttpError(error);
  }
  const number = results[0]?.results[0]?.number;
  if (number === undefined) {
    const exists = await db.prepare('SELECT status FROM orders WHERE id = ?1').bind(id).first<{ status: string }>();
    if (exists) throw new HttpError('conflict', 'Cancele o pedido antes de excluir (assim as peças voltam ao estoque).');
    return json({ deleted: false });
  }
  await db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(new Date().toISOString(), 'order.delete', `Pedido ${number} excluído`).run();
  ctx.waitUntil(notifyOrders(ctx.env));
  return json({ deleted: true });
}

// ---------------------------------------------------------------------------
// Admin: manual orders and item edits
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/orders (Idempotency-Key required) — a sale the owner registers herself (it came
 * straight through WhatsApp or in person). Priced by the server; "confirmado" takes the tracked
 * pieces out of stock in the same batch that creates the order.
 */
export async function handleCreateManualOrder(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const key = ctx.request.headers.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new HttpError('bad_request', 'Chave de envio inválida.');
  const raw = await readJson(ctx.request, ORDER_MAX_BYTES);
  const parsed = adminOrderRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError('bad_request', issue?.message && !issue.message.startsWith('Invalid') && !issue.message.startsWith('Too') ? issue.message : 'Confira os dados do pedido.', zodDetails(parsed.error.issues));
  }
  const input = parsed.data;
  const idemKey = `admin-order:${key}`;
  const requestHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(input)));

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const now = Date.now();
    const results = await withReadRetry(() =>
      db.batch<Record<string, unknown>>([
        db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey),
        db.prepare('SELECT version, body FROM catalog_snapshot WHERE id = 1'),
        db.prepare('SELECT product_id, variant_id, size, qty FROM stock_levels'),
        db.prepare('SELECT product_id FROM stock_tracked'),
        db.prepare('SELECT data FROM customers WHERE id = ?1').bind(input.customerId ?? ''),
      ]),
    );
    const replay = results[0]?.results[0] as { request_hash: string; response: string } | undefined;
    if (replay) {
      if (replay.request_hash !== requestHash) throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outro pedido.');
      return json(JSON.parse(replay.response), { status: 201 });
    }
    // A registered customer: the order takes her name and city (she may have been erased meanwhile).
    let customer: { name: string; city: string } | null = null;
    if (input.customerId) {
      const row = results[4]?.results[0] as { data: string } | undefined;
      if (!row) throw new HttpError('conflict', 'Esta cliente não está mais cadastrada. Escolha outra ou cadastre de novo.', { customerId: input.customerId });
      const record = JSON.parse(row.data) as { name: string; city?: string };
      customer = { name: record.name.slice(0, 80), city: (record.city ?? '').slice(0, 80) };
    }
    const snapshot = (results[1]?.results[0] as { version: number; body: string } | undefined) ?? (await ensureSeeded(db));
    const state: StockState = {
      catalog: parseSnapshotBody(snapshot.body),
      version: snapshot.version,
      rows: (results[2]?.results ?? []) as unknown as StockRow[],
      tracked: new Set((results[3]?.results ?? []).map((r) => r.product_id as string)),
    };
    const priced = priceOrder(state.catalog, input.items, { owner: true });
    if (!priced.ok) throw new HttpError('conflict', ownerPricingMessage(priced.problems), { problems: priced.problems });

    const at = new Date(now).toISOString();
    const confirmed = input.status === 'confirmado';
    const order: Order = orderSchema.parse({
      id: `ord_${randomToken().slice(0, 16)}`,
      number: FIRST_ORDER_NUMBER, // placeholder: the real number is assigned by the INSERT below
      status: input.status,
      createdAt: at,
      updatedAt: at,
      customer: customer ?? { name: input.name, city: input.city },
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.note ? { note: input.note } : {}),
      items: priced.items,
      totalCents: priced.totalCents,
      pix: false,
      source: 'manual',
      history: confirmed ? [{ at, status: 'enviado' }, { at, status: 'confirmado' }] : [{ at, status: 'enviado' }],
    });

    const stockStatements: D1PreparedStatement[] = [];
    let publish: ReturnType<typeof publishStatements> | null = null;
    if (confirmed) {
      const plan = planStock(db, state, at, { orderId: order.id }, [], movesOf(order.items), order.items);
      if (plan.problems.length) throw new HttpError('conflict', `Estoque insuficiente: ${plan.problems.join('; ')}. Ajuste o estoque ou registre como “Em negociação”.`, { stock: plan.problems });
      order.stockMoves = plan.taken;
      if (plan.statements.length) {
        publish = publishStatements(db, state, plan.rows, state.tracked);
        stockStatements.push(...plan.statements, ...publish.statements);
      }
    }
    const response = { order };

    let number: number | undefined;
    try {
      const out = await db.batch<{ number?: number }>([
        ...(publish ? [publish.first] : []),
        db
          .prepare(
            `INSERT INTO counters (name, value) VALUES ('order', (SELECT COALESCE(MAX(number), ?1 - 1) FROM orders) + 1)
             ON CONFLICT (name) DO UPDATE SET value = MAX(value, (SELECT COALESCE(MAX(number), ?1 - 1) FROM orders)) + 1`,
          )
          .bind(FIRST_ORDER_NUMBER),
        db
          .prepare(
            `INSERT INTO orders (id, number, status, created_at, updated_at, total_cents, data, customer_id)
             SELECT ?1, value, ?2, ?3, ?3, ?4, ?5, ?6 FROM counters WHERE name = 'order' RETURNING number`,
          )
          .bind(order.id, order.status, at, order.totalCents, toData(order), order.customerId ?? null),
        // The customer must still exist when the order lands (erased meanwhile: re-read and refuse).
        ...(order.customerId ? [guard(db, 'EXISTS (SELECT 1 FROM customers WHERE id = ?1)', order.customerId)] : []),
        ...stockStatements,
        db
          .prepare(
            `INSERT INTO idempotency (key, request_hash, created_at, response)
             SELECT ?1, ?2, ?3, json_set(?4, '$.order.number', number) FROM orders WHERE id = ?5`,
          )
          .bind(idemKey, requestHash, now, JSON.stringify(response), order.id),
        db.prepare('DELETE FROM idempotency WHERE created_at < ?1').bind(now - IDEMPOTENCY_TTL_MS),
        db.prepare('INSERT INTO audit_log (at, action, summary) SELECT ?1, ?2, ?3 || number FROM orders WHERE id = ?4').bind(at, 'order.manual', 'Pedido registrado no painel: ', order.id),
      ]);
      number = out[publish ? 2 : 1]?.results[0]?.number;
    } catch (error) {
      if (isGuardMiss(error)) continue; // the catalog or the stock changed meanwhile: re-read
      const message = error instanceof Error ? error.message : '';
      if (/UNIQUE constraint failed: idempotency/i.test(message)) {
        const stored = await withReadRetry(() => db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey).first<{ request_hash: string; response: string }>());
        if (stored && stored.request_hash === requestHash) return json(JSON.parse(stored.response), { status: 201 });
        throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outro pedido.');
      }
      if (/UNIQUE constraint failed: orders\.number/i.test(message)) continue;
      if (/CHECK constraint failed/i.test(message)) throw new HttpError('integrity', 'O estoque ficaria fora do limite permitido. Confira o estoque desta peça.');
      throw toHttpError(error);
    }
    if (number === undefined) {
      const row = await withReadRetry(() => db.prepare('SELECT number FROM orders WHERE id = ?1').bind(order.id).first<{ number: number }>());
      if (!row) throw new HttpError('internal');
      number = row.number;
    }
    ctx.waitUntil(notifyOrders(ctx.env));
    if (publish) ctx.waitUntil(notifyCatalog(ctx.env, publish.version));
    return json({ order: { ...order, number }, ...(publish ? { version: publish.version } : {}) }, { status: 201 });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

const lineKey = (l: { productId: string; variantId: string; size?: string | undefined }) => `${l.productId}|${l.variantId}|${l.size ?? ''}`;

/**
 * PUT /api/admin/orders/:id/items { items, stamp } — changes the pieces of an order "em negociação"
 * or "confirmado". Pieces already in the order keep the price agreed then; new ones take today's
 * price. A confirmed order gives back what it held and takes the new pieces in the same batch. A
 * new total drops the Pix charge (the old payment link stops working); receipts are kept.
 */
export async function handleEditOrderItems(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const body = editItemsRequestSchema.safeParse(await readJson(ctx.request, ORDER_MAX_BYTES));
  if (!body.success) {
    const issue = body.error.issues[0];
    throw new HttpError('bad_request', issue?.message && !issue.message.startsWith('Invalid') && !issue.message.startsWith('Too') ? issue.message : 'Confira as peças do pedido.', zodDetails(body.error.issues));
  }
  const id = ctx.params.id ?? '';

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const { order, stamp, stock } = await readOrderAndStock(db, id);
    if (stamp !== body.data.stamp && order.updatedAt !== body.data.stamp) {
      // A retry of an edit that already landed (the answer was lost): the order holds exactly these pieces.
      const wanted = new Map<string, number>();
      for (const l of body.data.items) wanted.set(lineKey({ ...l, size: l.size?.trim() || undefined }), (wanted.get(lineKey({ ...l, size: l.size?.trim() || undefined })) ?? 0) + l.qty);
      if (wanted.size === order.items.length && order.items.every((i) => wanted.get(lineKey(i)) === i.qty)) return json({ order });
      throw new HttpError('conflict', 'Este pedido mudou enquanto você editava (em outro aparelho ou por um comprovante). Confira e edite de novo.', { order });
    }
    if (!EDITABLE_ITEMS.has(order.status)) {
      throw new HttpError('conflict', `Só dá para mudar as peças de pedidos em negociação ou confirmados. Este está como “${STATUS_LABEL[order.status]}”.`, { order });
    }
    const state = stock();
    // Lines already in the order whose piece, finish or size left the catalog keep their stored data
    // (the sale was agreed); only new lines must exist in the catalog today.
    const stored = new Map(order.items.map((i) => [lineKey(i), i]));
    const wanted = body.data.items.map((l) => ({ ...l, size: l.size?.trim() || undefined }));
    let priced = priceOrder(state.catalog, wanted, { owner: true });
    let kept: OrderItem[] = [];
    if (!priced.ok) {
      const unpriceable = new Set(priced.problems.map((p) => lineKey(p)));
      if (![...unpriceable].every((k) => stored.has(k))) {
        const fresh = priced.problems.filter((p) => !stored.has(lineKey(p)));
        throw new HttpError('conflict', ownerPricingMessage(fresh), { problems: fresh });
      }
      const qty = new Map<string, number>();
      for (const l of wanted) if (unpriceable.has(lineKey(l))) qty.set(lineKey(l), (qty.get(lineKey(l)) ?? 0) + l.qty);
      kept = [...qty].map(([k, q]) => ({ ...stored.get(k)!, qty: Math.min(q, MAX_ORDER_LINE_QTY) }));
      priced = priceOrder(state.catalog, wanted.filter((l) => !unpriceable.has(lineKey(l))), { owner: true });
      if (!priced.ok) throw new HttpError('conflict', ownerPricingMessage(priced.problems), { problems: priced.problems });
    }
    const agreed = new Map(order.items.map((i) => [lineKey(i), i.unitCents]));
    const items = [...priced.items.map((i) => ({ ...i, unitCents: agreed.get(lineKey(i)) ?? i.unitCents })), ...kept];
    if (!items.length) throw new HttpError('bad_request', 'O pedido precisa de pelo menos uma peça.');
    const totalCents = items.reduce((sum, i) => sum + i.unitCents * i.qty, 0);
    const same =
      items.length === order.items.length && items.every((i) => order.items.some((o) => lineKey(o) === lineKey(i) && o.qty === i.qty && o.unitCents === i.unitCents));
    if (same) return json({ order });

    const at = nextStamp(stamp);
    const next: Order = { ...order, items, totalCents, updatedAt: at, history: [...order.history, { at, status: order.status, event: 'itens' as const }].slice(-200) };
    const dropCharge = !!order.charge && totalCents !== order.totalCents;
    if (dropCharge) delete next.charge;

    const statements: D1PreparedStatement[] = [];
    let publish: ReturnType<typeof publishStatements> | null = null;
    if (HOLDS_STOCK.has(order.status)) {
      // A line that was not counted when the order was confirmed (no stock control then) holds no
      // units: only its extra quantity is taken now. Lines that hold units are netted by planStock.
      const held = new Set((order.stockMoves ?? []).map((m) => rowKey(m.productId, m.variantId, m.size)));
      const before = new Map(order.items.map((i) => [rowKey(i.productId, i.variantId, i.size ?? ''), i.qty]));
      const take = movesOf(items).flatMap((m) => {
        const key = rowKey(m.productId, m.variantId, m.size);
        if (held.has(key) || !before.has(key)) return [m];
        const extra = m.qty - before.get(key)!;
        return extra > 0 ? [{ ...m, qty: extra }] : [];
      });
      const plan = planStock(db, state, at, { orderId: order.id }, order.stockMoves ?? [], take, items);
      if (plan.problems.length) throw new HttpError('conflict', `Estoque insuficiente: ${plan.problems.join('; ')}. Ajuste o estoque ou o pedido.`, { stock: plan.problems });
      next.stockMoves = plan.taken;
      if (plan.statements.length) {
        publish = publishStatements(db, state, plan.rows, state.tracked);
        statements.push(...plan.statements, ...publish.statements);
      }
    }
    orderSchema.parse(next);

    try {
      await db.batch([
        ...(publish ? [publish.first] : []),
        unchanged(db, order.id, stamp),
        ...statements,
        db
          .prepare(`UPDATE orders SET total_cents = ?2, updated_at = ?3, data = ?4${dropCharge ? ', pay_token = NULL' : ''} WHERE id = ?1`)
          .bind(order.id, totalCents, at, toData(next)),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'order.items', `Pedido ${order.number}: itens alterados`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      if (/CHECK constraint failed/i.test(error instanceof Error ? error.message : '')) throw new HttpError('integrity', 'O estoque ficaria fora do limite permitido. Confira o estoque desta peça.');
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(ctx.env));
    if (publish) ctx.waitUntil(notifyCatalog(ctx.env, publish.version));
    if (dropCharge && order.charge?.mp && !order.charge.paidBy) ctx.waitUntil(cancelMpPix(ctx.env, order.charge.mp.id));
    return json({ order: next, chargeDropped: dropCharge, ...(publish ? { version: publish.version } : {}) });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}
