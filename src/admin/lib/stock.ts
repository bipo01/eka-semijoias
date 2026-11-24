import { useCallback, useEffect, useState } from 'react';
import { effectivePrice } from '../../data/catalog';
import type { Product } from '../../data/schema';
import { comboKey, combosOf, ENTRY_MOTIVES, EXIT_MOTIVES, MOTIVE_LABEL, motiveKey, MOVE_NOTE_MAX, type MovementReason } from '../../data/stock';
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
  reason: MovementReason;
  orderNumber: number | null;
  /** Motive and the owner's note for entries/exits ("Compra do fornecedor — NF 123"). */
  note?: string | null;
  /** The reseller kit of a 'maleta' / 'retorno_maleta' movement. */
  kitId?: string | null;
  /** First name of the kit's reseller. */
  resellerName?: string | null;
}

/** Units of a combination with one reseller (open kit, minus what she sold). */
export interface KitHolding {
  kitId: string;
  resellerId: string;
  resellerName: string;
  qty: number;
}

export interface StockData {
  levels: StockLevel[];
  tracked: string[];
  movements: StockMovement[];
  /** Units with resellers per "productId|variantId|size". */
  inKits: Record<string, number>;
  kitsByCombo: Record<string, KitHolding[]>;
  /** The owner's own motives per kind ("Feira de artesanato"), alphabetical. */
  motives: SavedMotives;
}

export type SavedMotives = Record<MoveKind, string[]>;
export const NO_SAVED_MOTIVES: SavedMotives = { entrada: [], saida: [] };

/** "productId|variantId|size", the key of `inKits` / `kitsByCombo`. */
export const holdingKey = (productId: string, variantId: string, size: string) => `${productId}|${comboKey(variantId, size)}`;

// ---------------------------------------------------------------------------
// Entries and exits (POST /api/admin/stock/moves). The motives and their labels are shared with
// the server, which writes the label into the movement note (src/data/stock.ts).
// ---------------------------------------------------------------------------

export type MoveKind = 'entrada' | 'saida';
export const MOTIVES = {
  entrada: ENTRY_MOTIVES.map((id) => ({ id, label: MOTIVE_LABEL.entrada[id] })),
  saida: EXIT_MOTIVES.map((id) => ({ id, label: MOTIVE_LABEL.saida[id] })),
} satisfies Record<MoveKind, readonly { id: string; label: string }[]>;
export { MOVE_NOTE_MAX };

export interface MoveInput {
  kind: MoveKind;
  productId: string;
  variantId: string;
  size: string;
  qty: number;
  motive: string;
  /** Her own motive ("Outra entrada" → "Feira de artesanato"); the server saves it for next time. */
  motiveLabel?: string;
  note?: string;
}

export interface MoveResult {
  version: number;
  kind: MoveKind;
  qty: number;
  qtyAfter: number;
  note: string;
  trackingStarted: boolean;
}

/**
 * Registers an entry or exit. `key` (Idempotency-Key) must stay the same while retrying the same
 * move, so a lost answer never applies it twice. Rejects with an ApiError (409 "Só há N em estoque").
 */
export async function registerMove(input: MoveInput, key: string): Promise<MoveResult> {
  try {
    return await ownWrite(
      () => api<MoveResult>('/api/admin/stock/moves', { json: input, headers: { 'Idempotency-Key': key }, retries: 2, timeoutMs: 20_000 }),
      (r) => r.version,
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
    throw error;
  }
}

/** Her motives with one more (kept once, whatever the case or accents), in the server's order. */
export function withMotive(list: readonly string[], label: string): string[] {
  if (list.some((m) => motiveKey(m) === motiveKey(label))) return [...list];
  return [...list, label].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

/** Keeps (`saved`) or forgets one of her motives; answers with both lists as the server has them. */
export async function setStockMotive(kind: MoveKind, label: string, saved: boolean): Promise<SavedMotives> {
  try {
    const r = await api<{ motives: SavedMotives }>('/api/admin/stock-motives', { method: 'PUT', json: { kind, label, saved }, retries: 2 });
    return r.motives;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Overview (pure): per product and for the whole stock
// ---------------------------------------------------------------------------

export interface ProductStock {
  tracked: boolean;
  /** Units at home (stock_levels of the product's current combinations; 0 when not tracked). */
  home: number;
  /** Units with resellers (open kits, any product, tracked or not). */
  inKits: number;
  soldOut: boolean;
  low: boolean;
}

export function productStock(product: Product, data: Pick<StockData, 'levels' | 'tracked' | 'inKits'>, threshold: number): ProductStock {
  const tracked = data.tracked.includes(product.id);
  const combos = combosOf(product);
  const inKits = combos.reduce((sum, c) => sum + (data.inKits[holdingKey(product.id, c.variantId, c.size)] ?? 0), 0);
  if (!tracked) return { tracked, home: 0, inKits, soldOut: false, low: false };
  const qty = new Map(data.levels.filter((l) => l.productId === product.id).map((l) => [comboKey(l.variantId, l.size), l.qty]));
  const units = combos.map((c) => qty.get(comboKey(c.variantId, c.size)) ?? 0);
  const home = units.reduce((s, n) => s + n, 0);
  return { tracked, home, inKits, soldOut: home === 0, low: home > 0 && threshold > 0 && units.some((n) => n > 0 && n <= threshold) };
}

export interface StockOverview {
  home: number;
  inKits: number;
  total: number;
  /** (home + kits) × the product's selling price (promo when there is one), centavos. */
  valueCents: number;
  soldOut: number;
  low: number;
}

export function stockOverview(rows: { product: Product; stock: ProductStock }[]): StockOverview {
  const out: StockOverview = { home: 0, inKits: 0, total: 0, valueCents: 0, soldOut: 0, low: 0 };
  for (const { product, stock } of rows) {
    out.home += stock.home;
    out.inKits += stock.inKits;
    out.valueCents += (stock.home + stock.inKits) * effectivePrice(product);
    if (stock.tracked && stock.soldOut) out.soldOut++;
    if (stock.low) out.low++;
  }
  out.total = out.home + out.inKits;
  return out;
}

export type StockFilter = 'todas' | 'com-estoque' | 'esgotadas' | 'poucas' | 'maletas' | 'sem-controle';
export const STOCK_FILTERS: { id: StockFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'com-estoque', label: 'Com estoque' },
  { id: 'esgotadas', label: 'Esgotadas' },
  { id: 'poucas', label: 'Poucas unidades' },
  { id: 'maletas', label: 'Nas maletas' },
  { id: 'sem-controle', label: 'Sem controle' },
];

export function matchesFilter(stock: ProductStock, filter: StockFilter): boolean {
  switch (filter) {
    case 'todas':
      return true;
    case 'com-estoque':
      return stock.tracked && stock.home > 0;
    case 'esgotadas':
      return stock.tracked && stock.soldOut;
    case 'poucas':
      return stock.low;
    case 'maletas':
      return stock.inKits > 0;
    case 'sem-controle':
      return !stock.tracked;
  }
}

type StockState = { status: 'loading' } | { status: 'ready'; data: StockData } | { status: 'error'; message: string };

/** Exact stock from the server; refetches whenever the catalog version moves (every stock change bumps it). */
export function useStockData(): { state: StockState; reload: () => void; setMotives: (motives: SavedMotives) => void } {
  const [state, setState] = useState<StockState>({ status: 'loading' });
  const version = useCatalog((s) => s.version);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    api<StockData>('/api/admin/stock', { retries: 2 }).then(
      (data) => active && setState({ status: 'ready', data: { ...data, inKits: data.inKits ?? {}, kitsByCombo: data.kitsByCombo ?? {}, motives: data.motives ?? NO_SAVED_MOTIVES } }),
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

  // Her motives change without a new catalog version (forget / undo): applied here as the server answered.
  const setMotives = useCallback((motives: SavedMotives) => setState((s) => (s.status === 'ready' ? { ...s, data: { ...s.data, motives } } : s)), []);

  return { state, reload, setMotives };
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
