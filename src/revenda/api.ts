import type { CommissionState, Kit, KitLineState, ResellerSale, SaleRequest, Settlement } from '../data/revenda';
import type { ProductImage } from '../data/schema';
import { api } from '../lib/api';

/* The reseller panel's API client (docs/revenda/PLAN.md §3). */

export interface Me {
  reseller: { id: string; name: string; firstName: string; slug: string; whatsapp: string; city: string; uf: string; status: string; contract: { acceptedAt: string; version: number } | null };
  kit: (Kit & { lines: KitLineState[]; valueCents: number }) | null;
  sales: ResellerSale[];
  commission: CommissionState | null;
  soldCents: number;
  earnings: { receivedCents: number; projectedCents: number; totalCents: number };
  history: { id: string; openedAt: string; closedAt?: string; settlement?: Settlement }[];
  images: Record<string, ProductImage>;
}

export interface InviteView {
  firstName: string;
  name: string;
  hasPin: boolean;
  contract: { mode: 'aceite' | 'link'; title: string; version: number; text?: string; url?: string } | null;
}

export const fetchMe = () => api<Me>('/api/revenda/me', { retries: 2 });
export const login = (whatsapp: string, pin: string) => api<{ ok: true }>('/api/revenda/login', { json: { whatsapp, pin } });
export const logout = () => api<{ ok: true }>('/api/revenda/logout', { json: {} });
export const fetchInvite = (token: string) => api<InviteView>(`/api/revenda/invite/${encodeURIComponent(token)}`, { retries: 1 });
export const acceptInvite = (token: string, body: { pin: string; contract?: { version: number; typedName?: string; signedExternal?: true } }) =>
  api<{ ok: true }>(`/api/revenda/invite/${encodeURIComponent(token)}`, { json: body });
export const registerSale = (sale: SaleRequest, key: string) => api<{ sale: ResellerSale }>('/api/revenda/sales', { json: sale, headers: { 'Idempotency-Key': key }, retries: 2 });
export const cancelSale = (id: string) => api<{ sale: ResellerSale }>(`/api/revenda/sales/${encodeURIComponent(id)}/cancel`, { json: {}, retries: 1 });
