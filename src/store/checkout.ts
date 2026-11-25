import { create } from 'zustand';
import type { CartItem } from '../data/schema';
import type { OrderItem } from '../data/orders';

export const cartSignature = (items: CartItem[]) => JSON.stringify(items.map((i) => [i.productId, i.variantId, i.size ?? '', i.qty]));

/*
 * The order the bag just registered. Kept in memory (not storage) so the
 * confirmation, the Pix and the WhatsApp button survive closing and reopening
 * the bag during the visit, and disappear once the customer starts a new one.
 */

export interface RegisteredOrder {
  id: string;
  number: number;
  createdAt: string;
  items: OrderItem[];
  totalCents: number;
  pix: boolean;
  name: string;
  city: string;
  note?: string;
}

interface CheckoutStore {
  order: RegisteredOrder | null;
  /** The bag the order was registered from: a different bag means a new order. */
  cartSignature: string;
  /** True once the customer tapped "Enviar pelo WhatsApp". */
  sent: boolean;
  setOrder: (order: RegisteredOrder, cartSignature: string) => void;
  markSent: () => void;
  reset: () => void;
}

export const useCheckout = create<CheckoutStore>()((set) => ({
  order: null,
  cartSignature: '',
  sent: false,
  setOrder: (order, cartSignature) => set({ order, cartSignature, sent: false }),
  markSent: () => set({ sent: true }),
  reset: () => set({ order: null, cartSignature: '', sent: false }),
}));
