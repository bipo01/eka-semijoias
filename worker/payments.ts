import { z } from 'zod';
import {
  chargeAmount,
  payState,
  RECEIPT_MAX_BYTES,
  type Order,
  type PayView,
  currentReceipts,
  RECEIPT_ERASE_WINDOW_MS,
  RECEIPT_KEEP_MS,
  RECEIPTS_ERASABLE,
  lastReceiptDiscarded,
  receiptsExpired,
  receiptsWithNew,
  storedReceipts,
  type ReceiptType,
  withReceiptErased,
  withReceiptsErased,
} from '../src/data/orders';
import type { Env } from './env';
import type { Catalog } from '../src/data/schema';
import { hitStatement, ipKey, pruneThrottle, requireSession, retryAfter } from './auth';
import { parseSnapshotBody, WRITE_ATTEMPTS } from './catalog';
import { base64ToBytes, bytesToBase64, randomToken, sha256Hex } from './crypto';
import { isGuardMiss, toHttpError, withReadRetry } from './db';
import { BASE_HEADERS, HttpError, json, readBody, readJson } from './http';
import { notifyOrders } from './live';
import { notifyOwner, receiptNotice } from './push';
import { sniffReceipt } from './media';
import { nextStamp, readOrder, toData, toOrder, unchanged, type OrderRow } from './orders';
import type { Context } from './router';

/*
 * Pix charges and payment receipts (docs/vendas/PAGAMENTO_PLAN.md).
 * - The admin creates a charge for a confirmed order: a secret token makes the
 *   payment link /pagamento/<token>; changing the amount issues a new token.
 * - The public payment page reads a minimal view of the order by token and
 *   uploads receipts, which are stored apart and served to the admin only.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const RECEIPT_WINDOW_MS = 60 * 60 * 1000;
export const RECEIPTS_PER_WINDOW = 20;
export const RECEIPTS_GLOBAL_PER_WINDOW = 300;

const chargeInput = z.object({
  shippingCents: z.number().int().min(0).max(10_000_000),
  discountCents: z.number().int().min(0).max(100_000_000),
});

function currentPix(snapshotBody: string | undefined): Catalog['settings']['pix'] | undefined {
  if (!snapshotBody) return undefined;
  return parseSnapshotBody(snapshotBody).settings.pix;
}

/**
 * POST /api/admin/orders/:id/charge { shippingCents, discountCents } — creates
 * (or updates) the Pix charge of a confirmed order. Same amount keeps the link;
 * another amount issues a new token, so an old link never shows a stale value.
 */
export async function handleCharge(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const parsed = chargeInput.safeParse(await readJson(ctx.request, 1024));
  if (!parsed.success) throw new HttpError('bad_request', 'Confira o frete e o desconto.');
  const { shippingCents, discountCents } = parsed.data;

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const { order, stamp } = await readOrder(db, ctx.params.id ?? '');
    if (order.status !== 'confirmado') {
      throw new HttpError('conflict', order.status === 'enviado' ? 'Confirme o pedido antes de cobrar.' : 'Este pedido não aceita mais cobrança.', { order });
    }
    const snapshot = await withReadRetry(() => db.prepare('SELECT body FROM catalog_snapshot WHERE id = 1').first<{ body: string }>());
    if (!currentPix(snapshot?.body)) throw new HttpError('not_configured', 'Cadastre a chave Pix em Configurações antes de cobrar.');
    const amountCents = chargeAmount(order.totalCents, shippingCents, discountCents);
    if (amountCents < 1) throw new HttpError('bad_request', 'O desconto não pode ser maior que o pedido com frete.');

    const sameAmount = order.charge && order.charge.amountCents === amountCents && order.charge.shippingCents === shippingCents && order.charge.discountCents === discountCents;
    const at = nextStamp(stamp);
    const token = sameAmount ? order.charge!.token : randomToken().slice(0, 32);
    // Same amount: the link already sent stays valid.
    const next: Order = { ...order, updatedAt: at, charge: sameAmount ? order.charge! : { token, shippingCents, discountCents, amountCents, createdAt: at } };
    try {
      await db.batch([
        unchanged(db, order.id, stamp),
        db.prepare('UPDATE orders SET data = ?2, updated_at = ?3, pay_token = ?4 WHERE id = ?1').bind(order.id, toData(next), at, token),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'order.charge', `Cobrança Pix do pedido ${order.number}: ${amountCents} centavos`),
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

async function orderByToken(db: D1Database, token: string): Promise<{ order: Order; stamp: string; snapshotBody?: string }> {
  if (!TOKEN_PATTERN.test(token)) throw new HttpError('not_found', 'Link de pagamento não encontrado.');
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT id, number, status, updated_at, data FROM orders WHERE pay_token = ?1').bind(token),
      db.prepare('SELECT body FROM catalog_snapshot WHERE id = 1'),
    ]),
  );
  const row = results[0]?.results[0] as OrderRow | undefined;
  if (!row) throw new HttpError('not_found', 'Este link de pagamento não vale mais. Peça um novo pelo WhatsApp.');
  const order = toOrder(row);
  if (!order.charge || order.charge.token !== token) throw new HttpError('not_found', 'Este link de pagamento não vale mais. Peça um novo pelo WhatsApp.');
  const body = results[1]?.results[0]?.body as string | undefined;
  return { order, stamp: row.updated_at, ...(body ? { snapshotBody: body } : {}) };
}

const firstName = (name: string) => (name.trim().split(/\s+/)[0] ?? '').slice(0, 40);

/** GET /api/pay/:token — what the payment page shows. */
export async function handlePayView(ctx: Context): Promise<Response> {
  const { order, snapshotBody } = await orderByToken(ctx.env.DB, ctx.params.token ?? '');
  const charge = order.charge!;
  const pix = currentPix(snapshotBody);
  const view: PayView = {
    number: order.number,
    firstName: order.anonymized ? '' : firstName(order.customer.name),
    items: order.items.map((i) => ({ name: i.name, finish: i.finish, ...(i.size ? { size: i.size } : {}), qty: i.qty, lineCents: i.unitCents * i.qty })),
    subtotalCents: order.totalCents,
    shippingCents: charge.shippingCents,
    discountCents: charge.discountCents,
    amountCents: charge.amountCents,
    state: payState(order),
    receipts: currentReceipts(order).map((r) => ({ at: r.at })),
    pix: pix ? { key: pix.key, name: pix.name, city: pix.city } : null,
    discarded: lastReceiptDiscarded(order),
  };
  return json(view, { headers: { 'Referrer-Policy': 'no-referrer' } });
}

/**
 * POST /api/pay/:token/receipt — raw file body (PNG, JPEG, WebP or PDF, ≤ RECEIPT_MAX_BYTES = 700 KB).
 * One file is stored per charge: a new one replaces the stored file in the same guarded batch.
 */
export async function handleUploadReceipt(ctx: Context): Promise<Response> {
  const db = ctx.env.DB;
  const token = ctx.params.token ?? '';
  const declared = (ctx.request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(declared)) throw new HttpError('unsupported_type', 'Envie o comprovante em PNG, JPG ou PDF.');
  const bytes = await readBody(ctx.request, RECEIPT_MAX_BYTES);
  if (!bytes.length) throw new HttpError('bad_request', 'O arquivo chegou vazio.');
  const actual = sniffReceipt(bytes);
  if (!actual || actual !== declared) throw new HttpError('unsupported_type', 'Este arquivo não parece um comprovante em PNG, JPG ou PDF.');

  if (!ctx.env.PIN_PEPPER || ctx.env.PIN_PEPPER.length < 32) throw new HttpError('not_configured', 'Não foi possível receber o comprovante agora.');
  const now = Date.now();
  const ip = await ipKey(ctx.env.PIN_PEPPER, ctx.request);
  // Per network first (slows token guessing); the shared budget is spent only by valid links.
  const ipHit = (await hitStatement(db, `receipt:ip:${ip}`, RECEIPT_WINDOW_MS, now).first<{ count: number; window_start: number }>())!;
  if (ipHit.count > RECEIPTS_PER_WINDOW) throw retryAfter(ipHit.window_start + RECEIPT_WINDOW_MS, now, 'Recebemos vários arquivos deste aparelho.');
  await orderByToken(db, token); // 404 for unknown or dead links, before touching the shared budget
  const globalHit = (await hitStatement(db, 'receipt:global', RECEIPT_WINDOW_MS, now).first<{ count: number; window_start: number }>())!;
  if (globalHit.count > RECEIPTS_GLOBAL_PER_WINDOW) throw retryAfter(globalHit.window_start + RECEIPT_WINDOW_MS, now, 'Recebemos muitos arquivos agora.');

  const sha = await sha256Hex(bytes);
  const encoded = bytesToBase64(bytes);
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const { order, stamp } = await orderByToken(db, token);
    const state = payState(order);
    if (state === 'pago') throw new HttpError('conflict', 'Este pedido já está pago. Obrigada!');
    if (state === 'cancelado') throw new HttpError('conflict', 'Este pedido foi cancelado. Fale com a gente pelo WhatsApp.');
    // Only a confirmed order (pieces held) with a live charge takes payment receipts.
    if (order.status !== 'confirmado' || order.anonymized) throw new HttpError('conflict', 'Este link de pagamento não vale mais. Peça um novo pelo WhatsApp.');
    const receipts = order.receipts ?? [];
    // The same file again for this charge (a retry whose first answer was lost): already received.
    const same = await db.prepare('SELECT id, created_at FROM receipts WHERE order_id = ?1 AND sha256 = ?2').bind(order.id, sha).all<{ id: string; created_at: string }>();
    const already = same.results.find((row) => receipts.some((r) => r.id === row.id && r.chargeToken === order.charge!.token));
    if (already) return json({ receipt: { at: already.created_at } }, { status: 201 });
    // The very file the store discarded, sent again: say so instead of storing it once more.
    if (receipts.some((r) => r.rejected && r.sha256 === sha)) throw new HttpError('conflict', 'Este é o mesmo comprovante que a loja descartou. Envie o comprovante do pagamento deste pedido.');
    const at = nextStamp(stamp);
    const id = `rcp_${randomToken().slice(0, 16)}`;
    // One stored file per charge: the customer's new file replaces the one she sent for this payment link.
    const { receipts: kept, replaced } = receiptsWithNew(receipts, { id, at, contentType: actual, size: bytes.length, chargeToken: order.charge!.token, sha256: sha });
    const next: Order = { ...order, updatedAt: at, receipts: kept };
    try {
      await db.batch([
        unchanged(db, order.id, stamp),
        // The replaced file goes in the same batch: never two files, never none.
        ...(replaced.length ? [db.prepare('DELETE FROM receipts WHERE order_id = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(order.id, JSON.stringify(replaced.map((r) => r.id)))] : []),
        // Stored as base64 text (the column has BLOB affinity, so the text is kept as is): see bytesToBase64.
        db.prepare('INSERT INTO receipts (id, order_id, created_at, content_type, size, sha256, bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)').bind(id, order.id, at, actual, bytes.length, sha, encoded),
        db.prepare('UPDATE orders SET data = ?2, updated_at = ?3 WHERE id = ?1').bind(order.id, toData(next), at),
        db
          .prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)')
          .bind(at, replaced.length ? 'order.receipt_replace' : 'order.receipt', replaced.length ? `Comprovante trocado pela cliente no pedido ${order.number}` : `Comprovante recebido no pedido ${order.number}`),
        pruneThrottle(db, now),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(ctx.env));
    ctx.waitUntil(notifyOwner(ctx.env, ctx.url.origin, receiptNotice(order.number, order.charge!.amountCents, replaced.length > 0)));
    return json({ receipt: { at } }, { status: 201 });
  }
  throw new HttpError('unavailable', 'Muitos envios ao mesmo tempo. Tente de novo.');
}

function toBytes(value: unknown): Uint8Array | null {
  if (typeof value === 'string') return base64ToBytes(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return null;
}

const EXTENSION: Record<ReceiptType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** GET /api/admin/receipts/:id — the file, for the admin only; never cached. */
export async function handleGetReceipt(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const id = ctx.params.id ?? '';
  if (!/^rcp_[A-Za-z0-9_-]{8,40}$/.test(id)) throw new HttpError('not_found', 'Comprovante não encontrado.');
  const row = await withReadRetry(() =>
    ctx.env.DB.prepare('SELECT r.content_type, r.bytes, o.number FROM receipts r JOIN orders o ON o.id = r.order_id WHERE r.id = ?1').bind(id).first<{ content_type: ReceiptType; bytes: unknown; number: number }>(),
  );
  const bytes = toBytes(row?.bytes);
  if (!row || !bytes) throw new HttpError('not_found', 'Comprovante não encontrado.');
  const pdf = row.content_type === 'application/pdf';
  return new Response(ctx.request.method === 'HEAD' ? null : bytes, {
    headers: {
      ...BASE_HEADERS,
      'Content-Type': row.content_type,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      // Customer-supplied PDFs can carry scripts: never rendered on this origin (where the admin
      // session lives); they download and open in the device's own viewer. Images render inline in a
      // sandboxed, script-free document.
      'Content-Disposition': `${pdf ? 'attachment' : 'inline'}; filename="comprovante-pedido-${row.number}.${EXTENSION[row.content_type]}"`,
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox",
    },
  });
}

// ---------------------------------------------------------------------------
// Receipt files are kept only while the payment is being checked
// ---------------------------------------------------------------------------

/** One guarded batch: the order keeps the receipts' record (date, type, size) and the files go. */
function eraseStatements(db: D1Database, order: Order, stamp: string, at: string, summary: string) {
  const next = { ...withReceiptsErased(order, at), updatedAt: at };
  return {
    next,
    statements: [
      unchanged(db, order.id, stamp), // a status change landed meanwhile: re-read so neither write is lost
      db.prepare('UPDATE orders SET data = ?2, updated_at = ?3 WHERE id = ?1').bind(order.id, toData(next), at),
      db.prepare('DELETE FROM receipts WHERE order_id = ?1').bind(order.id),
      db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'order.receipts_erase', summary),
    ],
  };
}

/**
 * POST /api/admin/orders/:id/receipts/:receiptId/erase — one receipt, in any status. While the payment is
 * still open it is a discarded wrong file (`rejected`): it stops counting as under review, so the payment
 * link shows the Pix again and asks for the right receipt. Only that receipt's file is deleted; the
 * guarded batch re-reads the order if anything changed meanwhile (a new upload, a status change). Idempotent.
 */
const eraseIntent = z.object({ action: z.enum(['discard', 'erase']) });

export async function handleEraseReceipt(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const receiptId = ctx.params.receiptId ?? '';
  // What the owner confirmed: "Descartar" (payment open) or "Apagar" (payment checked). If the order
  // changed status meanwhile (another device), nothing is done and she sees the order as it is now.
  const intent = eraseIntent.safeParse(await readJson(ctx.request, 256));
  if (!intent.success) throw new HttpError('bad_request', 'Pedido inválido.');
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const { order, stamp } = await readOrder(db, ctx.params.id ?? '');
    const receipt = (order.receipts ?? []).find((r) => r.id === receiptId);
    if (!receipt) throw new HttpError('not_found', 'Comprovante não encontrado neste pedido.');
    if (receipt.erasedAt) return json({ order });
    const discarded = !RECEIPTS_ERASABLE.has(order.status);
    if ((intent.data.action === 'discard') !== discarded) {
      throw new HttpError('conflict', discarded ? 'O pedido voltou para conferência do pagamento. Confira e tente de novo.' : 'O pagamento deste pedido já foi conferido. Confira e tente de novo.', { order });
    }
    const at = nextStamp(stamp);
    const next: Order = { ...withReceiptErased(order, receiptId, at), updatedAt: at };
    try {
      await db.batch([
        unchanged(db, order.id, stamp), // anything changed meanwhile: re-read so neither write is lost
        db.prepare('UPDATE orders SET data = ?2, updated_at = ?3 WHERE id = ?1').bind(order.id, toData(next), at),
        db.prepare('DELETE FROM receipts WHERE id = ?1 AND order_id = ?2').bind(receiptId, order.id),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, discarded ? 'order.receipt_discard' : 'order.receipt_erase', `Comprovante do pedido ${order.number} ${discarded ? 'descartado' : 'apagado'} pela loja`),
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

/** POST /api/admin/orders/:id/receipts/erase — after the payment is checked (paid, delivered or cancelled). Idempotent. */
export async function handleEraseReceipts(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const { order, stamp } = await readOrder(db, ctx.params.id ?? '');
    if (!RECEIPTS_ERASABLE.has(order.status)) throw new HttpError('conflict', 'Os comprovantes podem ser apagados depois que o pagamento for conferido.', { order });
    const stored = storedReceipts(order).length;
    if (!stored) return json({ order });
    const at = nextStamp(stamp);
    const { next, statements } = eraseStatements(db, order, stamp, at, `Comprovantes do pedido ${order.number} apagados pela loja (${stored})`);
    try {
      await db.batch(statements);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(ctx.env));
    return json({ order: next });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

/**
 * Daily (cron trigger): erases the receipt files of orders settled for RECEIPT_KEEP_DAYS or longer.
 * Reads only orders that still have stored files (index on receipts.order_id). A guard miss (the order
 * changed meanwhile) is skipped: the next run picks it up.
 */
/** Orders handled per run: keeps a run inside the Free plan's per-invocation limits; the rest go the next day. */
const ERASE_BATCH = 40;

export async function eraseExpiredReceipts(env: Env, now = Date.now()): Promise<{ erased: number; orders: number }> {
  const db = env.DB;
  // Tests only: a finite, non-negative override; anything else (unset, empty, garbage) keeps the 7 days.
  const override = env.DEV_RECEIPT_KEEP_MS?.trim() ? Number(env.DEV_RECEIPT_KEEP_MS) : NaN;
  const keepMs = Number.isFinite(override) && override >= 0 ? override : RECEIPT_KEEP_MS;
  const { results } = await withReadRetry(() =>
    db
      .prepare(
        `SELECT id, number, status, updated_at, data, customer_id FROM orders o
         WHERE status IN ('pago', 'entregue', 'cancelado') AND EXISTS (SELECT 1 FROM receipts r WHERE r.order_id = o.id)
         ORDER BY updated_at LIMIT ?1`,
      )
      .bind(ERASE_BATCH)
      .all<OrderRow>(),
  );
  let erased = 0;
  let orders = 0;
  for (const row of results) {
    // One bad row (unreadable JSON, a failed write) never stops the run for the others.
    try {
      const order = toOrder(row);
      if (!receiptsExpired(order, now + RECEIPT_ERASE_WINDOW_MS, keepMs)) continue;
      const count = storedReceipts(order).length;
      const at = nextStamp(row.updated_at);
      const { statements } = eraseStatements(db, order, row.updated_at, at, `Comprovantes do pedido ${order.number} apagados automaticamente (${count})`);
      await db.batch(statements);
      erased += count;
      orders += 1;
    } catch (error) {
      if (!isGuardMiss(error)) console.log(JSON.stringify({ event: 'receipts_erase_failed', order: row.number, message: error instanceof Error ? error.message : String(error) }));
    }
  }
  if (orders) await notifyOrders(env);
  console.log(JSON.stringify({ event: 'receipts_erase', orders, erased }));
  return { erased, orders };
}
