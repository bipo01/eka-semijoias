import { create } from 'zustand';
import { cartSchema, type CartItem } from '../data/schema';
import { KEYS } from '../data/storage';
import { persistVisitorValue, readJSON } from './persisted';

export const MAX_QTY = 20;

export function cartKey(item: Pick<CartItem, 'productId' | 'variantId' | 'size'>): string {
  return `${item.productId}|${item.variantId}|${item.size ?? ''}`;
}

interface CartStore {
  items: CartItem[];
  add: (item: CartItem) => void;
  setQty: (key: string, qty: number) => void;
  /** Removes an item and returns it with its index, for undo. */
  remove: (key: string) => { item: CartItem; index: number } | null;
  restore: (item: CartItem, index: number) => void;
  clear: () => void;
  prune: (isValid: (item: CartItem) => boolean) => void;
}

const loadItems = (): CartItem[] =>
  readJSON(KEYS.cart, (raw) => {
    const parsed = cartSchema.safeParse(raw);
    return parsed.success ? parsed.data.items : null;
  }) ?? [];

const save = (items: CartItem[]) => persistVisitorValue(KEYS.cart, { items }, 'a sacola');

export const useCart = create<CartStore>()((set, get) => {
  const update = (items: CartItem[]) => {
    set({ items });
    save(items);
  };
  return {
    items: loadItems(),
    add: (item) => {
      const key = cartKey(item);
      const items = get().items;
      const existing = items.find((i) => cartKey(i) === key);
      update(
        existing
          ? items.map((i) => (i === existing ? { ...i, qty: Math.min(MAX_QTY, i.qty + item.qty) } : i))
          : [...items, { ...item, qty: Math.min(MAX_QTY, item.qty) }],
      );
    },
    setQty: (key, qty) => {
      const clamped = Math.max(1, Math.min(MAX_QTY, Math.round(qty)));
      update(get().items.map((i) => (cartKey(i) === key ? { ...i, qty: clamped } : i)));
    },
    remove: (key) => {
      const items = get().items;
      const index = items.findIndex((i) => cartKey(i) === key);
      const item = items[index];
      if (!item) return null;
      update(items.filter((_, i) => i !== index));
      return { item, index };
    },
    restore: (item, index) => {
      const items = get().items.filter((i) => cartKey(i) !== cartKey(item));
      items.splice(Math.min(index, items.length), 0, item);
      update(items);
    },
    clear: () => update([]),
    prune: (isValid) => {
      const items = get().items;
      const kept = items.filter(isValid);
      if (kept.length !== items.length) update(kept);
    },
  };
});

export const cartCount = (items: CartItem[]) => items.reduce((sum, i) => sum + i.qty, 0);
