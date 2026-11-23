import { formatBRL } from './format';
import { FINISH_LABEL, type CartItem, type Catalog } from '../data/schema';
import { effectivePrice, findVariant, isPurchasable, sizeLabel } from '../data/catalog';

/** Messages above this length switch to the compact format (wa.me links get unreliable when very long). */
export const COMPACT_THRESHOLD = 1800;

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

export interface OrderDetails {
  lines: OrderLine[];
  name?: string;
  city?: string;
  note?: string;
}

export const lineTotal = (line: OrderLine) => line.unitCents * line.qty;
export const orderTotal = (lines: OrderLine[]) => lines.reduce((sum, l) => sum + lineTotal(l), 0);

function customerLine(order: OrderDetails, sep: string): string | null {
  const parts = [order.name?.trim() && `Nome: ${order.name.trim()}`, order.city?.trim() && `Cidade: ${order.city.trim()}`].filter(Boolean);
  return parts.length ? parts.join(sep) : null;
}

export function buildOrderMessage(order: OrderDetails): string {
  const full = buildFull(order);
  return full.length > COMPACT_THRESHOLD ? buildCompact(order) : full;
}

function buildFull(order: OrderDetails): string {
  const items = order.lines.map((l, i) =>
    [`${i + 1}) ${l.name}`, l.finish, l.size && sizeLabel(l.size), `${l.qty} un.`, formatBRL(lineTotal(l))].filter(Boolean).join(' — '),
  );
  const footer = [`Total: ${formatBRL(orderTotal(order.lines))}`, customerLine(order, ' · '), order.note?.trim() && `Obs.: ${order.note.trim()}`].filter(Boolean);
  return ['Olá! Gostaria de fazer este pedido:', '', ...items, '', ...footer].join('\n');
}

function buildCompact(order: OrderDetails): string {
  const items = order.lines.map((l, i) =>
    [`${i + 1}) ${l.name}`, l.finish.slice(0, 4), l.size, `${l.qty}x`, formatBRL(lineTotal(l))].filter(Boolean).join(' · '),
  );
  const footer = [`Total: ${formatBRL(orderTotal(order.lines))}`, customerLine(order, ' · '), order.note?.trim() && `Obs.: ${order.note.trim().slice(0, 300)}`].filter(Boolean);
  return ['Olá! Gostaria de fazer este pedido:', ...items, ...footer].join('\n');
}

/** Resolves cart items against the catalog. Items whose product is gone or unavailable are reported separately. */
export function resolveCart(items: CartItem[], data: Catalog) {
  const lines: (OrderLine & { key: string; item: CartItem })[] = [];
  const unavailable: CartItem[] = [];
  for (const item of items) {
    const product = data.products.find((p) => p.id === item.productId);
    const variant = product && findVariant(product, item.variantId);
    if (!product || !variant || !isPurchasable(product) || !variant.available) {
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
    });
  }
  return { lines, unavailable };
}

export const productQuestionMessage = (name: string) => `Olá! Tenho uma dúvida sobre a peça ${name}.`;
export const generalMessage = 'Olá! Vim pelo site da ÉKA e gostaria de ajuda para escolher uma peça.';
export const notifyMeMessage = (name: string) => `Olá! A peça ${name} está esgotada no site. Pode me avisar quando voltar?`;
