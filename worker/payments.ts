import { z } from 'zod';
import {
  chargeAmount,
  MAX_RECEIPTS_PER_ORDER,
  payState,
  RECEIPT_MAX_BYTES,
  type Order,
  type PayView,
  currentReceipts,
  type ReceiptType,
} from '../src/data/orders';
import type { Catalog } from '../src/data/schema';
import { hitStatement, ipKey, pruneThrottle, requireSession, retryAfter } from './auth';
import { parseSnapshotBody, WRITE_ATTEMPTS } from './catalog';
import { base64ToBytes, bytesToBase64, randomToken, sha256Hex } from './crypto';
import { isGuardMiss, toHttpError, withReadRetry } from './db';
import { BASE_HEADERS, HttpError, json, readBody, readJson } from './http';
import { notifyOrders } from './live';
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
    const next: Order = { ...order, updatedAt: at, charge: { token, shippingCents, discountCents, amountCents, createdAt: sameAmount ? order.charge!.createdAt : at } };
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
  };
  return json(view, { headers: { 'Referrer-Policy': 'no-referrer' } });
}

/** POST /api/pay/:token/receipt — raw file body (PNG, JPEG, WebP or PDF, ≤ 1.9 MB). */
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
    if (receipts.length >= MAX_RECEIPTS_PER_ORDER) throw new HttpError('conflict', 'Já recebemos vários comprovantes deste pedido. Se precisar, mande pelo WhatsApp.');
    const at = nextStamp(stamp);
    const id = `rcp_${randomToken().slice(0, 16)}`;
    const next: Order = { ...order, updatedAt: at, receipts: [...receipts, { id, at, contentType: actual, size: bytes.length, chargeToken: order.charge!.token }] };
    try {
      await db.batch([
        unchanged(db, order.id, stamp),
        // Stored as base64 text (the column has BLOB affinity, so the text is kept as is): see bytesToBase64.
        db.prepare('INSERT INTO receipts (id, order_id, created_at, content_type, size, sha256, bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)').bind(id, order.id, at, actual, bytes.length, sha, encoded),
        db.prepare('UPDATE orders SET data = ?2, updated_at = ?3 WHERE id = ?1').bind(order.id, toData(next), at),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'order.receipt', `Comprovante recebido no pedido ${order.number}`),
        pruneThrottle(db, now),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(ctx.env));
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
