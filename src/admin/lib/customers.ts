import { useEffect } from 'react';
import { z } from 'zod';
import { create } from 'zustand';
import { customerRecordSchema, nameKey, phoneDigits, warrantyText, warrantyUntil, type CustomerInput } from '../../data/customers';
import type { MessageVars } from '../../data/messages';
import { IS_SALE, orderSchema, type Order } from '../../data/orders';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useCatalog } from '../../store/catalog';
import { useOrders } from './orders';
import { signalSessionLost } from './session';

/*
 * Customers in the admin (Painel → Clientes, the order's customer picker and
 * the "Compra registrada" message). One shared list, loaded on demand and
 * refreshed when orders change (her numbers come from her orders). Writes
 * change the list only after the server confirms.
 */

export const customerStatsSchema = z.object({
  orders: z.number().int().min(0),
  purchases: z.number().int().min(0),
  spentCents: z.number().int().min(0),
  lastPurchaseAt: z.string().max(40).nullable(),
});
export type CustomerStats = z.infer<typeof customerStatsSchema>;

export const customerSchema = customerRecordSchema.extend({ stats: customerStatsSchema });
export type Customer = z.infer<typeof customerSchema>;

export const EMPTY_STATS: CustomerStats = { orders: 0, purchases: 0, spentCents: 0, lastPurchaseAt: null };

// ---------------------------------------------------------------------------
// Pure rules (unit-tested)
// ---------------------------------------------------------------------------

/** Accent-insensitive match on name and city; digits match the WhatsApp. */
export function matchesCustomer(customer: Pick<Customer, 'name' | 'city' | 'whatsapp' | 'instagram'>, query: string): boolean {
  const q = nameKey(query);
  if (!q) return true;
  const digits = phoneDigits(query);
  if (digits.length >= 3 && customer.whatsapp.includes(digits)) return true;
  return nameKey(`${customer.name} ${customer.city} ${customer.instagram ?? ''}`).includes(q.replace(/^@/, ''));
}

/** Formats a birthday while typing: "2503" → "25/03". */
export function maskBirthday(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** Null when the birthday is empty or a real day of the year ("DD/MM"). */
export function birthdayProblem(value: string): string | null {
  if (!value) return null;
  const m = /^(\d{2})\/(\d{2})$/.exec(value);
  const max = m ? [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(m[2]) - 1] : undefined;
  return m && max && Number(m[1]) >= 1 && Number(m[1]) <= max ? null : 'Use dia e mês, por exemplo 25/03.';
}

/** When the order became a sale (first confirmation), for the warranty; its creation when it never was one. */
export function purchaseDate(order: Pick<Order, 'createdAt' | 'history'>): string {
  return order.history.find((h) => IS_SALE.has(h.status) && !h.event)?.at ?? order.createdAt;
}

/** The warranty variables of the "Compra registrada" message; all empty without a warranty (the lines disappear). */
export function warrantyVars(order: Pick<Order, 'createdAt' | 'history'>, settings: { warrantyMonths: number; warrantyTerms?: string | undefined }): MessageVars {
  const months = settings.warrantyMonths;
  if (!months || months <= 0) return { garantia: '', garantia_ate: '', garantia_regras: '' };
  return { garantia: warrantyText(months), garantia_ate: warrantyUntil(purchaseDate(order), months), garantia_regras: settings.warrantyTerms?.trim() ?? '' };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type CustomersState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; customers: Customer[] } | { status: 'error'; message: string };

interface CustomersStore {
  state: CustomersState;
  load: () => Promise<void>;
  /** Loads once (pickers and the order detail); the Clientes page reloads on its own. */
  ensure: () => void;
  upsert: (customer: Customer) => void;
  drop: (id: string) => void;
}

let seq = 0;

const parseCustomers = (raw: unknown): Customer[] =>
  ((raw as { customers?: unknown[] } | null)?.customers ?? []).flatMap((c) => {
    const parsed = customerSchema.safeParse(c);
    return parsed.success ? [parsed.data] : [];
  });

const lost = (error: unknown) => {
  if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
};

export const useCustomers = create<CustomersStore>()((set, get) => ({
  state: { status: 'idle' },
  load: async () => {
    const mine = ++seq;
    if (get().state.status !== 'ready') set({ state: { status: 'loading' } });
    try {
      const raw = await api<unknown>('/api/admin/customers', { retries: 2 });
      if (mine === seq) set({ state: { status: 'ready', customers: parseCustomers(raw) } });
    } catch (error) {
      if (mine !== seq) return;
      lost(error);
      // Keep the last list if there is one.
      if (get().state.status !== 'ready') set({ state: { status: 'error', message: errorMessage(error) } });
    }
  },
  ensure: () => {
    const { status } = get().state;
    if (status === 'idle' || status === 'error') void get().load();
  },
  upsert: (customer) =>
    set((s) => {
      if (s.state.status !== 'ready') return s;
      const exists = s.state.customers.some((c) => c.id === customer.id);
      return { state: { status: 'ready', customers: exists ? s.state.customers.map((c) => (c.id === customer.id ? customer : c)) : [customer, ...s.state.customers] } };
    }),
  drop: (id) => set((s) => (s.state.status === 'ready' ? { state: { status: 'ready', customers: s.state.customers.filter((c) => c.id !== id) } } : s)),
}));

/** The list (loaded on first use); refreshed when orders change, since her numbers come from them. */
export function useCustomerList(): CustomersState {
  const state = useCustomers((s) => s.state);
  const ordersVersion = useCatalog((s) => s.ordersVersion);
  useEffect(() => {
    void useCustomers.getState().load();
  }, [ordersVersion]);
  return state;
}

/** One customer from the shared list (loads it on first use). */
export function useCustomer(id: string | undefined): Customer | null {
  useEffect(() => {
    if (id) useCustomers.getState().ensure();
  }, [id]);
  return useCustomers((s) => (id && s.state.status === 'ready' ? (s.state.customers.find((c) => c.id === id) ?? null) : null));
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export type CustomerFailure = { error: string; field?: string; existing?: Customer };

function failure(error: unknown): CustomerFailure {
  lost(error);
  const details = error instanceof ApiError ? (error.details as { customer?: unknown; reason?: string } | { path: string }[] | undefined) : undefined;
  if (error instanceof ApiError && error.status === 409 && details && !Array.isArray(details) && details.reason === 'whatsapp') {
    const existing = customerSchema.safeParse({ stats: EMPTY_STATS, ...(details.customer as object) });
    return { error: errorMessage(error), field: 'whatsapp', ...(existing.success ? { existing: existing.data } : {}) };
  }
  const field = Array.isArray(details) ? details[0]?.path.split('.')[0] : undefined;
  return { error: errorMessage(error), ...(field ? { field } : {}) };
}

/** Registers a customer. `key` (Idempotency-Key) stays the same while the form does not change. */
export async function createCustomer(input: CustomerInput, key: string): Promise<{ customer: Customer } | CustomerFailure> {
  try {
    const result = await api<{ customer: unknown }>('/api/admin/customers', { json: input, headers: { 'Idempotency-Key': key }, retries: 2 });
    const customer = customerSchema.parse(result.customer);
    useCustomers.getState().upsert(customer);
    return { customer };
  } catch (error) {
    return failure(error);
  }
}

/** Saves her data (compare-and-swap on the version the form started from). */
export async function updateCustomer(customer: Customer, input: CustomerInput): Promise<{ customer: Customer } | CustomerFailure> {
  try {
    const result = await api<{ customer: unknown }>(`/api/admin/customers/${encodeURIComponent(customer.id)}`, {
      method: 'PUT',
      json: { ...input, updatedAt: customer.updatedAt },
      retries: 2, // the version makes a repeated request harmless
    });
    const next = customerSchema.parse({ stats: customer.stats, ...(result.customer as object) });
    useCustomers.getState().upsert(next);
    return { customer: next };
  } catch (error) {
    // A version conflict carries the stored record: show it, so the next save starts from it.
    const details = error instanceof ApiError && error.status === 409 ? (error.details as { customer?: object; reason?: string } | undefined) : undefined;
    if (details?.customer && details.reason !== 'whatsapp') {
      const current = customerSchema.safeParse({ stats: customer.stats, ...details.customer });
      if (current.success) useCustomers.getState().upsert(current.data);
    }
    return failure(error);
  }
}

/** Erases a customer (her orders stay, unlinked). Resolves to an error message, or null. */
export async function deleteCustomer(id: string): Promise<string | null> {
  try {
    await api<{ deleted: boolean }>(`/api/admin/customers/${encodeURIComponent(id)}`, { method: 'DELETE', retries: 1 });
    useCustomers.getState().drop(id);
    return null;
  } catch (error) {
    lost(error);
    return errorMessage(error);
  }
}

/** Her record, numbers and orders, fresh from the server. */
export async function fetchCustomer(id: string): Promise<{ customer: Customer; orders: Order[] }> {
  try {
    const raw = await api<{ customer: unknown; orders: unknown[] }>(`/api/admin/customers/${encodeURIComponent(id)}`, { retries: 2 });
    const customer = customerSchema.parse(raw.customer);
    useCustomers.getState().upsert(customer);
    const orders = (raw.orders ?? []).flatMap((o) => {
      const parsed = orderSchema.safeParse(o);
      return parsed.success ? [parsed.data] : [];
    });
    return { customer, orders };
  } catch (error) {
    lost(error);
    if (error instanceof ApiError && error.status === 404) useCustomers.getState().drop(id);
    throw error;
  }
}

/** Links (or, with null, unlinks) a customer to an order. Resolves to an error message, or null. */
export async function linkOrderCustomer(order: Order, customerId: string | null): Promise<string | null> {
  try {
    const result = await api<{ order: unknown }>(`/api/admin/orders/${encodeURIComponent(order.id)}/customer`, { json: { customerId }, retries: 2 });
    useOrders.getState().replace(orderSchema.parse(result.order));
    return null;
  } catch (error) {
    lost(error);
    if (error instanceof ApiError && error.status === 409) {
      const current = orderSchema.safeParse((error.details as { order?: unknown } | undefined)?.order);
      if (current.success) useOrders.getState().replace(current.data);
    }
    return errorMessage(error);
  }
}
