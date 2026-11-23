import { useEffect } from 'react';
import { create } from 'zustand';
import { orderSchema, type Order, type OrderStatus } from '../../data/orders';
import { api, apiUrl, ApiError, errorMessage } from '../../lib/api';
import { ownWrite, useCatalog } from '../../store/catalog';
import { signalSessionLost } from './session';

/*
 * Orders in the admin: one shared list (Pedidos, Relatório and the tab badge
 * read it), loaded once and refetched when the live channel says orders
 * changed. Mutations update the list only after the server confirms.
 */

type OrdersState = { status: 'loading' } | { status: 'ready'; orders: Order[] } | { status: 'error'; message: string };

interface OrdersStore {
  state: OrdersState;
  load: () => Promise<void>;
  replace: (order: Order) => void;
  drop: (id: string) => void;
}

let seq = 0;

const parseOrders = (raw: unknown): Order[] => {
  const list = (raw as { orders?: unknown[] } | null)?.orders ?? [];
  // Skip (never crash on) a row the browser cannot read; the server validated it on the way in.
  return list.flatMap((o) => {
    const parsed = orderSchema.safeParse(o);
    return parsed.success ? [parsed.data] : [];
  });
};

export const useOrders = create<OrdersStore>()((set, get) => ({
  state: { status: 'loading' },
  load: async () => {
    const mine = ++seq;
    try {
      const raw = await api<unknown>('/api/admin/orders', { retries: 2 });
      if (mine === seq) set({ state: { status: 'ready', orders: parseOrders(raw) } });
    } catch (error) {
      if (mine !== seq) return;
      if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
      // Keep showing the last list if there is one; the next live update retries.
      if (get().state.status !== 'ready') set({ state: { status: 'error', message: errorMessage(error) } });
    }
  },
  replace: (order) =>
    set((s) => (s.state.status === 'ready' ? { state: { status: 'ready', orders: s.state.orders.map((o) => (o.id === order.id ? order : o)) } } : s)),
  drop: (id) => set((s) => (s.state.status === 'ready' ? { state: { status: 'ready', orders: s.state.orders.filter((o) => o.id !== id) } } : s)),
}));

/** Loads the orders and refetches on every live "orders" message. Mount once (the admin shell). */
export function useOrdersSync(): void {
  const ordersVersion = useCatalog((s) => s.ordersVersion);
  useEffect(() => {
    void useOrders.getState().load();
  }, [ordersVersion]);
}

/** Resolves to an error message, or null on success. */
async function run(action: () => Promise<{ order?: Order; deleted?: boolean }>, onOk: (r: { order?: Order; deleted?: boolean }) => void): Promise<string | null> {
  try {
    const result = await action();
    onOk(result);
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unauthenticated') {
      signalSessionLost();
      return 'Sua sessão terminou. Entre de novo com o PIN.';
    }
    if (error instanceof ApiError && error.status === 409) {
      const current = (error.details as { order?: unknown } | undefined)?.order;
      const parsed = orderSchema.safeParse(current);
      if (parsed.success) useOrders.getState().replace(parsed.data);
      else void useOrders.getState().load();
    }
    return errorMessage(error);
  }
}

export function changeOrderStatus(order: Order, to: OrderStatus): Promise<string | null> {
  return run(
    () =>
      ownWrite(
        () => api<{ order: Order; version?: number }>(`/api/admin/orders/${encodeURIComponent(order.id)}/status`, { json: { from: order.status, to }, retries: 2, timeoutMs: 20_000 }),
        (r) => r.version,
      ),
    (r) => r.order && useOrders.getState().replace(orderSchema.parse(r.order)),
  );
}

export function anonymizeOrder(order: Order): Promise<string | null> {
  return run(
    () => api<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(order.id)}/anonymize`, { json: {}, retries: 1 }),
    (r) => r.order && useOrders.getState().replace(orderSchema.parse(r.order)),
  );
}

export function deleteOrder(order: Order): Promise<string | null> {
  return run(
    () => api<{ deleted: boolean }>(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: 'DELETE', retries: 1 }),
    () => useOrders.getState().drop(order.id),
  );
}

/** Creates (or updates) the Pix charge of a confirmed order. Resolves to the updated order or an error message. */
export async function chargeOrder(order: Order, shippingCents: number, discountCents: number): Promise<{ order: Order } | { error: string }> {
  try {
    const result = await api<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(order.id)}/charge`, { json: { shippingCents, discountCents }, retries: 2, timeoutMs: 20_000 });
    const next = orderSchema.parse(result.order);
    useOrders.getState().replace(next);
    return { order: next };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
    return { error: errorMessage(error) };
  }
}

/** The public payment link of a charge. */
export const paymentLink = (token: string) => `${window.location.origin}/pagamento/${token}`;

export const receiptUrl = (id: string) => apiUrl(`/api/admin/receipts/${encodeURIComponent(id)}`);

/** Fetches a receipt as an object URL (images are shown inline; the admin session cookie goes along). */
export async function receiptObjectUrl(id: string): Promise<string> {
  const response = await fetch(receiptUrl(id), { credentials: 'same-origin' });
  if (response.status === 401) {
    signalSessionLost();
    throw new ApiError(401, 'unauthenticated', 'Sua sessão terminou.');
  }
  if (!response.ok) throw new ApiError(response.status, 'http_error', 'Não foi possível abrir o comprovante.');
  return URL.createObjectURL(await response.blob());
}
