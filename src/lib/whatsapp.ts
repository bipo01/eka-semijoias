import { formatBRL } from './format';
import { FINISH_LABEL, type CartItem, type Catalog } from '../data/schema';
import { effectivePrice, findVariant, isPurchasable, sizeLabel } from '../data/catalog';
import { stockOf } from '../data/stock';

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
  /** Number of the order registered on the site. */
  number?: number;
  /** True when the customer was shown the Pix payment. */
  pix?: boolean;
}

const greeting = (order: OrderDetails) => (order.number ? `Olá! Fiz o pedido nº ${order.number} pelo site:` : 'Olá! Gostaria de fazer este pedido:');
// Payment is agreed in the conversation; the Pix goes out afterwards as a payment link.
const paymentLine = (_order: OrderDetails) => null;

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
  const footer = [`Total: ${formatBRL(orderTotal(order.lines))}`, paymentLine(order), customerLine(order, ' · '), order.note?.trim() && `Obs.: ${order.note.trim()}`].filter(Boolean);
  return [greeting(order), '', ...items, '', ...footer].join('\n');
}

function buildCompact(order: OrderDetails): string {
  const items = order.lines.map((l, i) =>
    [`${i + 1}) ${l.name}`, l.finish.slice(0, 4), l.size, `${l.qty}x`, formatBRL(lineTotal(l))].filter(Boolean).join(' · '),
  );
  const footer = [`Total: ${formatBRL(orderTotal(order.lines))}`, paymentLine(order), customerLine(order, ' · '), order.note?.trim() && `Obs.: ${order.note.trim().slice(0, 300)}`].filter(Boolean);
  return [greeting(order), ...items, ...footer].join('\n');
}

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

export const productQuestionMessage = (name: string) => `Olá! Tenho uma dúvida sobre a peça ${name}.`;
export const generalMessage = 'Olá! Vim pelo site da ÉKA e gostaria de ajuda para escolher uma peça.';
export const notifyMeMessage = (name: string) => `Olá! A peça ${name} está esgotada no site. Pode me avisar quando voltar?`;

export interface ChargeMessageInput {
  number: number;
  firstName: string;
  items: { name: string; finish: string; size?: string; qty: number; lineCents: number }[];
  shippingCents: number;
  discountCents: number;
  amountCents: number;
  link: string;
  pixCode: string;
}

/** The message the owner sends with the payment link (pasted in the customer's chat). */
export function buildChargeMessage(c: ChargeMessageInput): string {
  const items = c.items.map((i) => [`• ${i.name}`, i.finish, i.size && sizeLabel(i.size), `${i.qty} un.`, formatBRL(i.lineCents)].filter(Boolean).join(' — '));
  return [
    `${c.firstName ? `Oi, ${c.firstName}!` : 'Oi!'} Seu pedido nº ${c.number} está confirmado.`,
    '',
    ...items,
    ...(c.shippingCents ? [`Frete: ${formatBRL(c.shippingCents)}`] : []),
    ...(c.discountCents ? [`Desconto: −${formatBRL(c.discountCents)}`] : []),
    `*Total: ${formatBRL(c.amountCents)}*`,
    '',
    'Para pagar com Pix e enviar o comprovante, é só abrir:',
    c.link,
    '',
    'Se preferir, use o Pix Copia e Cola:',
    c.pixCode,
  ].join('\n');
}
