import { z } from 'zod';
import { formatBRL } from '../src/lib/format';
import { findVariant, galleryFor } from '../src/data/catalog';
import type { Catalog } from '../src/data/schema';
import {
  commissionFor,
  earnings,
  kitState,
  kitValueCents,
  resellerSaleSchema,
  saleRequestSchema,
  salesTotalCents,
  type Kit,
  type Reseller,
  type ResellerSale,
} from '../src/data/revenda';
import { hit, ipKey, readCookie, retryAfter } from './auth';
import { IDEMPOTENCY_TTL_MS, parseSnapshotBody, WRITE_ATTEMPTS } from './catalog';
import { randomBytes, randomToken, safeEqual, sha256Hex, toHex } from './crypto';
import { guard, isGuardMiss, toHttpError, withReadRetry } from './db';
import type { Env } from './env';
import { HttpError, json, readJson, zodDetails } from './http';
import { notifyLeads } from './live';
import { notifyOwner } from './push';
import type { Context } from './router';
import {
  hashResellerPin,
  KIT_COLUMNS,
  kitUnchanged,
  nextStamp,
  parseProgram,
  programStatement,
  publicSelf,
  RESELLER_COLUMNS,
  resellerUnchanged,
  resellerPinProblem,
  toKit,
  toReseller,
  toSale,
  type KitRow,
  type ResellerRow,
  type SaleRow,
} from './revendaCore';

/*
 * The reseller's side (docs/revenda/PLAN.md §3, §5): first access (contract +
 * PIN), login, her panel data, her sales, and the public showcase. Every
 * query is scoped to the reseller of the session, never to an id the browser sends.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SESSION_MS = 30 * DAY;
const LOGIN_IP_WINDOW = 15 * MINUTE;
const LOGIN_IP_MAX = 5;
const LOGIN_RESELLER_MAX = 10;
const LOGIN_GLOBAL_MAX = 300;
const CANCEL_WINDOW_MS = DAY;

const cookieName = (env: Env) => (env.DEV_INSECURE_COOKIES === '1' ? 'eka_revenda' : '__Host-eka_revenda');
function sessionCookie(env: Env, token: string, maxAgeS: number): string {
  const secure = env.DEV_INSECURE_COOKIES === '1' ? '' : '; Secure';
  return `${cookieName(env)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}${secure}`;
}

function pepper(env: Env): string {
  if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) throw new HttpError('not_configured');
  return env.PIN_PEPPER;
}

async function sessionStatements(db: D1Database, resellerId: string, now: number) {
  const token = randomToken();
  return {
    token,
    statements: [
      db.prepare('INSERT INTO reseller_sessions (token_hash, reseller_id, created_at, expires_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?3)').bind(await sha256Hex(token), resellerId, now, now + SESSION_MS),
      db.prepare('DELETE FROM reseller_sessions WHERE expires_at <= ?1').bind(now),
    ],
  };
}

/** The active reseller of this request's session (sessions of a paused/ended reseller are deleted, but check anyway). */
async function requireReseller(ctx: Context): Promise<{ reseller: Reseller; stamp: string }> {
  const token = readCookie(ctx.request, cookieName(ctx.env));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError('unauthenticated');
  const now = Date.now();
  const tokenHash = await sha256Hex(token);
  const row = await withReadRetry(() =>
    ctx.env.DB.prepare(`SELECT r.id, r.slug, r.whatsapp, r.status, r.updated_at, r.data, s.last_seen_at FROM reseller_sessions s JOIN resellers r ON r.id = s.reseller_id WHERE s.token_hash = ?1 AND s.expires_at > ?2`)
      .bind(tokenHash, now)
      .first<ResellerRow & { last_seen_at: number }>(),
  );
  if (!row || row.status !== 'ativa') throw new HttpError('unauthenticated');
  if (now - row.last_seen_at > HOUR) {
    ctx.waitUntil(
      ctx.env.DB.batch([
        ctx.env.DB.prepare('UPDATE reseller_sessions SET last_seen_at = ?2 WHERE token_hash = ?1').bind(tokenHash, now),
        ctx.env.DB.prepare(`UPDATE resellers SET data = json_set(data, '$.lastSeenAt', ?2) WHERE id = ?1`).bind(row.id, new Date(now).toISOString()),
      ]).catch(() => undefined),
    );
  }
  return { reseller: toReseller(row), stamp: row.updated_at };
}

// ---------------------------------------------------------------------------
// First access: contract + PIN
// ---------------------------------------------------------------------------

async function readInvite(db: D1Database, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError('not_found', 'Este link de acesso não vale mais. Peça um novo para a ÉKA.');
  const tokenHash = await sha256Hex(token);
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare(`SELECT i.reseller_id, i.expires_at, i.used_at, r.id, r.slug, r.whatsapp, r.status, r.updated_at, r.data FROM reseller_invites i JOIN resellers r ON r.id = i.reseller_id WHERE i.token_hash = ?1`).bind(tokenHash),
      programStatement(db),
    ]),
  );
  const row = results[0]?.results[0] as (ResellerRow & { expires_at: number; used_at: number | null }) | undefined;
  if (!row || row.used_at || row.expires_at <= Date.now() || row.status !== 'ativa') throw new HttpError('not_found', 'Este link de acesso não vale mais. Peça um novo para a ÉKA.');
  return { reseller: toReseller(row), stamp: row.updated_at, program: parseProgram(results[1]?.results[0] as { data?: string } | undefined) };
}

/** GET /api/revenda/invite/:token — what the first-access page shows. */
export async function handleGetInvite(ctx: Context): Promise<Response> {
  const { reseller, program } = await readInvite(ctx.env.DB, ctx.params.token ?? '');
  const c = program.contract;
  const accepted = reseller.contract && reseller.contract.version >= c.version && reseller.contract.mode === c.mode;
  return json(
    {
      firstName: reseller.name.split(/\s+/)[0],
      name: reseller.name,
      hasPin: reseller.hasPin,
      contract: accepted ? null : { mode: c.mode, title: c.title, version: c.version, ...(c.mode === 'aceite' ? { text: c.text } : { url: reseller.contractUrl ?? c.url }) },
    },
    { headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } },
  );
}

const normalize = (v: string) => v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const acceptSchema = z.object({
  pin: z.string(),
  contract: z.object({ version: z.number().int(), typedName: z.string().max(120).optional(), signedExternal: z.literal(true).optional() }).optional(),
});

/** POST /api/revenda/invite/:token { pin, contract? } — accepts the contract (when due), sets the PIN and logs in. */
export async function handleAcceptInvite(ctx: Context): Promise<Response> {
  const env = ctx.env;
  const db = env.DB;
  const pep = pepper(env);
  const now = Date.now();
  const ip = await ipKey(pep, ctx.request);
  const throttle = await hit(db, `rinvite:ip:${ip}`, LOGIN_IP_WINDOW, now);
  if (throttle.count > 20) throw retryAfter(throttle.window_start + LOGIN_IP_WINDOW, now, 'Muitas tentativas deste aparelho.');
  const input = acceptSchema.safeParse(await readJson(ctx.request, 4096));
  if (!input.success) throw new HttpError('bad_request', 'Dados inválidos.', zodDetails(input.error.issues));
  const token = ctx.params.token ?? '';
  const { reseller, stamp, program } = await readInvite(db, token);
  const problem = resellerPinProblem(input.data.pin);
  if (problem) throw new HttpError('bad_request', problem, [{ path: 'pin', message: problem }]);

  const c = program.contract;
  const due = !(reseller.contract && reseller.contract.version >= c.version && reseller.contract.mode === c.mode);
  const at = nextStamp(stamp);
  const statements: D1PreparedStatement[] = [];
  const next: Reseller = { ...reseller, hasPin: true, updatedAt: at };
  if (due) {
    const accept = input.data.contract;
    if (!accept || accept.version !== c.version) throw new HttpError('conflict', 'O contrato foi atualizado. Leia a versão nova e aceite de novo.');
    let typedName = '';
    if (c.mode === 'aceite') {
      typedName = (accept.typedName ?? '').replace(/\s+/g, ' ').trim();
      const first = normalize(reseller.name).split(' ')[0] ?? '';
      if (typedName.split(' ').length < 2 || !normalize(typedName).includes(first)) throw new HttpError('bad_request', 'Digite seu nome completo, como no cadastro, para aceitar o contrato.', [{ path: 'typedName', message: 'Nome completo' }]);
    } else if (!accept.signedExternal) {
      throw new HttpError('bad_request', 'Assine o contrato no link e confirme.');
    }
    const textHash = await sha256Hex(c.mode === 'aceite' ? `${c.title}\n${c.text}` : (reseller.contractUrl ?? c.url ?? ''));
    next.contract = { acceptedAt: at, version: c.version, mode: c.mode };
    statements.push(
      // The exact text of every accepted version is kept, so the hash can always be checked later.
      db
        .prepare('INSERT OR IGNORE INTO contract_versions (version, title, mode, body, sha256, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(c.version, c.title, c.mode, c.mode === 'aceite' ? c.text : (reseller.contractUrl ?? c.url ?? ''), textHash, at),
      db
        .prepare('INSERT INTO contract_acceptances (id, reseller_id, accepted_at, version, text_sha256, typed_name, ip_hash, user_agent, mode) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
        .bind(`acc_${randomToken().slice(0, 16)}`, reseller.id, at, c.version, textHash, typedName || reseller.name, ip, (ctx.request.headers.get('User-Agent') ?? '').slice(0, 300), c.mode),
    );
  }
  const salt = toHex(randomBytes(16));
  const session = await sessionStatements(db, reseller.id, now);
  try {
    await db.batch([
      // The link works once: a concurrent second use aborts the whole batch here.
      guard(db, '(SELECT used_at FROM reseller_invites WHERE token_hash = ?1) IS NULL', await sha256Hex(token)),
      // The reseller row is rewritten from what was read: an admin edit meanwhile is never lost.
      resellerUnchanged(db, reseller.id, stamp),
      db.prepare('UPDATE reseller_invites SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL').bind(await sha256Hex(token), now),
      ...statements,
      db
        .prepare(
          `INSERT INTO reseller_credentials (reseller_id, pin_hash, salt, updated_at) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT (reseller_id) DO UPDATE SET pin_hash = excluded.pin_hash, salt = excluded.salt, updated_at = excluded.updated_at`,
        )
        .bind(reseller.id, await hashResellerPin(pep, salt, input.data.pin), salt, at),
      // A new PIN ends the other sessions.
      db.prepare('DELETE FROM reseller_sessions WHERE reseller_id = ?1').bind(reseller.id),
      ...session.statements,
      db.prepare('UPDATE resellers SET updated_at = ?2, data = ?3 WHERE id = ?1').bind(reseller.id, at, JSON.stringify(next)),
      db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'reseller.access', `Primeiro acesso de ${reseller.id}${due ? ` (contrato v${c.version})` : ''}`),
    ]);
  } catch (error) {
    if (isGuardMiss(error)) {
      const fresh = await readInvite(db, token).catch(() => null);
      if (!fresh) throw new HttpError('not_found', 'Este link de acesso não vale mais. Peça um novo para a ÉKA.');
      throw new HttpError('conflict', 'Seus dados foram atualizados pela ÉKA neste instante. Toque em continuar de novo.');
    }
    throw toHttpError(error);
  }
  if (due) ctx.waitUntil(notifyOwner(env, ctx.url.origin, { title: 'Contrato de revendedora aceito', body: `${reseller.name.split(/\s+/)[0]} aceitou o contrato e já pode usar o painel.`, url: '/admin/revendedoras', tag: `rev-${reseller.id}` }));
  ctx.waitUntil(notifyLeads(env));
  return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(env, session.token, SESSION_MS / 1000) } });
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

const loginSchema = z.object({ whatsapp: z.string().transform((v) => v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')), pin: z.string().regex(/^\d{6}$/) });

/** POST /api/revenda/login { whatsapp, pin } */
export async function handleResellerLogin(ctx: Context): Promise<Response> {
  const env = ctx.env;
  const db = env.DB;
  const pep = pepper(env);
  const now = Date.now();
  const ip = await ipKey(pep, ctx.request);
  // Counted before checking, so guessing is slow whatever the answer.
  const byIp = await hit(db, `rlogin:ip:${ip}`, LOGIN_IP_WINDOW, now);
  if (byIp.count > LOGIN_IP_MAX) throw retryAfter(byIp.window_start + LOGIN_IP_WINDOW, now, 'Muitas tentativas deste aparelho.');
  const input = loginSchema.safeParse(await readJson(ctx.request, 1024));
  if (!input.success) throw new HttpError('invalid_pin', 'WhatsApp ou PIN incorretos.');
  // Per number (registered or not, so the limit does not reveal who is a reseller) and overall.
  const byNumber = await hit(db, `rlogin:n:${input.data.whatsapp}`, HOUR, now);
  if (byNumber.count > LOGIN_RESELLER_MAX) throw retryAfter(byNumber.window_start + HOUR, now, 'Muitas tentativas deste aparelho.');
  const global = await hit(db, 'rlogin:global', HOUR, now);
  if (global.count > LOGIN_GLOBAL_MAX) throw retryAfter(global.window_start + HOUR, now, 'Muitas tentativas agora.');
  const row = await withReadRetry(() =>
    db.prepare(`SELECT r.id, r.status, c.pin_hash, c.salt FROM resellers r LEFT JOIN reseller_credentials c ON c.reseller_id = r.id WHERE r.whatsapp = ?1`).bind(input.data.whatsapp).first<{ id: string; status: string; pin_hash: string | null; salt: string | null }>(),
  );
  // Same work whether or not the number exists (no timing hint).
  const computed = await hashResellerPin(pep, row?.salt ?? 'no-reseller', input.data.pin);
  const ok = !!row?.pin_hash && safeEqual(computed, row.pin_hash);
  if (!row || !ok) throw new HttpError('invalid_pin', 'WhatsApp ou PIN incorretos.', { attemptsLeft: Math.max(0, LOGIN_IP_MAX - byIp.count) });
  if (row.status !== 'ativa') throw new HttpError('unauthenticated', 'Seu acesso está pausado. Fale com a ÉKA.');
  const session = await sessionStatements(db, row.id, now);
  // Only this reseller's own counter resets: the network counter keeps running, so logging into
  // one's own account cannot buy more guesses at someone else's.
  await db.batch([...session.statements, db.prepare('DELETE FROM throttle WHERE key = ?1').bind(`rlogin:n:${input.data.whatsapp}`)]);
  return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(env, session.token, SESSION_MS / 1000) } });
}

/** POST /api/revenda/logout */
export async function handleResellerLogout(ctx: Context): Promise<Response> {
  const token = readCookie(ctx.request, cookieName(ctx.env));
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) await ctx.env.DB.prepare('DELETE FROM reseller_sessions WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
  return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(ctx.env, '', 0) } });
}

/** The first photo of a piece in a finish (the finish's own photos first). */
function photoOf(catalog: Catalog, productId: string, variantId: string) {
  const product = catalog.products.find((p) => p.id === productId);
  if (!product) return undefined;
  const variant = findVariant(product, variantId);
  return (variant ? galleryFor(product, variant).images[0] : undefined) ?? product.images[0];
}

// ---------------------------------------------------------------------------
// Her panel
// ---------------------------------------------------------------------------

/** GET /api/revenda/me — everything her panel shows, in one round trip. */
export async function handleResellerMe(ctx: Context): Promise<Response> {
  const { reseller } = await requireReseller(ctx);
  const db = ctx.env.DB;
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE reseller_id = ?1 ORDER BY opened_at DESC LIMIT 24`).bind(reseller.id),
      db.prepare(`SELECT id, status, data FROM reseller_sales WHERE kit_id = (SELECT id FROM kits WHERE reseller_id = ?1 AND status = 'aberta') ORDER BY created_at DESC`).bind(reseller.id),
      db.prepare(`SELECT COALESCE(SUM(json_extract(data, '$.settlement.commissionCents')), 0) AS received FROM kits WHERE reseller_id = ?1 AND status = 'fechada'`).bind(reseller.id),
      db.prepare('SELECT body FROM catalog_snapshot WHERE id = 1'),
    ]),
  );
  const kits = ((results[0]?.results ?? []) as unknown as KitRow[]).map(toKit);
  const open = kits.find((k) => k.status === 'aberta') ?? null;
  const sales = ((results[1]?.results ?? []) as unknown as SaleRow[]).map(toSale);
  const closed = kits.filter((k) => k.status === 'fechada' && k.settlement);
  const soldCents = salesTotalCents(sales);
  // Photos for her kit lines (the catalog snapshot is public anyway).
  const body = results[3]?.results[0]?.body as string | undefined;
  // Every closed cycle counts (the history list itself shows the latest 24).
  const received = Number((results[2]?.results[0] as { received?: number } | undefined)?.received ?? 0);
  const catalog = body ? parseSnapshotBody(body) : null;
  const images: Record<string, unknown> = {};
  for (const item of open?.items ?? []) {
    const image = catalog && photoOf(catalog, item.productId, item.variantId);
    if (image) images[`${item.productId}|${item.variantId}`] = image;
  }
  return json(
    {
      reseller: publicSelf(reseller),
      kit: open ? { ...open, lines: kitState(open, sales), valueCents: kitValueCents(open.items) } : null,
      sales,
      commission: open ? commissionFor(soldCents, open.tiers) : null,
      soldCents,
      earnings: earnings(open ? { soldCents, tiers: open.tiers } : null, [{ commissionCents: received }]),
      history: closed.map((k) => ({ id: k.id, openedAt: k.openedAt, closedAt: k.closedAt, settlement: k.settlement })),
      images,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** POST /api/revenda/sales (Idempotency-Key) — a sale from her open kit; never more than is available. */
export async function handleResellerSale(ctx: Context): Promise<Response> {
  const { reseller } = await requireReseller(ctx);
  const db = ctx.env.DB;
  const key = ctx.request.headers.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new HttpError('bad_request', 'Chave de envio inválida.');
  const raw = await readJson(ctx.request, 16 * 1024);
  const input = saleRequestSchema.safeParse(raw);
  if (!input.success) {
    const issue = input.error.issues[0];
    throw new HttpError('bad_request', issue?.message && !issue.message.startsWith('Invalid') ? issue.message : 'Confira a venda.', zodDetails(input.error.issues));
  }
  const idemKey = `rsale:${reseller.id}:${key}`;
  const requestHash = await sha256Hex(JSON.stringify(input.data));
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const results = await withReadRetry(() =>
      db.batch<Record<string, unknown>>([
        db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey),
        db.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE reseller_id = ?1 AND status = 'aberta'`).bind(reseller.id),
        db.prepare(`SELECT id, status, data FROM reseller_sales WHERE kit_id = (SELECT id FROM kits WHERE reseller_id = ?1 AND status = 'aberta')`).bind(reseller.id),
      ]),
    );
    const replay = results[0]?.results[0] as { request_hash: string; response: string } | undefined;
    if (replay) {
      if (replay.request_hash !== requestHash) throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outra venda.');
      return json(JSON.parse(replay.response), { status: 201 });
    }
    const kitRow = results[1]?.results[0] as KitRow | undefined;
    if (!kitRow) throw new HttpError('conflict', 'Você não tem uma maleta aberta agora. Fale com a ÉKA.');
    const kit: Kit = toKit(kitRow);
    const sales = ((results[2]?.results ?? []) as unknown as SaleRow[]).map(toSale);
    const lines = kitState(kit, sales);
    // Merge equal lines, then check each against what is still available in the kit.
    const merged = new Map<string, { productId: string; variantId: string; size: string; qty: number; unitCents: number }>();
    for (const l of input.data.lines) {
      const k = `${l.productId}|${l.variantId}|${l.size}|${l.unitCents}`;
      const m = merged.get(k);
      if (m) m.qty += l.qty;
      else merged.set(k, { ...l });
    }
    const need = new Map<string, number>();
    for (const l of merged.values()) need.set(`${l.productId}|${l.variantId}|${l.size}`, (need.get(`${l.productId}|${l.variantId}|${l.size}`) ?? 0) + l.qty);
    const saleLines: ResellerSale['lines'] = [];
    for (const l of merged.values()) {
      const line = lines.find((x) => x.productId === l.productId && x.variantId === l.variantId && x.size === l.size);
      if (!line) throw new HttpError('conflict', 'Uma das peças não está na sua maleta.');
      const wanted = need.get(`${l.productId}|${l.variantId}|${l.size}`)!;
      if (wanted > line.available) throw new HttpError('conflict', line.available ? `${line.name}: só ${line.available === 1 ? 'resta 1 unidade' : `restam ${line.available} unidades`} na maleta.` : `${line.name} já foi vendida. A tela foi atualizada.`, { available: line.available });
      saleLines.push({ productId: l.productId, variantId: l.variantId, size: l.size, qty: l.qty, unitCents: l.unitCents, name: line.name, finish: line.finish });
    }
    const at = nextStamp(kitRow.updated_at);
    const totalCents = saleLines.reduce((sum, l) => sum + l.qty * l.unitCents, 0);
    const customer = input.data.customer && (input.data.customer.name || input.data.customer.whatsapp) ? input.data.customer : undefined;
    const parsedSale = resellerSaleSchema.safeParse({
      id: `rsv_${randomToken().slice(0, 16)}`,
      resellerId: reseller.id,
      kitId: kit.id,
      createdAt: at,
      status: 'ativa',
      lines: saleLines,
      totalCents,
      ...(customer ? { customer } : {}),
      payment: input.data.payment,
      ...(input.data.note ? { note: input.data.note } : {}),
    });
    if (!parsedSale.success) throw new HttpError('bad_request', 'Confira as quantidades e os preços da venda.');
    const sale: ResellerSale = parsedSale.data;
    const response = { sale };
    const now = Date.now();
    try {
      await db.batch([
        // Two sales of the last unit at once: the kit stamp lets only one through.
        kitUnchanged(db, kit.id, kitRow.updated_at),
        db.prepare('UPDATE kits SET updated_at = ?2 WHERE id = ?1').bind(kit.id, at),
        db.prepare(`INSERT INTO reseller_sales (id, reseller_id, kit_id, created_at, status, total_cents, data) VALUES (?1, ?2, ?3, ?4, 'ativa', ?5, ?6)`).bind(sale.id, reseller.id, kit.id, at, totalCents, JSON.stringify(sale)),
        db.prepare('INSERT INTO idempotency (key, request_hash, created_at, response) VALUES (?1, ?2, ?3, ?4)').bind(idemKey, requestHash, now, JSON.stringify(response)),
        db.prepare('DELETE FROM idempotency WHERE created_at < ?1').bind(now - IDEMPOTENCY_TTL_MS),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      const message = error instanceof Error ? error.message : '';
      if (/UNIQUE constraint failed: idempotency/i.test(message)) {
        const stored = await db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey).first<{ request_hash: string; response: string }>();
        if (stored?.request_hash === requestHash) return json(JSON.parse(stored.response), { status: 201 });
      }
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyLeads(ctx.env));
    ctx.waitUntil(notifyOwner(ctx.env, ctx.url.origin, { title: `Venda de revendedora · ${reseller.name.split(/\s+/)[0]}`, body: `${formatBRL(totalCents)} · ${saleLines.reduce((n, l) => n + l.qty, 0)} ${saleLines.length === 1 && saleLines[0]!.qty === 1 ? 'peça' : 'peças'}.`, url: '/admin/revendedoras', tag: `rev-${reseller.id}` }));
    return json(response, { status: 201 });
  }
  throw new HttpError('unavailable', 'Muitas vendas ao mesmo tempo. Tente de novo.');
}

/** POST /api/revenda/sales/:id/cancel — her own sale, within 24 h, while the kit is open. */
export async function handleCancelResellerSale(ctx: Context): Promise<Response> {
  const { reseller } = await requireReseller(ctx);
  const db = ctx.env.DB;
  const id = ctx.params.id ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError('not_found', 'Venda não encontrada.');
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const results = await withReadRetry(() =>
      db.batch<Record<string, unknown>>([
        db.prepare('SELECT id, status, data FROM reseller_sales WHERE id = ?1 AND reseller_id = ?2').bind(id, reseller.id),
        db.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE reseller_id = ?1 AND status = 'aberta'`).bind(reseller.id),
      ]),
    );
    const saleRow = results[0]?.results[0] as SaleRow | undefined;
    if (!saleRow) throw new HttpError('not_found', 'Venda não encontrada.');
    const sale = toSale(saleRow);
    if (sale.status === 'cancelada') return json({ sale });
    const kitRow = results[1]?.results[0] as KitRow | undefined;
    if (!kitRow || kitRow.id !== sale.kitId) throw new HttpError('conflict', 'Esta maleta já foi acertada. Fale com a ÉKA para corrigir.');
    if (Date.now() - Date.parse(sale.createdAt) > CANCEL_WINDOW_MS) throw new HttpError('conflict', 'Só dá para desfazer uma venda nas primeiras 24 horas. Fale com a ÉKA.');
    const at = nextStamp(kitRow.updated_at);
    const next: ResellerSale = { ...sale, status: 'cancelada', cancelledAt: at };
    try {
      await db.batch([
        kitUnchanged(db, kitRow.id, kitRow.updated_at),
        db.prepare('UPDATE kits SET updated_at = ?2 WHERE id = ?1').bind(kitRow.id, at),
        db.prepare(`UPDATE reseller_sales SET status = 'cancelada', data = ?2 WHERE id = ?1 AND status = 'ativa'`).bind(id, JSON.stringify(next)),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyLeads(ctx.env));
    return json({ sale: next });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

// ---------------------------------------------------------------------------
// Public showcase
// ---------------------------------------------------------------------------

/** GET /api/r/:slug — the pieces available in her kit; only her first name and (if she allows) her WhatsApp. */
export async function handleShowcase(ctx: Context): Promise<Response> {
  const slug = (ctx.params.slug ?? '').toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new HttpError('not_found', 'Mostruário não encontrado.');
  const db = ctx.env.DB;
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare(`SELECT ${RESELLER_COLUMNS} FROM resellers WHERE slug = ?1`).bind(slug),
      db.prepare(`SELECT k.id, k.reseller_id, k.status, k.updated_at, k.data FROM kits k JOIN resellers r ON r.id = k.reseller_id WHERE r.slug = ?1 AND k.status = 'aberta'`).bind(slug),
      db.prepare(`SELECT s.id, s.status, s.data FROM reseller_sales s JOIN kits k ON k.id = s.kit_id JOIN resellers r ON r.id = k.reseller_id WHERE r.slug = ?1 AND k.status = 'aberta' AND s.status = 'ativa'`).bind(slug),
      db.prepare('SELECT body FROM catalog_snapshot WHERE id = 1'),
    ]),
  );
  const row = results[0]?.results[0] as ResellerRow | undefined;
  if (!row) throw new HttpError('not_found', 'Mostruário não encontrado.');
  const reseller = toReseller(row);
  const active = reseller.status === 'ativa';
  const kitRow = active ? (results[1]?.results[0] as KitRow | undefined) : undefined;
  const body = results[3]?.results[0]?.body as string | undefined;
  const catalog = body ? parseSnapshotBody(body) : null;
  const items = kitRow
    ? kitState(toKit(kitRow), ((results[2]?.results ?? []) as unknown as SaleRow[]).map(toSale))
        .filter((l) => l.available > 0)
        .flatMap((l) => {
          const product = catalog?.products.find((p) => p.id === l.productId);
          if (!product) return [];
          const image = photoOf(catalog!, l.productId, l.variantId);
          return [{ productId: l.productId, variantId: l.variantId, size: l.size, slug: product.slug, name: l.name, finish: l.finish, unitCents: l.unitCents, available: l.available, ...(image ? { image } : {}) }];
        })
    : [];
  return json(
    { firstName: reseller.name.split(/\s+/)[0], whatsapp: active && reseller.showWhatsapp ? reseller.whatsapp : null, active, items },
    { headers: { 'Cache-Control': 'public, max-age=30', 'Referrer-Policy': 'strict-origin-when-cross-origin' } },
  );
}
