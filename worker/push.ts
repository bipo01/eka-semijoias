import { z } from 'zod';
import { formatBRL } from '../src/lib/format';
import { requireSession } from './auth';
import { sha256Hex } from './crypto';
import { toHttpError, withReadRetry } from './db';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import type { Context } from './router';
import { b64urlToBytes, encryptPayload, isPushEndpoint, parseVapidJwk, vapidAuthorization, vapidPublicKey, type VapidJwk } from './webpush';

/*
 * Notices on the owner's phone (Web Push). She turns them on in Painel →
 * Configurações; each device's subscription is stored here. A new order, a
 * receipt or an automatic Pix payment sends `{ title, body, url, tag }` to
 * every device (public/sw.js shows it). Only the order number and the amount
 * travel: never the customer's name. Dead subscriptions (404/410) are erased.
 * Without the VAPID_PRIVATE_KEY secret the feature stays hidden.
 */

const MAX_DEVICES = 10;

export interface PushNotice {
  title: string;
  body: string;
  /** Page the notice opens (same origin). */
  url: string;
  /** Replaces an earlier notice with the same tag on the device. */
  tag?: string;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const authCache = new Map<string, { value: string; until: number }>();

/** The VAPID header for a push service, signed once every few hours (ECDSA costs CPU on every request otherwise). */
async function authorizationFor(jwk: VapidJwk, endpoint: string, subject: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const cacheKey = `${jwk.x}|${audience}|${subject}`;
  const cached = authCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.value;
  const value = await vapidAuthorization(jwk, audience, subject);
  authCache.set(cacheKey, { value, until: Date.now() + 6 * 3600_000 });
  return value;
}

type Outcome = 'sent' | 'gone' | 'failed';

async function deliver(jwk: VapidJwk, subject: string, sub: SubscriptionRow, payload: Uint8Array, notice: PushNotice): Promise<{ outcome: Outcome; status: number | string }> {
  let body: Uint8Array;
  try {
    body = await encryptPayload(payload, b64urlToBytes(sub.p256dh), b64urlToBytes(sub.auth));
  } catch {
    return { outcome: 'failed', status: 'chave' }; // a broken subscription key, not the network
  }
  try {
    const headers: Record<string, string> = {
      TTL: String(24 * 3600),
      Urgency: 'high',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: await authorizationFor(jwk, sub.endpoint, subject),
    };
    // Topic: a newer notice with the same topic replaces one still waiting in the push service.
    if (notice.tag && /^[A-Za-z0-9_-]{1,32}$/.test(notice.tag)) headers.Topic = notice.tag;
    const response = await fetch(sub.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    if (response.status === 404 || response.status === 410) return { outcome: 'gone', status: response.status };
    return { outcome: response.ok ? 'sent' : 'failed', status: response.status };
  } catch {
    return { outcome: 'failed', status: 0 };
  }
}

/**
 * Sends a notice to every device of the owner. Never throws (runs in waitUntil after the answer).
 * `origin` is the site's own https origin (the VAPID contact).
 */
export async function notifyOwner(env: Env, origin: string, notice: PushNotice): Promise<{ sent: number; removed: number; failed: number }> {
  const result = { sent: 0, removed: 0, failed: 0 };
  const jwk = parseVapidJwk(env.VAPID_PRIVATE_KEY);
  if (!jwk) return result;
  try {
    const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions').all<SubscriptionRow>();
    if (!results.length) return result;
    const payload = new TextEncoder().encode(JSON.stringify({ title: notice.title, body: notice.body, url: notice.url, ...(notice.tag ? { tag: notice.tag } : {}) }));
    const outcomes = await Promise.all(results.map((sub) => deliver(jwk, origin, sub, payload, notice)));
    const at = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    outcomes.forEach(({ outcome, status }, i) => {
      const sub = results[i]!;
      result[outcome === 'gone' ? 'removed' : outcome]++;
      if (outcome === 'gone') statements.push(env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?1').bind(sub.id));
      else if (outcome === 'sent') statements.push(env.DB.prepare('UPDATE push_subscriptions SET last_used_at = ?2, last_error = NULL WHERE id = ?1').bind(sub.id, at));
      else statements.push(env.DB.prepare('UPDATE push_subscriptions SET last_error = ?2 WHERE id = ?1').bind(sub.id, `${at} ${status || 'rede'}`));
    });
    if (statements.length) await env.DB.batch(statements);
    console.log(JSON.stringify({ event: 'push', ...result }));
  } catch (error) {
    console.log(JSON.stringify({ event: 'push_error', message: error instanceof Error ? error.message : String(error) }));
  }
  return result;
}

/** Notice for a new order from the site (number and amount only). */
export const orderNotice = (number: number, totalCents: number, units: number): PushNotice => ({
  title: `Novo pedido nº ${number}`,
  body: `${formatBRL(totalCents)} · ${units} ${units === 1 ? 'peça' : 'peças'}. Toque para ver no painel.`,
  url: `/admin/pedidos?pedido=${number}`,
  tag: `pedido-${number}`,
});

export const receiptNotice = (number: number, amountCents: number): PushNotice => ({
  title: `Comprovante do pedido nº ${number}`,
  body: `Pix de ${formatBRL(amountCents)}. Confira o valor e marque como pago.`,
  url: `/admin/pedidos?pedido=${number}`,
  tag: `pedido-${number}`,
});

export const paidNotice = (number: number, amountCents: number): PushNotice => ({
  title: `Pix recebido · pedido nº ${number}`,
  body: `${formatBRL(amountCents)} confirmado pelo Mercado Pago. O pedido já está como pago.`,
  url: `/admin/pedidos?pedido=${number}`,
  tag: `pedido-${number}`,
});

export const strayNotice = (number: number, amountCents: number): PushNotice => ({
  title: `Pix a conferir · pedido nº ${number}`,
  body: `Chegou ${formatBRL(amountCents)} pelo Mercado Pago, mas não bate com a cobrança atual. Confira no painel.`,
  url: `/admin/pedidos?pedido=${number}`,
  tag: `pedido-${number}`,
});

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

const deviceId = async (endpoint: string) => (await sha256Hex(endpoint)).slice(0, 24);

/** GET /api/admin/push — whether notices are available, the key to subscribe with and the devices. */
export async function handlePushStatus(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const jwk = parseVapidJwk(ctx.env.VAPID_PRIVATE_KEY);
  if (ctx.env.VAPID_PRIVATE_KEY && !jwk) console.log(JSON.stringify({ event: 'push_misconfigured', message: 'VAPID_PRIVATE_KEY is not a P-256 private JWK' }));
  const { results } = await withReadRetry(() =>
    ctx.env.DB.prepare('SELECT id, label, created_at, last_used_at, last_error FROM push_subscriptions ORDER BY created_at').all<{ id: string; label: string; created_at: string; last_used_at: string | null; last_error: string | null }>(),
  );
  return json({
    available: !!jwk,
    publicKey: jwk ? vapidPublicKey(jwk) : null,
    devices: results.map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at, lastError: r.last_error })),
  });
}

const b64url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/);
const subscribeSchema = z.object({
  endpoint: z.string().min(10).max(1000),
  keys: z.object({ p256dh: b64url.max(120), auth: b64url.max(40) }),
  label: z.string().max(60).optional(),
});

/** POST /api/admin/push/subscribe { endpoint, keys, label } — stores (or refreshes) this device. */
export async function handlePushSubscribe(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  if (!parseVapidJwk(ctx.env.VAPID_PRIVATE_KEY)) throw new HttpError('not_configured', 'Os avisos no celular ainda não foram ligados no servidor.');
  const input = subscribeSchema.safeParse(await readJson(ctx.request, 4096));
  const devEndpoint = (e: string) => !!ctx.env.DEV_PUSH_ORIGIN && ctx.env.DEV_INSECURE_COOKIES === '1' && e.startsWith(`${ctx.env.DEV_PUSH_ORIGIN}/`);
  if (!input.success || !(isPushEndpoint(input.data.endpoint) || devEndpoint(input.data.endpoint))) throw new HttpError('bad_request', 'Este navegador enviou uma assinatura de avisos inválida.');
  const { endpoint, keys } = input.data;
  let p256dh: Uint8Array;
  let auth: Uint8Array;
  try {
    p256dh = b64urlToBytes(keys.p256dh);
    auth = b64urlToBytes(keys.auth);
  } catch {
    throw new HttpError('bad_request', 'Este navegador enviou uma assinatura de avisos inválida.');
  }
  if (p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) throw new HttpError('bad_request', 'Este navegador enviou uma assinatura de avisos inválida.');
  const id = await deviceId(endpoint);
  const label = (input.data.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const at = new Date().toISOString();
  const db = ctx.env.DB;
  try {
    const results = await db.batch<{ id?: string }>([
      // Refuse a new device past the cap (an existing one always refreshes its keys).
      db
        .prepare(
          `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, label, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM push_subscriptions WHERE id = ?1) OR (SELECT COUNT(*) FROM push_subscriptions) < ?7
           ON CONFLICT (id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, label = CASE WHEN excluded.label = '' THEN label ELSE excluded.label END, last_error = NULL
           RETURNING id`,
        )
        .bind(id, endpoint, keys.p256dh, keys.auth, label, at, MAX_DEVICES),
    ]);
    if (!results[0]?.results.length) throw new HttpError('conflict', `Já há ${MAX_DEVICES} aparelhos com avisos. Remova um da lista antes.`);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw toHttpError(error);
  }
  return json({ id });
}

/** DELETE /api/admin/push/:id — stops the notices on one device. Idempotent. */
export async function handlePushDelete(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const id = ctx.params.id ?? '';
  if (!/^[0-9a-f]{24}$/.test(id)) throw new HttpError('not_found');
  await ctx.env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?1').bind(id).run();
  return json({ deleted: true });
}

/** POST /api/admin/push/test — sends a test notice to every device and reports what happened. */
export async function handlePushTest(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  if (!parseVapidJwk(ctx.env.VAPID_PRIVATE_KEY)) throw new HttpError('not_configured', 'Os avisos no celular ainda não foram ligados no servidor.');
  const result = await notifyOwner(ctx.env, ctx.url.origin, { title: 'Avisos do Painel ÉKA', body: 'Tudo certo: os avisos de pedidos e comprovantes chegam neste aparelho.', url: '/admin/configuracoes?aba=avisos', tag: 'teste' });
  return json(result);
}
