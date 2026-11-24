import { useCallback, useEffect, useState } from 'react';
import type { Kit, Program, Reseller, ResellerSale } from '../../data/revenda';
import type { ResellerLead } from '../../data/schema';
import { api, ApiError, errorMessage, idempotencyKey } from '../../lib/api';
import { toCSV } from '../../lib/csv';
import { formatBRL } from '../../lib/format';
import { formatDateTime } from './contact';
import { ownWrite, useCatalog } from '../../store/catalog';
import { signalSessionLost } from './session';

/*
 * The reseller program in the owner's admin (docs/revenda/PLAN.md). Reads
 * refetch on every live "leads" notice (reseller changes use that channel);
 * writes resolve to `{ error }` with a pt-BR message, or the server's answer.
 */

export interface ResellerSummary {
  reseller: Reseller;
  kit: Kit | null;
  sales: ResellerSale[];
  closedCycles: number;
  receivedCommissionCents: number;
  unpaidCents: number;
}
export interface ResellerDetail {
  reseller: Reseller;
  kits: Kit[];
  sales: ResellerSale[];
  acceptances: { acceptedAt: string; version: number; textSha256: string; typedName: string; mode: string }[];
  invitePendingUntil: string | null;
}

type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };

function handle(error: unknown): string {
  if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
  return errorMessage(error);
}

/** Loads `path`, again on every live notice and on `reload()`. Keeps the last data on a failed refresh. */
function useLive<T>(path: string | null): { state: Load<T>; reload: () => void } {
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const version = useCatalog((s) => s.leadsVersion);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path, { retries: 2 }).then(
      (data) => alive && setState({ status: 'ready', data }),
      (error: unknown) => alive && setState((s) => (s.status === 'ready' ? s : { status: 'error', message: handle(error) })),
    );
    return () => {
      alive = false;
    };
  }, [path, version, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { state, reload };
}

export const useResellers = () => useLive<{ resellers: ResellerSummary[]; program: Program }>('/api/admin/resellers');
export const useResellerDetail = (id: string | null) => useLive<ResellerDetail>(id ? `/api/admin/resellers/${encodeURIComponent(id)}` : null);
export const useProgram = () => useLive<{ program: Program; stored: boolean }>('/api/admin/reseller-program');

async function attempt<T>(run: () => Promise<T>): Promise<T | { error: string; details?: unknown }> {
  try {
    return await run();
  } catch (error) {
    return { error: handle(error), ...(error instanceof ApiError && error.details !== undefined ? { details: error.details } : {}) };
  }
}

export const patchLead = (id: string, patch: { status?: ResellerLead['status']; note?: string }) =>
  attempt(() => api<{ lead: ResellerLead }>(`/api/admin/leads/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch, retries: 1 }));

export interface NewReseller {
  leadId?: string;
  name: string;
  whatsapp: string;
  city: string;
  uf: string;
  instagram?: string;
  slug?: string;
}
export const createReseller = (input: NewReseller, key: string) =>
  attempt(() => api<{ reseller: Reseller; invite: { token: string; expiresAt: string } | null }>('/api/admin/resellers', { json: input, headers: { 'Idempotency-Key': key }, retries: 2 }));

export const patchReseller = (reseller: Reseller, patch: Record<string, unknown>) =>
  attempt(() => api<{ reseller: Reseller }>(`/api/admin/resellers/${encodeURIComponent(reseller.id)}`, { method: 'PATCH', json: { ...patch, updatedAt: reseller.updatedAt }, retries: 1 }));

export const newInvite = (id: string) => attempt(() => api<{ invite: { token: string; expiresAt: string } }>(`/api/admin/resellers/${encodeURIComponent(id)}/invite`, { json: {}, retries: 1 }));

export const checkContract = (id: string) => attempt(() => api<{ reseller: Reseller }>(`/api/admin/resellers/${encodeURIComponent(id)}/contract-check`, { json: {}, retries: 1 }));

export interface KitLineInput {
  productId: string;
  variantId: string;
  size?: string;
  qty: number;
}
export const createKit = (resellerId: string, items: KitLineInput[]) =>
  attempt(() => ownWrite(() => api<{ kit: Kit; version?: number }>(`/api/admin/resellers/${encodeURIComponent(resellerId)}/kits`, { json: { items }, timeoutMs: 20_000 }), (r) => r.version));

export const editKit = (kit: Kit, items: KitLineInput[], updatedAt: string) =>
  attempt(() => ownWrite(() => api<{ kit: Kit; version?: number }>(`/api/admin/kits/${encodeURIComponent(kit.id)}/items`, { method: 'PUT', json: { items, updatedAt }, timeoutMs: 20_000 }), (r) => r.version));

export const settleKit = (kit: Kit, returned: { productId: string; variantId: string; size: string; qty: number }[], updatedAt: string) =>
  attempt(() => ownWrite(() => api<{ kit: Kit; version?: number }>(`/api/admin/kits/${encodeURIComponent(kit.id)}/settle`, { json: { returned, updatedAt }, retries: 1, timeoutMs: 20_000 }), (r) => r.version));

export const markKitPaid = (kit: Kit, paid: boolean) => attempt(() => api<{ kit: Kit }>(`/api/admin/kits/${encodeURIComponent(kit.id)}/paid`, { json: { paid }, retries: 1 }));

export const saveProgram = (program: Program) => attempt(() => api<{ program: Program }>('/api/admin/reseller-program', { method: 'PUT', json: { program }, retries: 1 }));

export const isError = (value: unknown): value is { error: string; details?: unknown } => !!value && typeof value === 'object' && 'error' in value;

export { idempotencyKey };

/** Public links of a reseller (absolute, for messages). */
export const inviteLink = (token: string) => `${window.location.origin}/revenda/convite/${token}`;
export const showcaseLink = (slug: string) => `${window.location.origin}/r/${slug}`;

/** Erases a reseller who left (LGPD): everything about her and the customers she registered. See handleEraseReseller. */
export const eraseReseller = (reseller: Reseller) =>
  attempt(() => api<{ erased: { kits: number; sales: number; leads: number } }>(`/api/admin/resellers/${encodeURIComponent(reseller.id)}/erase`, { json: { updatedAt: reseller.updatedAt }, retries: 0 }));

const money = (cents: number | undefined) => (cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','));

/**
 * Her settlements as a spreadsheet (pt-BR Excel: semicolons), for the owner's records before the data
 * is erased: one row per kit. Her customers are left out on purpose (they are erased too).
 */
export function settlementsCsv(reseller: Reseller, kits: Kit[]): string {
  return toCSV(
    ['Revendedora', 'Maleta aberta em', 'Acerto em', 'Vendido', 'Comissão (%)', 'Comissão', 'Peças que faltaram', 'Valor do acerto', 'Repasse recebido em'],
    [...kits]
      .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
      .map((k) => [
        reseller.name,
        formatDateTime(k.openedAt),
        k.closedAt ? formatDateTime(k.closedAt) : 'em aberto',
        money(k.settlement?.soldCents),
        k.settlement ? String(k.settlement.percent).replace('.', ',') : '',
        money(k.settlement?.commissionCents),
        money(k.settlement?.missingCents),
        money(k.settlement?.dueCents),
        k.settlement?.paidAt ? formatDateTime(k.settlement.paidAt) : '',
      ]),
    { delimiter: ';' },
  );
}

/** What still blocks erasing her data, in the owner's words (null when she can be erased). */
export function erasureBlocker(reseller: Reseller, kits: Kit[]): string | null {
  if (reseller.status !== 'encerrada') return 'Encerre a parceria antes de apagar os dados.';
  if (kits.some((k) => k.status === 'aberta')) return 'Faça o acerto da maleta antes de apagar os dados.';
  const unpaid = kits.reduce((sum, k) => sum + (k.settlement && !k.settlement.paidAt && k.settlement.dueCents > 0 ? k.settlement.dueCents : 0), 0);
  if (unpaid > 0) return `Ainda falta receber ${formatBRL(unpaid)} de acertos dela. Marque o repasse como recebido em "Acertos" antes de apagar.`;
  return null;
}
