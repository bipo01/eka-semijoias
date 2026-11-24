import { z } from 'zod';
import { customerInputSchema, customerRecordSchema, nameKey, type CustomerRecord } from '../src/data/customers';
import { IS_SALE, type Order } from '../src/data/orders';
import { requireSession } from './auth';
import { IDEMPOTENCY_TTL_MS, WRITE_ATTEMPTS } from './catalog';
import { randomToken, sha256Hex } from './crypto';
import { guard, isGuardMiss, toHttpError, withReadRetry } from './db';
import { HttpError, json, readJson, zodDetails } from './http';
import { notifyOrders } from './live';
import { nextStamp, toData, toOrder, unchanged, type OrderRow } from './orders';
import type { Context } from './router';

/*
 * The owner's customers (docs/revenda/PLAN.md §1). Admin only: every handler
 * requires the admin session. Personal data never reaches logs, the audit log
 * (ids only), the public snapshot or the live channel (which only says
 * "orders" when a link changes). Writes are compare-and-swap on `updated_at`;
 * creating is idempotent (Idempotency-Key), and the WhatsApp is unique.
 */

const CUSTOMER_MAX_BYTES = 4096;
const LIST_LIMIT = 5000;
const CUSTOMER_ORDERS_LIMIT = 200;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** What a customer has bought: linked orders, sales among them, their value (items − discount) and the last sale. */
export interface CustomerStats {
  orders: number;
  purchases: number;
  spentCents: number;
  lastPurchaseAt: string | null;
}

interface CustomerRow {
  id: string;
  created_at: string;
  updated_at: string;
  data: string;
}

interface StatsRow {
  orders: number | null;
  purchases: number | null;
  spent: number | null;
  last_at: string | null;
}

const SALE_STATUSES = [...IS_SALE].map((s) => `'${s}'`).join(', ');

/**
 * Per-customer aggregates over `orders`, with the report's sale rule (src/data/orders.ts `saleCents`):
 * statuses that count as sales, items total minus the charge discount, never below zero.
 */
const STATS_COLUMNS = `COUNT(*) AS orders,
  SUM(CASE WHEN status IN (${SALE_STATUSES}) THEN 1 ELSE 0 END) AS purchases,
  SUM(CASE WHEN status IN (${SALE_STATUSES}) THEN MAX(0, total_cents - COALESCE(json_extract(data, '$.charge.discountCents'), 0)) ELSE 0 END) AS spent,
  MAX(CASE WHEN status IN (${SALE_STATUSES}) THEN created_at END) AS last_at`;

const toStats = (row: Partial<StatsRow> | undefined): CustomerStats => ({
  orders: row?.orders ?? 0,
  purchases: row?.purchases ?? 0,
  spentCents: row?.spent ?? 0,
  lastPurchaseAt: row?.last_at ?? null,
});

/** The stored row as a record (`updatedAt` is the column every write compares). */
function toCustomer(row: CustomerRow): CustomerRecord {
  return { ...(JSON.parse(row.data) as CustomerRecord), id: row.id, createdAt: row.created_at, updatedAt: row.updated_at };
}

const firstIssue = (issues: readonly { message: string }[], fallback: string) => {
  const message = issues[0]?.message;
  return message && !message.startsWith('Invalid') && !message.startsWith('Too') ? message : fallback;
};

/** "31/02" passes the schema's format: refuse dates that never happen. */
function birthdayProblem(birthday: string | undefined): string | null {
  if (!birthday) return null;
  const [day, month] = birthday.split('/').map(Number) as [number, number];
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return max && day >= 1 && day <= max ? null : 'Aniversário inválido. Use DD/MM, por exemplo 25/03.';
}

type CustomerInput = z.output<typeof customerInputSchema>;

function parseInput<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError('bad_request', firstIssue(parsed.error.issues, 'Confira os dados da cliente.'), zodDetails(parsed.error.issues));
  const problem = birthdayProblem((parsed.data as CustomerInput).birthday);
  if (problem) throw new HttpError('bad_request', problem, [{ path: 'birthday', message: problem }]);
  return parsed.data;
}

/** The stored record for an input (empty optional fields are left out). */
function recordOf(id: string, input: CustomerInput, createdAt: string, updatedAt: string): CustomerRecord {
  const note = input.note?.trim();
  return customerRecordSchema.parse({
    id,
    name: input.name,
    whatsapp: input.whatsapp,
    city: input.city,
    uf: input.uf,
    ...(input.instagram ? { instagram: input.instagram } : {}),
    ...(input.birthday ? { birthday: input.birthday } : {}),
    ...(note ? { note } : {}),
    createdAt,
    updatedAt,
  });
}

/** Same personal data (timestamps aside)? */
function sameData(a: CustomerRecord, b: CustomerRecord): boolean {
  const strip = ({ createdAt: _c, updatedAt: _u, ...rest }: CustomerRecord) => rest;
  const x = strip(a);
  const y = strip(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]) as Set<keyof typeof x>;
  return [...keys].every((k) => (x[k] ?? '') === (y[k] ?? ''));
}

async function existingByWhatsapp(db: D1Database, whatsapp: string): Promise<CustomerRecord | null> {
  const row = await withReadRetry(() => db.prepare('SELECT id, created_at, updated_at, data FROM customers WHERE whatsapp = ?1').bind(whatsapp).first<CustomerRow>());
  return row ? toCustomer(row) : null;
}

const duplicate = (existing: CustomerRecord) => new HttpError('conflict', `Já existe uma cliente com este WhatsApp: ${existing.name}.`, { customer: existing, reason: 'whatsapp' });

const isUniqueWhatsapp = (error: unknown) => /UNIQUE constraint failed: customers\.whatsapp/i.test(error instanceof Error ? error.message : '');

const audit = (db: D1Database, at: string, action: string, summary: string) => db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, action, summary);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** GET /api/admin/customers — newest first, each with what she bought (one query). */
export async function handleListCustomers(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const { results } = await withReadRetry(() =>
    ctx.env.DB.prepare(
      `SELECT c.id, c.created_at, c.updated_at, c.data, s.orders, s.purchases, s.spent, s.last_at
       FROM customers c
       LEFT JOIN (SELECT customer_id, ${STATS_COLUMNS} FROM orders WHERE customer_id IS NOT NULL GROUP BY customer_id) s ON s.customer_id = c.id
       ORDER BY c.created_at DESC LIMIT ?1`,
    )
      .bind(LIST_LIMIT)
      .all<CustomerRow & StatsRow>(),
  );
  return json({ customers: results.map((r) => ({ ...toCustomer(r), stats: toStats(r) })), limit: LIST_LIMIT });
}

/** GET /api/admin/customers/:id — the customer, her numbers and her orders (newest first). */
export async function handleGetCustomer(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const id = ctx.params.id ?? '';
  if (!ID.test(id)) throw new HttpError('not_found', 'Cliente não encontrada.');
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT id, created_at, updated_at, data FROM customers WHERE id = ?1').bind(id),
      db.prepare(`SELECT ${STATS_COLUMNS} FROM orders WHERE customer_id = ?1`).bind(id),
      db.prepare('SELECT id, number, status, updated_at, data, customer_id FROM orders WHERE customer_id = ?1 ORDER BY created_at DESC LIMIT ?2').bind(id, CUSTOMER_ORDERS_LIMIT),
    ]),
  );
  const row = results[0]?.results[0] as CustomerRow | undefined;
  if (!row) throw new HttpError('not_found', 'Cliente não encontrada. Ela pode ter sido apagada.');
  const orders = ((results[2]?.results ?? []) as unknown as OrderRow[]).map(toOrder);
  return json({ customer: { ...toCustomer(row), stats: toStats(results[1]?.results[0] as StatsRow | undefined) }, orders });
}

/** POST /api/admin/customers (Idempotency-Key required) — 409 with the existing customer when the WhatsApp is taken. */
export async function handleCreateCustomer(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const key = ctx.request.headers.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new HttpError('bad_request', 'Chave de envio inválida.');
  const input = parseInput(customerInputSchema, await readJson(ctx.request, CUSTOMER_MAX_BYTES));
  const idemKey = `customer:${key}`;
  const requestHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(input)));

  const first = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey),
      db.prepare('SELECT id, created_at, updated_at, data FROM customers WHERE whatsapp = ?1').bind(input.whatsapp || null),
    ]),
  );
  const replay = first[0]?.results[0] as { request_hash: string; response: string } | undefined;
  if (replay) {
    if (replay.request_hash !== requestHash) throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outra cliente.');
    return json(JSON.parse(replay.response), { status: 201 });
  }
  const taken = first[1]?.results[0] as CustomerRow | undefined;
  if (taken) throw duplicate(toCustomer(taken));

  const now = Date.now();
  const at = new Date(now).toISOString();
  const customer = recordOf(`cus_${randomToken().slice(0, 16)}`, input, at, at);
  const response = { customer: { ...customer, stats: toStats(undefined) } };
  try {
    await db.batch([
      // First, so a retry of the same request fails here (and is answered with its customer) before the WhatsApp check.
      db.prepare('INSERT INTO idempotency (key, request_hash, created_at, response) VALUES (?1, ?2, ?3, ?4)').bind(idemKey, requestHash, now, JSON.stringify(response)),
      db.prepare('INSERT INTO customers (id, whatsapp, name_key, created_at, updated_at, data) VALUES (?1, ?2, ?3, ?4, ?4, ?5)').bind(customer.id, customer.whatsapp || null, nameKey(customer.name), at, JSON.stringify(customer)),
      db.prepare('DELETE FROM idempotency WHERE created_at < ?1').bind(now - IDEMPOTENCY_TTL_MS),
      audit(db, at, 'customer.create', `Cliente ${customer.id} cadastrada`),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE constraint failed: idempotency/i.test(message)) {
      const stored = await withReadRetry(() => db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey).first<{ request_hash: string; response: string }>());
      if (stored && stored.request_hash === requestHash) return json(JSON.parse(stored.response), { status: 201 });
      throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outra cliente.');
    }
    if (isUniqueWhatsapp(error)) {
      const existing = await existingByWhatsapp(db, customer.whatsapp);
      if (existing) throw duplicate(existing);
    }
    throw toHttpError(error);
  }
  return json(response, { status: 201 });
}

const updateSchema = customerInputSchema.extend({ updatedAt: z.string().min(1).max(40) });

/** PUT /api/admin/customers/:id { ...data, updatedAt } — compare-and-swap on the version the form started from. */
export async function handleUpdateCustomer(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const id = ctx.params.id ?? '';
  if (!ID.test(id)) throw new HttpError('not_found', 'Cliente não encontrada.');
  const { updatedAt: expected, ...input } = parseInput(updateSchema, await readJson(ctx.request, CUSTOMER_MAX_BYTES));

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const row = await withReadRetry(() => db.prepare('SELECT id, created_at, updated_at, data FROM customers WHERE id = ?1').bind(id).first<CustomerRow>());
    if (!row) throw new HttpError('not_found', 'Cliente não encontrada. Ela pode ter sido apagada.');
    const current = toCustomer(row);
    const wanted = recordOf(id, input, current.createdAt, current.updatedAt);
    // Already saved (a retry whose answer was lost, or nothing changed): answer with what is stored.
    if (sameData(current, wanted)) return json({ customer: current });
    if (row.updated_at !== expected) {
      throw new HttpError('conflict', 'Esta ficha foi alterada em outro aparelho. Confira os dados e salve de novo.', { customer: current });
    }
    const at = nextStamp(row.updated_at);
    const next: CustomerRecord = { ...wanted, updatedAt: at };
    try {
      await db.batch([
        guard(db, '(SELECT updated_at FROM customers WHERE id = ?1) = ?2', id, row.updated_at),
        db.prepare('UPDATE customers SET whatsapp = ?2, name_key = ?3, updated_at = ?4, data = ?5 WHERE id = ?1').bind(id, next.whatsapp || null, nameKey(next.name), at, JSON.stringify(next)),
        audit(db, at, 'customer.update', `Cliente ${id} alterada`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue; // changed meanwhile: re-read (a real conflict answers 409 above)
      if (isUniqueWhatsapp(error)) {
        const existing = await existingByWhatsapp(db, next.whatsapp);
        if (existing && existing.id !== id) throw duplicate(existing);
      }
      throw toHttpError(error);
    }
    return json({ customer: next });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

/**
 * DELETE /api/admin/customers/:id — erases the customer (LGPD). Her orders stay (with their own name
 * and city) and lose the link, in the same batch. Idempotent.
 */
export async function handleDeleteCustomer(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const id = ctx.params.id ?? '';
  if (!ID.test(id)) throw new HttpError('not_found', 'Cliente não encontrada.');
  const at = new Date().toISOString();
  let results: D1Result<{ id?: string }>[];
  try {
    results = await db.batch<{ id?: string }>([
      // updated_at moves, so a write that read the order before this one re-reads it (compare-and-swap).
      db
        .prepare(`UPDATE orders SET customer_id = NULL, updated_at = ?2, data = json_set(json_remove(data, '$.customerId'), '$.updatedAt', ?2) WHERE customer_id = ?1`)
        .bind(id, at),
      db.prepare('DELETE FROM customers WHERE id = ?1 RETURNING id').bind(id),
    ]);
  } catch (error) {
    throw toHttpError(error);
  }
  const unlinked = results[0]?.meta.changes ?? 0;
  const deleted = !!results[1]?.results[0];
  if (deleted) {
    await audit(db, at, 'customer.delete', `Cliente ${id} apagada${unlinked ? ` (${unlinked} ${unlinked === 1 ? 'pedido desvinculado' : 'pedidos desvinculados'})` : ''}`)
      .run()
      .catch(() => undefined);
  }
  if (unlinked) ctx.waitUntil(notifyOrders(ctx.env));
  return json({ deleted, unlinked });
}

const linkSchema = z.object({ customerId: z.string().regex(ID).nullable() });

/** POST /api/admin/orders/:id/customer { customerId | null } — links or unlinks a customer (compare-and-swap on the order). */
export async function handleLinkOrderCustomer(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const body = linkSchema.safeParse(await readJson(ctx.request, 1024));
  if (!body.success) throw new HttpError('bad_request', 'Cliente inválida.');
  const wanted = body.data.customerId;
  const id = ctx.params.id ?? '';
  if (!ID.test(id)) throw new HttpError('not_found', 'Pedido não encontrado.');

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const results = await withReadRetry(() =>
      db.batch<Record<string, unknown>>([
        db.prepare('SELECT id, number, status, updated_at, data, customer_id FROM orders WHERE id = ?1').bind(id),
        db.prepare('SELECT id FROM customers WHERE id = ?1').bind(wanted ?? ''),
      ]),
    );
    const row = results[0]?.results[0] as OrderRow | undefined;
    if (!row) throw new HttpError('not_found', 'Pedido não encontrado.');
    const order = toOrder(row);
    if ((order.customerId ?? null) === wanted) return json({ order }); // already so (a retried request)
    if (wanted && !results[1]?.results[0]) throw new HttpError('not_found', 'Cliente não encontrada. Ela pode ter sido apagada.');
    if (wanted && order.anonymized) throw new HttpError('conflict', 'Os dados da cliente deste pedido foram apagados: não dá para vincular uma ficha a ele.', { order });

    const at = nextStamp(row.updated_at);
    const next: Order = { ...order, updatedAt: at };
    if (wanted) next.customerId = wanted;
    else delete next.customerId;
    try {
      await db.batch([
        unchanged(db, order.id, row.updated_at),
        ...(wanted ? [guard(db, 'EXISTS (SELECT 1 FROM customers WHERE id = ?1)', wanted)] : []),
        db.prepare('UPDATE orders SET customer_id = ?2, updated_at = ?3, data = ?4 WHERE id = ?1').bind(order.id, wanted, at, toData(next)),
        audit(db, at, 'order.customer', `Pedido ${order.number}: ${wanted ? `cliente ${wanted} vinculada` : 'cliente desvinculada'}`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue; // the order changed or the customer was erased meanwhile: re-read
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(ctx.env));
    return json({ order: next });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}
