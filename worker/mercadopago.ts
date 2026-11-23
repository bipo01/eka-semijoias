import { z } from 'zod';
import { type MpPix, type Order } from '../src/data/orders';
import { hitStatement, ipKey, retryAfter } from './auth';
import { WRITE_ATTEMPTS } from './catalog';
import { hmacHex, safeEqual } from './crypto';
import { isGuardMiss, toHttpError, withReadRetry } from './db';
import type { Env } from './env';
import { HttpError, json, readBody, readJson } from './http';
import { notifyOrders } from './live';
import { nextStamp, toData, toOrder, unchanged, type OrderRow } from './orders';
import { notifyOwner, paidNotice, strayNotice } from './push';
import type { Context } from './router';

/*
 * Automatic Pix through Mercado Pago (docs/vendas/FASE3_PLAN.md §6). Turned on
 * only when both secrets exist (MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET); otherwise
 * the payment page keeps the static Pix + receipt flow.
 *
 * - The customer asks for an automatic Pix on the payment page (Mercado Pago
 *   requires the payer's e-mail; it is sent to Mercado Pago and not stored).
 * - The order is marked paid only with proof: a webhook with a valid
 *   signature (or the "Já paguei" check) makes us fetch the payment from the
 *   Mercado Pago API, which must be approved, in BRL, for this order and this
 *   charge (external_reference) and for exactly the charged amount. The move
 *   to "pago" is a compare-and-swap, so repeats change nothing.
 */

const DEFAULT_API = 'https://api.mercadopago.com';
const PIX_HOURS = 24;
const CREATE_WINDOW_MS = 60 * 60 * 1000;
const CREATES_PER_WINDOW = 10;
const CHECKS_PER_WINDOW = 120;
/**
 * Signed notices older than this are refused. Replays are harmless (the payment is always fetched
 * from the API and the move to "pago" is a compare-and-swap), and Mercado Pago may retry a notice
 * for days, so the window only rejects absurd timestamps.
 */
const SIGNATURE_TOLERANCE_MS = 7 * 24 * 3600_000;

export const mpEnabled = (env: Env) => !!env.MP_ACCESS_TOKEN && !!env.MP_WEBHOOK_SECRET;
const apiBase = (env: Env) => (env.MP_API_BASE || DEFAULT_API).replace(/\/$/, '');

/** "external_reference" ties a Mercado Pago payment to one order and one charge (a new amount = a new charge). */
export const externalReference = (order: Pick<Order, 'id'>, chargeToken: string) => `${order.id}:${chargeToken}`;

/** Mercado Pago wants local time with offset; Brasília has no daylight saving time since 2019. */
export function mpDate(ms: number): string {
  const local = new Date(ms - 3 * 3600_000).toISOString().replace('Z', '');
  return `${local}-03:00`;
}

interface MpPayment {
  id: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string } };
}

async function mpFetch<T>(env: Env, path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<{ status: number; body: T | null }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.idempotencyKey) headers['X-Idempotency-Key'] = init.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(`${apiBase(env)}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? null : JSON.stringify(init.body), signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new HttpError('unavailable', 'O Mercado Pago não respondeu agora. Tente de novo em instantes ou use a chave Pix.');
  }
  const text = await response.text();
  let body: T | null = null;
  try {
    body = text ? (JSON.parse(text) as T) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function readPayable(db: D1Database, token: string): Promise<{ order: Order; stamp: string }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError('not_found', 'Link de pagamento não encontrado.');
  const row = await withReadRetry(() => db.prepare('SELECT id, number, status, updated_at, data FROM orders WHERE pay_token = ?1').bind(token).first<OrderRow>());
  const order = row && toOrder(row);
  if (!row || !order?.charge || order.charge.token !== token) throw new HttpError('not_found', 'Este link de pagamento não vale mais. Peça um novo pelo WhatsApp.');
  return { order, stamp: row.updated_at };
}

const createSchema = z.object({ email: z.string().trim().toLowerCase().max(120).pipe(z.email('Confira o e-mail.')) });

/** POST /api/pay/:token/pix { email } — creates (or returns the still valid) automatic Pix of this charge. */
export async function handleCreateMpPix(ctx: Context): Promise<Response> {
  const env = ctx.env;
  if (!mpEnabled(env)) throw new HttpError('not_configured', 'O Pix automático não está disponível. Use a chave Pix e envie o comprovante.');
  const input = createSchema.safeParse(await readJson(ctx.request, 1024));
  if (!input.success) throw new HttpError('bad_request', 'Confira o e-mail.');
  const db = env.DB;
  const token = ctx.params.token ?? '';
  if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) throw new HttpError('not_configured', 'Não foi possível gerar o Pix agora.');
  const now = Date.now();
  const ip = await ipKey(env.PIN_PEPPER, ctx.request);
  const hit = (await hitStatement(db, `mp:create:${ip}`, CREATE_WINDOW_MS, now).first<{ count: number; window_start: number }>())!;
  if (hit.count > CREATES_PER_WINDOW) throw retryAfter(hit.window_start + CREATE_WINDOW_MS, now, 'Muitos Pix gerados por este aparelho.');

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const { order, stamp } = await readPayable(db, token);
    const charge = order.charge!;
    if (order.status === 'pago' || order.status === 'entregue') throw new HttpError('conflict', 'Este pedido já está pago. Obrigada!');
    if (order.status !== 'confirmado' || order.anonymized) throw new HttpError('conflict', 'Este link de pagamento não vale mais. Peça um novo pelo WhatsApp.');
    // Still valid for at least 10 more minutes: show the same Pix (one payment per charge, not one per tap).
    if (charge.mp && Date.parse(charge.mp.expiresAt) - now > 10 * 60_000) return json({ mp: { qr: charge.mp.qr, expiresAt: charge.mp.expiresAt } });

    const seq = (charge.mp?.seq ?? 0) + 1;
    if (seq > 50) throw new HttpError('conflict', 'Use a chave Pix e envie o comprovante.');
    const expiresMs = now + PIX_HOURS * 3600_000;
    const created = await mpFetch<MpPayment>(env, '/v1/payments', {
      method: 'POST',
      // Same charge and attempt number → Mercado Pago returns the same payment (double taps, retries).
      idempotencyKey: `eka-${charge.token}-${seq}`,
      body: {
        transaction_amount: charge.amountCents / 100,
        description: `Pedido ${order.number} · ÉKA Semijoias`,
        payment_method_id: 'pix',
        payer: { email: input.data.email },
        external_reference: externalReference(order, charge.token),
        // source_news=webhooks: only signed Webhooks notices (not the legacy unsigned IPN format).
        notification_url: `${ctx.url.origin}/api/webhooks/mercadopago?source_news=webhooks`,
        date_of_expiration: mpDate(expiresMs),
      },
    });
    const qr = created.body?.point_of_interaction?.transaction_data?.qr_code;
    if (created.status >= 400 || !created.body?.id || !qr) {
      console.log(JSON.stringify({ event: 'mp_create_failed', status: created.status, order: order.number }));
      if (created.status === 400) throw new HttpError('bad_request', 'O Mercado Pago não aceitou gerar este Pix. Confira o e-mail ou use a chave Pix e envie o comprovante.');
      throw new HttpError('unavailable', 'Não foi possível gerar o Pix automático agora. Tente de novo ou use a chave Pix.');
    }
    const mp: MpPix = { id: String(created.body.id), qr, expiresAt: new Date(expiresMs).toISOString(), seq };
    const at = nextStamp(stamp);
    const next: Order = { ...order, updatedAt: at, charge: { ...charge, mp } };
    try {
      await db.batch([
        unchanged(db, order.id, stamp),
        db.prepare('UPDATE orders SET data = ?2, updated_at = ?3 WHERE id = ?1').bind(order.id, toData(next), at),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'order.mp_pix', `Pix automático gerado no pedido ${order.number}`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue; // someone else wrote (maybe the same Pix): re-read
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(env));
    return json({ mp: { qr: mp.qr, expiresAt: mp.expiresAt } });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

/**
 * Cancels a pending automatic Pix at Mercado Pago (best effort, in waitUntil): called when its charge
 * is replaced or dropped, so the customer cannot pay a code that no longer settles the order. If
 * it was paid meanwhile, settlePayment records it as a stray payment for the owner.
 */
export async function cancelMpPix(env: Env, paymentId: string | undefined): Promise<void> {
  if (!paymentId || !mpEnabled(env)) return;
  try {
    const r = await mpFetch<MpPayment>(env, `/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'PUT', body: { status: 'cancelled' } });
    console.log(JSON.stringify({ event: 'mp_cancel', status: r.status }));
  } catch {
    console.log(JSON.stringify({ event: 'mp_cancel_failed' }));
  }
}

/**
 * Fetches a payment from Mercado Pago and, when it proves this order's charge was paid in full,
 * moves the order from "confirmado" to "pago". Returns what happened (never trusts the caller).
 */
export async function settlePayment(ctx: Context, paymentId: string): Promise<'paid' | 'already' | 'pending' | 'ignored'> {
  const env = ctx.env;
  const db = env.DB;
  const fetched = await mpFetch<MpPayment>(env, `/v1/payments/${encodeURIComponent(paymentId)}`);
  if (fetched.status === 404) return 'ignored';
  if (fetched.status >= 400 || !fetched.body) throw new HttpError('unavailable', 'O Mercado Pago não respondeu agora.');
  const payment = fetched.body;
  const ref = /^(ord_[A-Za-z0-9_-]{1,40}):([A-Za-z0-9_-]{20,64})$/.exec(payment.external_reference ?? '');
  if (!ref) return 'ignored';
  const [, orderId, chargeToken] = ref;
  if (payment.status !== 'approved') return 'pending';

  const paidCents = Math.round((payment.transaction_amount ?? 0) * 100);
  const paymentKey = String(payment.id);
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const row = await withReadRetry(() => db.prepare('SELECT id, number, status, updated_at, data FROM orders WHERE id = ?1').bind(orderId).first<OrderRow>());
    if (!row) return 'ignored';
    const order = toOrder(row);
    const charge = order.charge;
    const paid = order.status === 'pago' || order.status === 'entregue';
    // The payment that settled the order (or one already recorded) comes back: nothing to do.
    if ((paid && charge?.mp?.id === paymentKey && charge.paidBy === 'mercadopago') || order.strayPayments?.some((p) => p.id === paymentKey)) return 'already';
    // It settles the order only when it is for the current charge, for exactly its amount, in reais,
    // and the order is waiting for payment.
    const matches = !!charge && charge.token === chargeToken && paidCents === charge.amountCents && (!payment.currency_id || payment.currency_id === 'BRL');
    const at = nextStamp(row.updated_at);
    let next: Order;
    let outcome: 'paid' | 'stray';
    if (matches && order.status === 'confirmado' && !order.anonymized) {
      next = { ...order, status: 'pago', updatedAt: at, charge: { ...charge!, paidBy: 'mercadopago' }, history: [...order.history, { at, status: 'pago' as const }].slice(-200) };
      outcome = 'paid';
    } else {
      // Money arrived that cannot settle this order: keep it on the order for the owner to decide.
      console.log(JSON.stringify({ event: 'mp_stray', order: order.number, paidCents, charged: charge?.amountCents ?? null, sameCharge: charge?.token === chargeToken, status: order.status }));
      next = { ...order, updatedAt: at, strayPayments: [...(order.strayPayments ?? []), { id: paymentKey, amountCents: paidCents, at }].slice(-10) };
      outcome = 'stray';
    }
    try {
      await db.batch([
        unchanged(db, order.id, row.updated_at),
        outcome === 'paid'
          ? db.prepare(`UPDATE orders SET status = 'pago', updated_at = ?2, data = ?3 WHERE id = ?1 AND status = 'confirmado'`).bind(order.id, at, toData(next))
          : db.prepare('UPDATE orders SET updated_at = ?2, data = ?3 WHERE id = ?1').bind(order.id, at, toData(next)),
        db
          .prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)')
          .bind(at, outcome === 'paid' ? 'order.mp_paid' : 'order.mp_stray', `Pedido ${order.number}: Pix ${paymentKey} ${outcome === 'paid' ? 'aprovado pelo Mercado Pago' : `de ${paidCents} centavos recebido fora da cobrança atual`}`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyOrders(env));
    ctx.waitUntil(notifyOwner(env, ctx.url.origin, outcome === 'paid' ? paidNotice(order.number, charge!.amountCents) : strayNotice(order.number, paidCents)));
    return outcome === 'paid' ? 'paid' : 'ignored';
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo.');
}

/** POST /api/pay/:token/pix/check — "Já paguei": asks Mercado Pago now instead of waiting for the webhook. */
export async function handleCheckMpPix(ctx: Context): Promise<Response> {
  const env = ctx.env;
  if (!mpEnabled(env)) throw new HttpError('not_configured', 'O Pix automático não está disponível.');
  if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) throw new HttpError('not_configured');
  const now = Date.now();
  const ip = await ipKey(env.PIN_PEPPER, ctx.request);
  const hit = (await hitStatement(env.DB, `mp:check:${ip}`, CREATE_WINDOW_MS, now).first<{ count: number; window_start: number }>())!;
  if (hit.count > CHECKS_PER_WINDOW) throw retryAfter(hit.window_start + CREATE_WINDOW_MS, now, 'Muitas consultas deste aparelho.');
  const { order } = await readPayable(env.DB, ctx.params.token ?? '');
  if (order.status === 'pago' || order.status === 'entregue') return json({ state: 'pago' });
  if (!order.charge?.mp) return json({ state: 'aguardando' });
  const outcome = await settlePayment(ctx, order.charge.mp.id);
  return json({ state: outcome === 'paid' || outcome === 'already' ? 'pago' : 'aguardando' });
}

/**
 * Verifies Mercado Pago's `x-signature` header: HMAC-SHA256 (hex) of
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" with the webhook secret.
 */
export async function validSignature(secret: string, header: string | null, requestId: string | null, dataId: string, now = Date.now()): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k?.trim() ?? '', v.join('=').trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^\d{9,14}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  if (Math.abs(now - tsMs) > SIGNATURE_TOLERANCE_MS) return false;
  let manifest = `id:${dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return safeEqual(await hmacHex(secret, manifest), v1.toLowerCase());
}

/** POST /api/webhooks/mercadopago — payment notices. Always answers fast; the payment is fetched from the API. */
export async function handleMpWebhook(ctx: Context): Promise<Response> {
  const env = ctx.env;
  if (!mpEnabled(env)) throw new HttpError('not_found');
  await readBody(ctx.request, 16 * 1024).catch(() => new Uint8Array());
  const params = ctx.url.searchParams;
  const rawId = params.get('data.id') ?? params.get('id') ?? '';
  // Mercado Pago signs the lowercased id when it is alphanumeric.
  const dataId = /^[A-Za-z0-9]+$/.test(rawId) ? rawId.toLowerCase() : rawId;
  const type = params.get('type') ?? params.get('topic') ?? '';
  if (!(await validSignature(env.MP_WEBHOOK_SECRET!, ctx.request.headers.get('x-signature'), ctx.request.headers.get('x-request-id'), dataId))) {
    console.log(JSON.stringify({ event: 'mp_webhook_rejected' }));
    throw new HttpError('unauthenticated', 'Assinatura inválida.');
  }
  if (type !== 'payment' || !/^\d{1,20}$/.test(dataId)) return json({ ok: true, ignored: true });
  const outcome = await settlePayment(ctx, dataId);
  console.log(JSON.stringify({ event: 'mp_webhook', outcome }));
  return json({ ok: true, outcome });
}
