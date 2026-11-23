import { FINISH_LABEL, type CartItem, type Catalog } from '../data/schema';
import { effectivePrice, findVariant, isPurchasable } from '../data/catalog';
import { stockOf } from '../data/stock';

export function whatsappUrl(number: string | null | undefined, text: string): string {
  const digits = (number ?? '').replace(/\D/g, '');
  const encoded = encodeURIComponent(text);
  // Without a number WhatsApp opens the contact picker, so the message still goes through.
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export interface OrderLine {
  name: string;
  finish: string;
  size?: string;
  qty: number;
  unitCents: number;
}

export const lineTotal = (line: OrderLine) => line.unitCents * line.qty;
export const orderTotal = (lines: OrderLine[]) => lines.reduce((sum, l) => sum + lineTotal(l), 0);

/**
 * Resolves cart items against the catalog. Items whose product is gone,
 * unavailable or out of stock are reported separately; `available` is the
 * stock of the line's combination (null without stock control).
 */
export function resolveCart(items: CartItem[], data: Catalog) {
  const lines: (OrderLine & { key: string; item: CartItem; available: number | null })[] = [];
  const unavailable: CartItem[] = [];
  for (const item of items) {
    const product = data.products.find((p) => p.id === item.productId);
    const variant = product && findVariant(product, item.variantId);
    const available = product && variant ? stockOf(data.stock, product.id, variant.id, item.size) : null;
    if (!product || !variant || !isPurchasable(product, data.stock) || !variant.available || available === 0) {
      unavailable.push(item);
      continue;
    }
    lines.push({
      key: `${item.productId}|${item.variantId}|${item.size ?? ''}`,
      item,
      name: product.name,
      finish: FINISH_LABEL[variant.finish],
      ...(item.size ? { size: item.size } : {}),
      qty: item.qty,
      unitCents: effectivePrice(product),
      available,
    });
  }
  return { lines, unavailable };
}
