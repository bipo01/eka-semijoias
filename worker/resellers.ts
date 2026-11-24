import { z } from 'zod';
import {
  commissionTierSchema,
  kitState,
  programSchema,
  RESELLER_STATUSES,
  resellerSchema,
  settle,
  uniqueSlug,
  type Kit,
  type KitItem,
  type Program,
  type Reseller,
} from '../src/data/revenda';
import type { StockMove } from '../src/data/orders';
import { requireSession } from './auth';
import { IDEMPOTENCY_TTL_MS, parseSnapshotBody, WRITE_ATTEMPTS } from './catalog';
import { randomToken, sha256Hex } from './crypto';
import { guard, isGuardMiss, toHttpError, withReadRetry } from './db';
import { HttpError, json, readJson, zodDetails } from './http';
import { notifyCatalog, notifyLeads } from './live';
import type { Context } from './router';
import {
  KIT_COLUMNS,
  kitUnchanged,
  nextStamp,
  parseProgram,
  priceKitLines,
  programStatement,
  RESELLER_COLUMNS,
  resellerUnchanged,
  toKit,
  toReseller,
  toSale,
  type KitRow,
  type ResellerRow,
  type SaleRow,
} from './revendaCore';
import { publishStatements, rowKey, type StockState } from './stock';
import { counted, planStock, takeForLines } from './stockPlan';
import type { StockRow } from '../src/data/stock';

/*
 * The owner's side of the reseller program (docs/revenda/PLAN.md §2, §4):
 * resellers, invites, the program document, kits and settlements.
 * Personal data: admin endpoints only; never logged.
 */

const INVITE_TTL_MS = 7 * 24 * 3600_000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function badRequest(error: z.ZodError, fallback: string): HttpError {
  const issue = error.issues[0];
  return new HttpError('bad_request', issue?.message && !issue.message.startsWith('Invalid') && !issue.message.startsWith('Too') ? issue.message : fallback, zodDetails(error.issues));
}

async function readReseller(db: D1Database, id: string): Promise<{ reseller: Reseller; stamp: string }> {
  if (!ID.test(id)) throw new HttpError('not_found', 'Revendedora não encontrada.');
  const row = await withReadRetry(() => db.prepare(`SELECT ${RESELLER_COLUMNS} FROM resellers WHERE id = ?1`).bind(id).first<ResellerRow>());
  if (!row) throw new HttpError('not_found', 'Revendedora não encontrada.');
  return { reseller: toReseller(row), stamp: row.updated_at };
}

/** A fresh first-access / PIN-reset link (the plain token goes back once; only its hash is stored). */
async function inviteStatements(db: D1Database, resellerId: string, now: number): Promise<{ token: string; expiresAt: string; statements: D1PreparedStatement[] }> {
  const token = randomToken();
  return {
    token,
    expiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
    statements: [
      // Older unused links stop working: only the newest one is valid.
      db.prepare('UPDATE reseller_invites SET used_at = ?2 WHERE reseller_id = ?1 AND used_at IS NULL').bind(resellerId, now),
      db.prepare('INSERT INTO reseller_invites (token_hash, reseller_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)').bind(await sha256Hex(token), resellerId, now, now + INVITE_TTL_MS),
    ],
  };
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

/** GET /api/admin/reseller-program */
export async function handleGetProgram(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const row = await withReadRetry(() => programStatement(ctx.env.DB).first<{ data: string }>());
  return json({ program: parseProgram(row ?? undefined), stored: !!row });
}

/** PUT /api/admin/reseller-program { program } — a changed contract (mode, text or link) gets a new version. */
export async function handlePutProgram(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const parsed = programSchema.safeParse((await readJson(ctx.request, 64 * 1024) as { program?: unknown } | null)?.program);
  if (!parsed.success) throw badRequest(parsed.error, 'Confira as regras do programa.');
  const db = ctx.env.DB;
  const current = parseProgram((await withReadRetry(() => programStatement(db).first<{ data: string }>())) ?? undefined);
  const next: Program = parsed.data;
  const c = current.contract;
  const changed = c.mode !== next.contract.mode || c.text !== next.contract.text || c.url !== next.contract.url || c.title !== next.contract.title;
  next.contract.version = changed ? c.version + 1 : c.version;
  const at = new Date().toISOString();
  const textHash = await sha256Hex(next.contract.mode === 'aceite' ? `${next.contract.title}\n${next.contract.text}` : (next.contract.url ?? ''));
  try {
  await db.batch([
    // Two saves from two devices: the second one, made on the older version, is refused.
    guard(db, `COALESCE((SELECT json_extract(data, '$.contract.version') FROM app_config WHERE key = 'revenda'), 1) = ?1`, c.version),
    db.prepare(`INSERT INTO app_config (key, updated_at, data) VALUES ('revenda', ?1, ?2) ON CONFLICT (key) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`).bind(at, JSON.stringify(next)),
    // Every contract version's exact text is kept (the acceptances store its hash).
    db.prepare('INSERT OR IGNORE INTO contract_versions (version, title, mode, body, sha256, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(next.contract.version, next.contract.title, next.contract.mode, next.contract.mode === 'aceite' ? next.contract.text : (next.contract.url ?? ''), textHash, at),
    db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'revenda.program', changed ? `Programa de revenda salvo (contrato versão ${next.contract.version})` : 'Programa de revenda salvo'),
  ]);
  } catch (error) {
    if (isGuardMiss(error)) throw new HttpError('conflict', 'O programa foi alterado em outro aparelho. Recarregue a página e salve de novo.');
    throw toHttpError(error);
  }
  ctx.waitUntil(notifyLeads(ctx.env));
  return json({ program: next });
}

// ---------------------------------------------------------------------------
// Resellers
// ---------------------------------------------------------------------------

/** GET /api/admin/resellers — every reseller with her open kit summary. */
export async function handleListResellers(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare(`SELECT ${RESELLER_COLUMNS} FROM resellers ORDER BY created_at DESC`),
      db.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE status = 'aberta'`),
      db.prepare(`SELECT s.id, s.status, s.data FROM reseller_sales s JOIN kits k ON k.id = s.kit_id WHERE k.status = 'aberta'`),
      db.prepare(`SELECT k.reseller_id, COUNT(*) AS cycles, COALESCE(SUM(json_extract(k.data, '$.settlement.commissionCents')), 0) AS commission, SUM(CASE WHEN json_extract(k.data, '$.settlement.paidAt') IS NULL THEN json_extract(k.data, '$.settlement.dueCents') ELSE 0 END) AS unpaid FROM kits k WHERE k.status = 'fechada' GROUP BY k.reseller_id`),
      programStatement(db),
    ]),
  );
  const kits = ((results[1]?.results ?? []) as unknown as KitRow[]).map(toKit);
  const sales = ((results[2]?.results ?? []) as unknown as SaleRow[]).map(toSale);
  const closed = new Map(((results[3]?.results ?? []) as { reseller_id: string; cycles: number; commission: number; unpaid: number | null }[]).map((r) => [r.reseller_id, r]));
  return json({
    resellers: ((results[0]?.results ?? []) as unknown as ResellerRow[]).map(toReseller).map((reseller) => {
      const kit = kits.find((k) => k.resellerId === reseller.id) ?? null;
      const c = closed.get(reseller.id);
      return { reseller, kit, sales: kit ? sales.filter((s) => s.kitId === kit.id) : [], closedCycles: c?.cycles ?? 0, receivedCommissionCents: c?.commission ?? 0, unpaidCents: c?.unpaid ?? 0 };
    }),
    program: parseProgram((results[4]?.results[0] as { data?: string } | undefined) ?? undefined),
  });
}

/** GET /api/admin/resellers/:id — the reseller, her kits (newest first), their sales, contract evidence and invite state. */
export async function handleGetReseller(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const id = ctx.params.id ?? '';
  if (!ID.test(id)) throw new HttpError('not_found', 'Revendedora não encontrada.');
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare(`SELECT ${RESELLER_COLUMNS} FROM resellers WHERE id = ?1`).bind(id),
      db.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE reseller_id = ?1 ORDER BY opened_at DESC LIMIT 60`).bind(id),
      db.prepare('SELECT id, status, data FROM reseller_sales WHERE reseller_id = ?1 ORDER BY created_at DESC LIMIT 2000').bind(id),
      db.prepare('SELECT accepted_at, version, text_sha256, typed_name, mode FROM contract_acceptances WHERE reseller_id = ?1 ORDER BY accepted_at DESC LIMIT 5').bind(id),
      db.prepare('SELECT expires_at FROM reseller_invites WHERE reseller_id = ?1 AND used_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC LIMIT 1').bind(id, Date.now()),
    ]),
  );
  const row = results[0]?.results[0] as ResellerRow | undefined;
  if (!row) throw new HttpError('not_found', 'Revendedora não encontrada.');
  const invite = results[4]?.results[0] as { expires_at: number } | undefined;
  return json({
    reseller: toReseller(row),
    kits: ((results[1]?.results ?? []) as unknown as KitRow[]).map(toKit),
    sales: ((results[2]?.results ?? []) as unknown as SaleRow[]).map(toSale),
    acceptances: (results[3]?.results ?? []).map((a) => ({ acceptedAt: a.accepted_at, version: a.version, textSha256: a.text_sha256, typedName: a.typed_name, mode: a.mode })),
    invitePendingUntil: invite ? new Date(invite.expires_at).toISOString() : null,
  });
}

const phone = z
  .string()
  .transform((v) => v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''))
  .pipe(z.string().regex(/^\d{10,11}$/, 'WhatsApp com DDD, ex.: (65) 99999-9999'));
const slugInput = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Endereço do mostruário: só letras minúsculas, números e hífen (2 a 40).');

const createSchema = z.object({
  leadId: z.string().regex(ID).optional(),
  name: z.string().transform((v) => v.replace(/\s+/g, ' ').trim()).pipe(z.string().min(3, 'Informe o nome completo.').max(120)),
  whatsapp: phone,
  city: z.string().trim().max(80).default(''),
  uf: z.string().trim().toUpperCase().max(2).default(''),
  instagram: z.string().trim().max(60).optional(),
  slug: slugInput.optional(),
});

/** POST /api/admin/resellers (Idempotency-Key) — effectivates a reseller; returns her first-access link once. */
export async function handleCreateReseller(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const key = ctx.request.headers.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new HttpError('bad_request', 'Chave de envio inválida.');
  const raw = await readJson(ctx.request, 4096);
  const input = createSchema.safeParse(raw);
  if (!input.success) throw badRequest(input.error, 'Confira os dados da revendedora.');
  const data = input.data;
  const idemKey = `reseller:${key}`;
  const requestHash = await sha256Hex(JSON.stringify(data));

  const first = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey),
      db.prepare('SELECT slug FROM resellers'),
      db.prepare("SELECT json_extract(data, '$.name') AS name FROM resellers WHERE whatsapp = ?1").bind(data.whatsapp),
      data.leadId ? db.prepare('SELECT status FROM leads WHERE id = ?1').bind(data.leadId) : db.prepare('SELECT NULL AS status WHERE 0'),
    ]),
  );
  const replay = first[0]?.results[0] as { request_hash: string; response: string } | undefined;
  if (replay) {
    if (replay.request_hash !== requestHash) throw new HttpError('bad_request', 'Esta chave de envio já foi usada.');
    return json(JSON.parse(replay.response), { status: 201 });
  }
  const dup = first[2]?.results[0] as { name: string } | undefined;
  if (dup) throw new HttpError('conflict', `Já existe uma revendedora com este WhatsApp: ${dup.name}.`);
  if (data.leadId) {
    const lead = first[3]?.results[0] as { status: string } | undefined;
    if (!lead) throw new HttpError('not_found', 'Cadastro não encontrado.');
    if (lead.status === 'efetivada') throw new HttpError('conflict', 'Este cadastro já virou revendedora.');
  }
  const taken = new Set((first[1]?.results ?? []).map((r) => String(r.slug)));
  if (data.slug && taken.has(data.slug)) throw new HttpError('conflict', 'Este endereço de mostruário já é de outra revendedora.');
  const slug = data.slug ?? uniqueSlug(data.name, taken);
  const now = Date.now();
  const at = new Date(now).toISOString();
  const reseller: Reseller = resellerSchema.parse({
    id: `rsl_${randomToken().slice(0, 16)}`,
    slug,
    name: data.name,
    whatsapp: data.whatsapp,
    city: data.city,
    uf: data.uf,
    ...(data.instagram ? { instagram: data.instagram.replace(/^@/, '') } : {}),
    status: 'ativa',
    ...(data.leadId ? { leadId: data.leadId } : {}),
    showWhatsapp: true,
    hasPin: false,
    createdAt: at,
    updatedAt: at,
  });
  const invite = await inviteStatements(db, reseller.id, now);
  const response = { reseller, invite: { token: invite.token, expiresAt: invite.expiresAt } };
  try {
    await db.batch([
      db
        .prepare('INSERT INTO resellers (id, slug, whatsapp, status, lead_id, created_at, updated_at, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)')
        .bind(reseller.id, slug, reseller.whatsapp, 'ativa', data.leadId ?? null, at, JSON.stringify(reseller)),
      ...invite.statements,
      ...(data.leadId
        ? [
            guard(db, `(SELECT status FROM leads WHERE id = ?1) <> 'efetivada'`, data.leadId),
            db.prepare(`UPDATE leads SET status = 'efetivada', data = json_set(data, '$.resellerId', ?2) WHERE id = ?1`).bind(data.leadId, reseller.id),
          ]
        : []),
      // The stored replay never holds the access token (only its hash exists): a replay asks for a new link.
      db.prepare('INSERT INTO idempotency (key, request_hash, created_at, response) VALUES (?1, ?2, ?3, ?4)').bind(idemKey, requestHash, now, JSON.stringify({ reseller, invite: null })),
      db.prepare('DELETE FROM idempotency WHERE created_at < ?1').bind(now - IDEMPOTENCY_TTL_MS),
      db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'reseller.create', `Revendedora ${reseller.id} efetivada`),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE constraint failed: resellers\.whatsapp/i.test(message)) throw new HttpError('conflict', 'Já existe uma revendedora com este WhatsApp.');
    if (/UNIQUE constraint failed: resellers\.slug/i.test(message)) throw new HttpError('conflict', 'Este endereço de mostruário já é de outra revendedora. Tente de novo.');
    if (/UNIQUE constraint failed: idempotency/i.test(message)) {
      const stored = await db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idemKey).first<{ request_hash: string; response: string }>();
      if (stored?.request_hash === requestHash) return json(JSON.parse(stored.response), { status: 201 });
    }
    if (isGuardMiss(error)) throw new HttpError('conflict', 'Este cadastro já virou revendedora.');
    throw toHttpError(error);
  }
  ctx.waitUntil(notifyLeads(ctx.env));
  return json(response, { status: 201 });
}

const patchSchema = z.object({
  updatedAt: z.string().min(1).max(40),
  name: z.string().transform((v) => v.replace(/\s+/g, ' ').trim()).pipe(z.string().min(3, 'Informe o nome completo.').max(120)).optional(),
  whatsapp: phone.optional(),
  city: z.string().trim().max(80).optional(),
  uf: z.string().trim().toUpperCase().max(2).optional(),
  instagram: z.string().trim().max(60).optional(),
  slug: slugInput.optional(),
  status: z.enum(RESELLER_STATUSES).optional(),
  tiers: z.array(commissionTierSchema).min(1).max(8).nullable().optional(),
  contractUrl: z.union([z.url().max(500), z.literal('')]).optional(),
  showWhatsapp: z.boolean().optional(),
  note: z.string().max(600).optional(),
});

/** PATCH /api/admin/resellers/:id — edit data, status, own commission or contract link (CAS on updatedAt). */
export async function handlePatchReseller(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const input = patchSchema.safeParse(await readJson(ctx.request, 8192));
  if (!input.success) throw badRequest(input.error, 'Confira os dados da revendedora.');
  const { reseller, stamp } = await readReseller(db, ctx.params.id ?? '');
  const p = input.data;
  if (p.updatedAt !== stamp) throw new HttpError('conflict', 'Os dados desta revendedora mudaram em outro aparelho. Confira e salve de novo.', { reseller });
  if (p.tiers) {
    const check = programSchema.safeParse({ tiers: p.tiers, cycleDays: 30, contract: { mode: 'link', title: 'x', text: '', version: 1, url: 'https://x.y' } });
    if (!check.success) throw badRequest(check.error, 'Confira as faixas de comissão.');
  }
  if (p.status === 'encerrada') {
    const open = await db.prepare(`SELECT id FROM kits WHERE reseller_id = ?1 AND status = 'aberta'`).bind(reseller.id).first();
    if (open) throw new HttpError('conflict', 'Faça o acerto da maleta antes de encerrar a parceria.');
  }
  const at = nextStamp(stamp);
  const next: Reseller = { ...reseller, updatedAt: at };
  if (p.name !== undefined) next.name = p.name;
  if (p.whatsapp !== undefined) next.whatsapp = p.whatsapp;
  if (p.city !== undefined) next.city = p.city;
  if (p.uf !== undefined) next.uf = p.uf;
  if (p.instagram !== undefined) {
    if (p.instagram) next.instagram = p.instagram.replace(/^@/, '');
    else delete next.instagram;
  }
  if (p.slug !== undefined) next.slug = p.slug;
  if (p.status !== undefined) next.status = p.status;
  if (p.tiers !== undefined) {
    if (p.tiers) next.tiers = p.tiers;
    else delete next.tiers;
  }
  if (p.contractUrl !== undefined) {
    if (p.contractUrl) next.contractUrl = p.contractUrl;
    else delete next.contractUrl;
  }
  if (p.showWhatsapp !== undefined) next.showWhatsapp = p.showWhatsapp;
  if (p.note !== undefined) {
    if (p.note.trim()) next.note = p.note.trim();
    else delete next.note;
  }
  const parsed = resellerSchema.safeParse(next);
  if (!parsed.success) throw badRequest(parsed.error, 'Confira os dados da revendedora.');
  const blocked = next.status !== 'ativa' && reseller.status === 'ativa';
  try {
    await db.batch([
      resellerUnchanged(db, reseller.id, stamp),
      ...(next.status === 'encerrada' ? [guard(db, `NOT EXISTS (SELECT 1 FROM kits WHERE reseller_id = ?1 AND status = 'aberta')`, reseller.id)] : []),
      db.prepare('UPDATE resellers SET slug = ?2, whatsapp = ?3, status = ?4, updated_at = ?5, data = ?6 WHERE id = ?1').bind(reseller.id, next.slug, next.whatsapp, next.status, at, JSON.stringify(parsed.data)),
      // Paused or ended: her sessions end now.
      ...(blocked ? [db.prepare('DELETE FROM reseller_sessions WHERE reseller_id = ?1').bind(reseller.id)] : []),
      db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'reseller.update', `Revendedora ${reseller.id} atualizada${p.status ? ` (${p.status})` : ''}`),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (isGuardMiss(error)) throw new HttpError('conflict', next.status === 'encerrada' ? 'Faça o acerto da maleta antes de encerrar a parceria.' : 'Os dados desta revendedora mudaram em outro aparelho. Confira e salve de novo.');
    if (/UNIQUE constraint failed: resellers\.whatsapp/i.test(message)) throw new HttpError('conflict', 'Já existe uma revendedora com este WhatsApp.');
    if (/UNIQUE constraint failed: resellers\.slug/i.test(message)) throw new HttpError('conflict', 'Este endereço de mostruário já é de outra revendedora.');
    throw toHttpError(error);
  }
  ctx.waitUntil(notifyLeads(ctx.env));
  return json({ reseller: parsed.data });
}

/** POST /api/admin/resellers/:id/invite — a new first-access / PIN-reset link (the older one stops working). */
export async function handleNewInvite(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const { reseller } = await readReseller(db, ctx.params.id ?? '');
  if (reseller.status !== 'ativa') throw new HttpError('conflict', 'Reative a revendedora antes de gerar um novo acesso.');
  const now = Date.now();
  const invite = await inviteStatements(db, reseller.id, now);
  await db.batch([
    ...invite.statements,
    // A new access link from the owner also lifts a login lock on her number.
    db.prepare('DELETE FROM throttle WHERE key IN (?1, ?2)').bind(`rlogin:n:${reseller.whatsapp}`, `rlogin:nd:${reseller.whatsapp}`),
    db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(new Date(now).toISOString(), 'reseller.invite', `Novo acesso para ${reseller.id}`),
  ]);
  return json({ invite: { token: invite.token, expiresAt: invite.expiresAt } });
}

/** POST /api/admin/resellers/:id/contract-check — the owner confirms she saw the external signature. */
export async function handleContractCheck(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const { reseller, stamp } = await readReseller(db, ctx.params.id ?? '');
  if (!reseller.contract) throw new HttpError('conflict', 'A revendedora ainda não confirmou o contrato.');
  const at = nextStamp(stamp);
  const next: Reseller = { ...reseller, updatedAt: at, contract: { ...reseller.contract, checkedAt: at } };
  try {
    await db.batch([resellerUnchanged(db, reseller.id, stamp), db.prepare('UPDATE resellers SET updated_at = ?2, data = ?3 WHERE id = ?1').bind(reseller.id, at, JSON.stringify(next))]);
  } catch (error) {
    if (isGuardMiss(error)) throw new HttpError('conflict', 'Os dados mudaram. Tente de novo.');
    throw toHttpError(error);
  }
  ctx.waitUntil(notifyLeads(ctx.env));
  return json({ reseller: next });
}

// ---------------------------------------------------------------------------
// Kits
// ---------------------------------------------------------------------------

const kitLines = z
  .array(z.object({ productId: z.string().regex(ID), variantId: z.string().regex(ID), size: z.string().max(12).optional(), qty: z.number().int().min(1).max(500) }))
  .min(1, 'Escolha pelo menos uma peça para a maleta.')
  .max(300);

/** Snapshot + stock rows + tracked products, plus extra statements in the same round trip. */
async function loadWithStock(db: D1Database, extra: D1PreparedStatement[]): Promise<{ state: StockState; extra: D1Result<Record<string, unknown>>[] }> {
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT version, body FROM catalog_snapshot WHERE id = 1'),
      db.prepare('SELECT product_id, variant_id, size, qty FROM stock_levels'),
      db.prepare('SELECT product_id FROM stock_tracked'),
      ...extra,
    ]),
  );
  const snapshot = results[0]?.results[0] as { version: number; body: string } | undefined;
  if (!snapshot) throw new HttpError('internal');
  return {
    state: {
      catalog: parseSnapshotBody(snapshot.body),
      version: snapshot.version,
      rows: (results[1]?.results ?? []) as unknown as StockRow[],
      tracked: new Set((results[2]?.results ?? []).map((r) => r.product_id as string)),
    },
    extra: results.slice(3),
  };
}

const movesOfKit = (items: KitItem[]): StockMove[] => items.map((i) => ({ productId: i.productId, variantId: i.variantId, size: i.size, qty: i.qty }));

/** POST /api/admin/resellers/:id/kits { items, dueAt? } — opens her kit; tracked pieces leave the stock in the same batch. */
export async function handleCreateKit(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const body = z.object({ items: kitLines, dueAt: z.string().max(40).optional() }).safeParse(await readJson(ctx.request, 64 * 1024));
  if (!body.success) throw badRequest(body.error, 'Confira as peças da maleta.');
  const resellerId = ctx.params.id ?? '';
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const { state, extra } = await loadWithStock(db, [
      db.prepare(`SELECT ${RESELLER_COLUMNS} FROM resellers WHERE id = ?1`).bind(resellerId),
      db.prepare(`SELECT id FROM kits WHERE reseller_id = ?1 AND status = 'aberta'`).bind(resellerId),
      programStatement(db),
    ]);
    const row = extra[0]?.results[0] as ResellerRow | undefined;
    if (!row) throw new HttpError('not_found', 'Revendedora não encontrada.');
    const reseller = toReseller(row);
    if (reseller.status !== 'ativa') throw new HttpError('conflict', 'A revendedora não está ativa.');
    if (extra[1]?.results.length) throw new HttpError('conflict', 'Esta revendedora já tem uma maleta aberta. Ajuste a maleta atual ou faça o acerto antes.');
    const program = parseProgram(extra[2]?.results[0] as { data?: string } | undefined);
    const items = priceKitLines(state.catalog, body.data.items);
    const now = Date.now();
    const at = new Date(now).toISOString();
    const due = body.data.dueAt && !Number.isNaN(Date.parse(body.data.dueAt)) ? new Date(body.data.dueAt).toISOString() : new Date(now + program.cycleDays * 86_400_000).toISOString();
    const kitId = `kit_${randomToken().slice(0, 16)}`;
    const plan = planStock(db, state, at, { kitId }, [], movesOfKit(items), items);
    if (plan.problems.length) throw new HttpError('conflict', `Estoque insuficiente: ${plan.problems.join('; ')}.`, { stock: plan.problems });
    const kit: Kit = { id: kitId, resellerId, status: 'aberta', openedAt: at, dueAt: due, updatedAt: at, items, stockMoves: plan.taken, tiers: reseller.tiers ?? program.tiers };
    const publish = plan.statements.length ? publishStatements(db, state, plan.rows, state.tracked) : null;
    try {
      await db.batch([
        ...(publish ? [publish.first] : []),
        // Paused or ended meanwhile: no kit.
        guard(db, `(SELECT status FROM resellers WHERE id = ?1) = 'ativa'`, resellerId),
        db.prepare(`INSERT INTO kits (id, reseller_id, status, opened_at, due_at, updated_at, data) VALUES (?1, ?2, 'aberta', ?3, ?4, ?3, ?5)`).bind(kitId, resellerId, at, due, JSON.stringify(kit)),
        ...plan.statements,
        ...(publish?.statements ?? []),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'kit.open', `Maleta ${kitId} aberta para ${resellerId}`),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (isGuardMiss(error)) continue;
      if (/UNIQUE constraint failed: kits/i.test(message)) throw new HttpError('conflict', 'Esta revendedora já tem uma maleta aberta.');
      if (/CHECK constraint failed/i.test(message)) throw new HttpError('integrity', 'O estoque ficaria fora do limite permitido.');
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyLeads(ctx.env));
    if (publish) ctx.waitUntil(notifyCatalog(ctx.env, publish.version));
    return json({ kit, ...(publish ? { version: publish.version } : {}) }, { status: 201 });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

async function loadKitWithStock(db: D1Database, kitId: string) {
  if (!ID.test(kitId)) throw new HttpError('not_found', 'Maleta não encontrada.');
  const { state, extra } = await loadWithStock(db, [
    db.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE id = ?1`).bind(kitId),
    db.prepare('SELECT id, status, data FROM reseller_sales WHERE kit_id = ?1').bind(kitId),
  ]);
  const row = extra[0]?.results[0] as KitRow | undefined;
  if (!row) throw new HttpError('not_found', 'Maleta não encontrada.');
  return { state, kit: toKit(row), stamp: row.updated_at, sales: ((extra[1]?.results ?? []) as unknown as SaleRow[]).map(toSale) };
}

/** PUT /api/admin/kits/:id/items { items, updatedAt } — adjusts an open kit; never below what was sold. */
export async function handleEditKit(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const body = z.object({ items: kitLines, updatedAt: z.string().min(1).max(40) }).safeParse(await readJson(ctx.request, 64 * 1024));
  if (!body.success) throw badRequest(body.error, 'Confira as peças da maleta.');
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const { state, kit, stamp, sales } = await loadKitWithStock(db, ctx.params.id ?? '');
    if (kit.status !== 'aberta') throw new HttpError('conflict', 'Esta maleta já foi acertada.');
    if (stamp !== body.data.updatedAt) throw new HttpError('conflict', 'A maleta mudou enquanto você editava (uma venda ou outro aparelho). Confira e salve de novo.', { kit });
    const agreed = new Map(kit.items.map((i) => [`${i.productId}|${i.variantId}|${i.size}`, i]));
    const items = priceKitLines(state.catalog, body.data.items, agreed);
    // Never below what was sold (a sold unit cannot leave the kit).
    const sold = kitState(kit, sales);
    for (const line of sold) {
      if (!line.sold) continue;
      const next = items.find((i) => i.productId === line.productId && i.variantId === line.variantId && i.size === line.size);
      if (!next || next.qty < line.sold) throw new HttpError('conflict', `${line.name}: já foram vendidas ${line.sold}. A maleta não pode ter menos que isso.`);
    }
    const at = nextStamp(stamp);
    // Lines (or parts of lines) that were not counted when they entered the kit hold no stock units.
    const take = takeForLines(movesOfKit(items), kit.items, kit.stockMoves);
    const plan = planStock(db, state, at, { kitId: kit.id }, kit.stockMoves, take, items);
    if (plan.problems.length) throw new HttpError('conflict', `Estoque insuficiente: ${plan.problems.join('; ')}.`, { stock: plan.problems });
    const next: Kit = { ...kit, items, stockMoves: plan.taken, updatedAt: at };
    const publish = plan.statements.length ? publishStatements(db, state, plan.rows, state.tracked) : null;
    try {
      await db.batch([
        ...(publish ? [publish.first] : []),
        kitUnchanged(db, kit.id, stamp),
        ...plan.statements,
        ...(publish?.statements ?? []),
        db.prepare('UPDATE kits SET updated_at = ?2, data = ?3 WHERE id = ?1').bind(kit.id, at, JSON.stringify(next)),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'kit.edit', `Maleta ${kit.id} ajustada`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      if (/CHECK constraint failed/i.test(error instanceof Error ? error.message : '')) throw new HttpError('integrity', 'O estoque ficaria fora do limite permitido.');
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyLeads(ctx.env));
    if (publish) ctx.waitUntil(notifyCatalog(ctx.env, publish.version));
    return json({ kit: next, ...(publish ? { version: publish.version } : {}) });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

const settleSchema = z.object({
  updatedAt: z.string().min(1).max(40),
  returned: z.array(z.object({ productId: z.string().regex(ID), variantId: z.string().regex(ID), size: z.string().max(12), qty: z.number().int().min(0).max(500) })).max(300),
});

/** POST /api/admin/kits/:id/settle { returned, updatedAt } — closes the cycle; returned pieces go back to stock. */
export async function handleSettleKit(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const body = settleSchema.safeParse(await readJson(ctx.request, 64 * 1024));
  if (!body.success) throw badRequest(body.error, 'Confira as peças devolvidas.');
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const { state, kit, stamp, sales } = await loadKitWithStock(db, ctx.params.id ?? '');
    if (kit.status !== 'aberta') {
      // Already settled: a retry of the same count answers the same; a different count (another
      // device) must not look like it was applied.
      const same = (kit.settlement?.returned ?? []).every((r) => (body.data.returned.find((x) => x.productId === r.productId && x.variantId === r.variantId && x.size === r.size)?.qty ?? r.qty) === r.qty);
      if (same) return json({ kit });
      throw new HttpError('conflict', 'Esta maleta já foi acertada (em outro aparelho) com outras quantidades. Confira o acerto registrado.', { kit });
    }
    if (stamp !== body.data.updatedAt) throw new HttpError('conflict', 'A maleta mudou (uma venda nova?). Confira o acerto de novo.', { kit });
    const result = settle(kit, sales, body.data.returned);
    if ('error' in result) throw new HttpError('bad_request', result.error);
    const at = nextStamp(stamp);
    // Give back the returned units this kit actually took out of stock (lines not tracked at the time held none).
    const heldQty = new Map(kit.stockMoves.map((m) => [rowKey(m.productId, m.variantId, m.size), m.qty]));
    const give: StockMove[] = result.returned.flatMap((r) => {
      const q = Math.min(r.qty, heldQty.get(rowKey(r.productId, r.variantId, r.size)) ?? 0);
      return q > 0 ? [{ productId: r.productId, variantId: r.variantId, size: r.size, qty: q }] : [];
    });
    const plan = planStock(db, state, at, { kitId: kit.id }, give.filter((m) => counted(state, m)), [], kit.items);
    const next: Kit = { ...kit, status: 'fechada', closedAt: at, updatedAt: at, stockMoves: [], settlement: { ...result, at } };
    const publish = plan.statements.length ? publishStatements(db, state, plan.rows, state.tracked) : null;
    try {
      await db.batch([
        ...(publish ? [publish.first] : []),
        kitUnchanged(db, kit.id, stamp),
        ...plan.statements,
        ...(publish?.statements ?? []),
        db.prepare(`UPDATE kits SET status = 'fechada', closed_at = ?2, updated_at = ?2, data = ?3 WHERE id = ?1`).bind(kit.id, at, JSON.stringify(next)),
        db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(at, 'kit.settle', `Acerto da maleta ${kit.id}: ${result.dueCents} centavos a repassar`),
      ]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyLeads(ctx.env));
    if (publish) ctx.waitUntil(notifyCatalog(ctx.env, publish.version));
    return json({ kit: next, ...(publish ? { version: publish.version } : {}) });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

/** POST /api/admin/kits/:id/paid { paid } — marks the settlement amount as received (or not). */
export async function handleKitPaid(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const db = ctx.env.DB;
  const body = z.object({ paid: z.boolean() }).safeParse(await readJson(ctx.request, 512));
  if (!body.success) throw new HttpError('bad_request');
  const id = ctx.params.id ?? '';
  if (!ID.test(id)) throw new HttpError('not_found', 'Maleta não encontrada.');
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const row = await withReadRetry(() => db.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE id = ?1`).bind(id).first<KitRow>());
    if (!row) throw new HttpError('not_found', 'Maleta não encontrada.');
    const kit = toKit(row);
    if (!kit.settlement) throw new HttpError('conflict', 'Faça o acerto antes.');
    const at = nextStamp(row.updated_at);
    const settlement = { ...kit.settlement };
    if (body.data.paid) settlement.paidAt = at;
    else delete settlement.paidAt;
    const next: Kit = { ...kit, updatedAt: at, settlement };
    try {
      await db.batch([kitUnchanged(db, id, row.updated_at), db.prepare('UPDATE kits SET updated_at = ?2, data = ?3 WHERE id = ?1').bind(id, at, JSON.stringify(next))]);
    } catch (error) {
      if (isGuardMiss(error)) continue;
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyLeads(ctx.env));
    return json({ kit: next });
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}
