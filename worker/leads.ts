import { z } from 'zod';
import { MAX_LEADS, resellerLeadSchema, type ResellerLead } from '../src/data/schema';
import { leadFormSchema } from '../src/lib/lead';
import { hit, ipKey, pruneThrottle, requireSession, retryAfter } from './auth';
import { randomToken } from './crypto';
import { toHttpError, withReadRetry } from './db';
import { HttpError, json, readJson } from './http';
import { notifyLeads } from './live';
import type { Context } from './router';

/* Reseller pre-registrations. Personal data: never in public responses or logs. */

const LEAD_MAX_BYTES = 4096;
const LEAD_WINDOW_MS = 60 * 60 * 1000;
export const LEADS_PER_WINDOW = 5;
/**
 * Across all visitors, per hour: bounds a botnet's flood of the list (and of the free D1 write
 * quota). Generous on purpose: when it trips, visitors still reach the store, because the
 * WhatsApp message carries every field; only the copy in the admin list is skipped.
 */
export const LEADS_GLOBAL_PER_WINDOW = 200;

const publicLeadSchema = z.looseObject({ website: z.string().max(200).optional() });

/** POST /api/leads — public form. */
export async function handleCreateLead(ctx: Context): Promise<Response> {
  const input = await readJson(ctx.request, LEAD_MAX_BYTES);
  const envelope = publicLeadSchema.safeParse(input);
  if (!envelope.success) throw new HttpError('bad_request');
  // Honeypot: real visitors never see or fill this field. Answer like a success so bots learn nothing.
  if (envelope.data.website) return json({ ok: true }, { status: 202 });

  const parsed = leadFormSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError('bad_request', issue?.message ?? 'Confira os dados do formulário.');
  }
  const now = Date.now();
  // Fail closed: without the pepper, IPs could only be hashed reversibly.
  if (!ctx.env.PIN_PEPPER || ctx.env.PIN_PEPPER.length < 32) throw new HttpError('not_configured', 'Não foi possível registrar o cadastro agora.');
  const key = await ipKey(ctx.env.PIN_PEPPER, ctx.request);
  const counter = await hit(ctx.env.DB, `lead:ip:${key}`, LEAD_WINDOW_MS, now);
  if (counter.count > LEADS_PER_WINDOW) throw retryAfter(counter.window_start + LEAD_WINDOW_MS, now, 'Recebemos vários cadastros deste aparelho.');
  const global = await hit(ctx.env.DB, 'lead:global', LEAD_WINDOW_MS, now);
  if (global.count > LEADS_GLOBAL_PER_WINDOW) throw retryAfter(global.window_start + LEAD_WINDOW_MS, now, 'Recebemos muitos cadastros agora.');

  const form = parsed.data;
  const lead: ResellerLead = resellerLeadSchema.parse({
    id: `lead_${randomToken().slice(0, 16)}`,
    name: form.name,
    whatsapp: form.whatsapp,
    city: form.city,
    uf: form.uf,
    ...(form.instagram ? { instagram: form.instagram } : {}),
    alreadySells: form.alreadySells,
    ...(form.source ? { source: form.source } : {}),
    createdAt: new Date(now).toISOString(),
  });
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('INSERT INTO leads (id, created_at, data) VALUES (?1, ?2, ?3)').bind(lead.id, lead.createdAt, JSON.stringify(lead)),
      pruneThrottle(ctx.env.DB, now),
    ]);
  } catch (error) {
    throw toHttpError(error);
  }
  ctx.waitUntil(notifyLeads(ctx.env));
  return json({ ok: true, id: lead.id }, { status: 201 });
}

/** GET /api/admin/leads — with the review status (column) merged in. */
export async function handleListLeads(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const { results } = await withReadRetry(() => ctx.env.DB.prepare('SELECT data, status FROM leads ORDER BY created_at DESC LIMIT ?1').bind(MAX_LEADS).all<{ data: string; status: string }>());
  return json({ leads: results.map((r) => ({ ...(JSON.parse(r.data) as ResellerLead), status: r.status as ResellerLead['status'] })) });
}

const leadPatchSchema = z.object({
  status: z.enum(['nova', 'analise', 'aprovada', 'recusada']).optional(),
  note: z.string().max(600).optional(),
});

/** PATCH /api/admin/leads/:id { status?, note? } — review of an application ('efetivada' only via the reseller creation). */
export async function handlePatchLead(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const id = ctx.params.id ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError('not_found');
  const input = leadPatchSchema.safeParse(await readJson(ctx.request, 2048));
  if (!input.success) throw new HttpError('bad_request', 'Dados inválidos.');
  const row = await withReadRetry(() => ctx.env.DB.prepare('SELECT data, status FROM leads WHERE id = ?1').bind(id).first<{ data: string; status: string }>());
  if (!row) throw new HttpError('not_found', 'Cadastro não encontrado.');
  if (row.status === 'efetivada' && input.data.status) throw new HttpError('conflict', 'Este cadastro já virou revendedora.');
  const lead: ResellerLead = { ...(JSON.parse(row.data) as ResellerLead) };
  if (input.data.note !== undefined) {
    const note = input.data.note.trim();
    if (note) lead.note = note;
    else delete lead.note;
  }
  const status = input.data.status ?? (row.status as NonNullable<ResellerLead['status']>);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE leads SET data = ?2, status = ?3 WHERE id = ?1').bind(id, JSON.stringify({ ...lead, status: undefined }), status),
    ctx.env.DB.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(new Date().toISOString(), 'lead.review', `Cadastro ${id}: ${status}`),
  ]);
  ctx.waitUntil(notifyLeads(ctx.env));
  return json({ lead: { ...lead, status } });
}

/** DELETE /api/admin/leads/:id — idempotent. */
export async function handleDeleteLead(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const id = ctx.params.id ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError('not_found');
  const result = await ctx.env.DB.prepare('DELETE FROM leads WHERE id = ?1').bind(id).run();
  const deleted = (result.meta.changes ?? 0) > 0;
  if (deleted) {
    await ctx.env.DB.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(new Date().toISOString(), 'lead.delete', `Cadastro ${id} excluído`).run();
    ctx.waitUntil(notifyLeads(ctx.env));
  }
  return json({ deleted });
}
