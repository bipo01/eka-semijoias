import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { ownWrite, useCatalog } from '../../store/catalog';
import { signalSessionLost } from './session';

export interface StockLevel {
  productId: string;
  variantId: string;
  size: string;
  qty: number;
  updatedAt: string;
}

export interface StockMovement {
  id: number;
  at: string;
  productId: string;
  variantId: string;
  size: string;
  delta: number;
  qtyAfter: number;
  reason: 'ajuste' | 'pedido' | 'devolucao';
  orderNumber: number | null;
}

export interface StockData {
  levels: StockLevel[];
  tracked: string[];
  movements: StockMovement[];
}

type StockState = { status: 'loading' } | { status: 'ready'; data: StockData } | { status: 'error'; message: string };

/** Exact stock from the server; refetches whenever the catalog version moves (every stock change bumps it). */
export function useStockData(): { state: StockState; reload: () => void } {
  const [state, setState] = useState<StockState>({ status: 'loading' });
  const version = useCatalog((s) => s.version);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    api<StockData>('/api/admin/stock', { retries: 2 }).then(
      (data) => active && setState({ status: 'ready', data }),
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
        setState((s) => (s.status === 'ready' ? s : { status: 'error', message: errorMessage(error) }));
      },
    );
    return () => {
      active = false;
    };
  }, [version, tick]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setTick((t) => t + 1);
  }, []);

  return { state, reload };
}

export interface StockLevelInput {
  variantId: string;
  size: string;
  qty: number;
  expected: number | null;
}

/** Saves a product's stock. Resolves to an error (with `conflict` when someone else changed it) or null. */
export async function saveStock(productId: string, tracked: boolean, levels: StockLevelInput[]): Promise<{ message: string; conflict: boolean } | null> {
  try {
    // Shows the new public stock right away (the live update follows anyway), as our own change.
    await ownWrite(
      () => api<{ version: number }>(`/api/admin/stock/${encodeURIComponent(productId)}`, { method: 'PUT', json: { tracked, levels }, timeoutMs: 20_000 }),
      (r) => r.version,
    );
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
    return { message: errorMessage(error), conflict: error instanceof ApiError && error.status === 409 };
  }
}
