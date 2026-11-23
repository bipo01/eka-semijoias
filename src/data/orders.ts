import { z } from 'zod';
import { effectivePrice, findVariant, isPurchasable } from './catalog';
import { FINISHES, FINISH_LABEL, type Catalog, type Finish } from './schema';
import { comboKey, stockOf } from './stock';

/*
 * Orders (shared by the browser and the Worker). An order is registered when
 * the customer taps "Finalizar pedido"; the server prices it from the catalog
 * snapshot. Stock moves only when the owner confirms it in the admin.
 */

export const ORDER_STATUSES = ['enviado', 'confirmado', 'pago', 'entregue', 'cancelado'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  enviado: 'Em negociação',
  confirmado: 'Confirmado',
  pago: 'Pago',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

/** Statuses whose items are taken out of stock. */
export const HOLDS_STOCK: ReadonlySet<OrderStatus> = new Set(['confirmado', 'pago', 'entregue']);
/** Statuses counted as sales in the report. */
export const IS_SALE: ReadonlySet<OrderStatus> = HOLDS_STOCK;

/** Allowed moves: the next step, undoing the last step, cancelling, reopening. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  enviado: ['confirmado', 'cancelado'],
  confirmado: ['pago', 'enviado', 'cancelado'],
  pago: ['entregue', 'confirmado', 'cancelado'],
  entregue: ['pago'],
  cancelado: ['enviado'],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) => TRANSITIONS[from].includes(to);

/** The forward step offered as the main action. */
export const NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  enviado: { to: 'confirmado', label: 'Confirmar pedido' },
  confirmado: { to: 'pago', label: 'Marcar como pago' },
  pago: { to: 'entregue', label: 'Marcar como entregue' },
  cancelado: { to: 'enviado', label: 'Reabrir pedido' },
};

/** The backward step offered as "Desfazer". */
export const UNDO_STEP: Partial<Record<OrderStatus, OrderStatus>> = { confirmado: 'enviado', pago: 'confirmado', entregue: 'pago' };

export const MAX_ORDER_ITEMS = 50;
export const MAX_ORDER_LINE_QTY = 20;
export const FIRST_ORDER_NUMBER = 1001;
export const ANONYMIZED_NAME = 'Cliente removida';

const id = z.string().min(1).max(64);
const isoDate = z.string().max(40);
const personText = (min: number, max: number, message: string) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min, message).max(max, message));

/** What the bag sends (POST /api/orders). Prices are never sent: the server computes them. */
export const orderRequestSchema = z.object({
  items: z
    .array(
      z.object({
        productId: id,
        variantId: id,
        size: z.string().max(12).optional(),
        qty: z.number().int().min(1).max(MAX_ORDER_LINE_QTY),
      }),
    )
    .min(1, 'A sacola está vazia.')
    .max(MAX_ORDER_ITEMS, 'Pedido grande demais. Divida em dois pedidos.'),
  name: personText(2, 80, 'Informe seu nome.'),
  city: personText(2, 80, 'Informe sua cidade.'),
  note: z
    .string()
    .max(300)
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
  /** Honeypot: hidden from people; bots fill it. */
  website: z.string().max(200).optional(),
});
export type OrderRequest = z.input<typeof orderRequestSchema>;

const orderLinesSchema = orderRequestSchema.shape.items;

/** A sale registered by the owner in the admin (it came straight through WhatsApp or in person). */
export const adminOrderRequestSchema = z.object({
  items: orderLinesSchema,
  name: personText(2, 80, 'Informe o nome da cliente.'),
  city: z
    .string()
    .max(80, 'Cidade longa demais.')
    .optional()
    .transform((v) => v?.replace(/\s+/g, ' ').trim() ?? ''),
  note: z
    .string()
    .max(300, 'Observação longa demais (até 300 caracteres).')
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
  status: z.enum(['enviado', 'confirmado']),
});
export type AdminOrderRequest = z.input<typeof adminOrderRequestSchema>;

/** New items for an order (PUT /api/admin/orders/:id/items); `stamp` is the order's updatedAt the editor started from. */
export const editItemsRequestSchema = z.object({ items: orderLinesSchema, stamp: z.string().min(1).max(40) });

/** Statuses whose items can still be changed. */
export const EDITABLE_ITEMS: ReadonlySet<OrderStatus> = new Set(['enviado', 'confirmado']);

export const orderItemSchema = z.object({
  productId: id,
  variantId: id,
  size: z.string().max(12).optional(),
  qty: z.number().int().min(1).max(MAX_ORDER_LINE_QTY),
  name: z.string().max(120),
  finish: z.enum(FINISHES),
  sku: z.string().max(40).optional(),
  categoryId: id,
  categoryName: z.string().max(60),
  unitCents: z.number().int().min(0),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];
/**
 * Per receipt, as stored. D1 rows allow 2 MB, but the binding serializes BLOBs as JSON number
 * arrays, which costs CPU (Free plan: 10 ms per request); receipts are stored as base64 text and
 * kept small (production: ~600 KB cost 16 ms to store, ~5 ms to read).
 */
export const RECEIPT_MAX_BYTES = 700_000;
export const MAX_RECEIPTS_PER_ORDER = 6;

/** An automatic Pix created at Mercado Pago for the current charge (dynamic QR, confirmed by webhook). */
export const mpPixSchema = z.object({
  /** Mercado Pago payment id. */
  id: z.string().regex(/^\d{1,20}$/),
  /** Pix copia e cola of that payment. */
  qr: z.string().min(10).max(1000),
  expiresAt: isoDate,
  /** How many payments were created for this charge (the next one's idempotency key). */
  seq: z.number().int().min(1).max(50),
});
export type MpPix = z.infer<typeof mpPixSchema>;

/** The current Pix charge of an order: what the payment link asks for. */
export const chargeSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  shippingCents: z.number().int().min(0).max(10_000_000),
  discountCents: z.number().int().min(0).max(100_000_000),
  amountCents: z.number().int().min(1).max(100_000_000),
  createdAt: isoDate,
  mp: mpPixSchema.optional(),
  /** Set when Mercado Pago confirmed the payment (the order moved to "pago" by itself). */
  paidBy: z.literal('mercadopago').optional(),
});
export type Charge = z.infer<typeof chargeSchema>;

export const receiptMetaSchema = z.object({
  id,
  at: isoDate,
  contentType: z.enum(RECEIPT_TYPES),
  size: z.number().int().min(1).max(RECEIPT_MAX_BYTES),
  /** The charge (payment link) the receipt answered; a new amount starts a new charge. */
  chargeToken: z.string().max(64).optional(),
});
export type ReceiptMeta = z.infer<typeof receiptMetaSchema>;

/** Amount of a charge: items + shipping − discount (never below one centavo). */
export function chargeAmount(totalCents: number, shippingCents: number, discountCents: number): number {
  return totalCents + shippingCents - discountCents;
}

export const stockMoveSchema = z.object({ productId: id, variantId: id, size: z.string().max(12), qty: z.number().int().min(1) });
export type StockMove = z.infer<typeof stockMoveSchema>;

export const orderSchema = z.object({
  id,
  number: z.number().int().positive(),
  status: z.enum(ORDER_STATUSES),
  createdAt: isoDate,
  updatedAt: isoDate,
  customer: z.object({ name: z.string().max(80), city: z.string().max(80) }),
  note: z.string().max(300).optional(),
  items: z.array(orderItemSchema).min(1).max(MAX_ORDER_ITEMS),
  totalCents: z.number().int().min(0),
  /** Whether the Pix payment block was shown to the customer. */
  pix: z.boolean(),
  /** Status changes; `event: 'itens'` marks an edit of the items (the status did not change). */
  history: z.array(z.object({ at: isoDate, status: z.enum(ORDER_STATUSES), event: z.literal('itens').optional() })).max(200),
  /** 'manual': registered by the owner in the admin. Absent: the site's bag. */
  source: z.literal('manual').optional(),
  /** Exactly what was taken out of stock while the order holds stock (given back on the way out). */
  stockMoves: z.array(stockMoveSchema).max(MAX_ORDER_ITEMS).optional(),
  anonymized: z.boolean().optional(),
  charge: chargeSchema.optional(),
  receipts: z.array(receiptMetaSchema).max(MAX_RECEIPTS_PER_ORDER).optional(),
  /**
   * Approved Mercado Pago payments that could not settle this order (an old charge, a second payment,
   * an order no longer awaiting payment): the money arrived, so the owner must see it and decide.
   */
  strayPayments: z.array(z.object({ id: z.string().max(24), amountCents: z.number().int().min(0), at: isoDate })).max(10).optional(),
});
export type Order = z.infer<typeof orderSchema>;

/** What the sale is worth for the report: the items minus any discount (shipping is not a sale). */
export const saleCents = (order: Pick<Order, 'totalCents' | 'charge'>) => Math.max(0, order.totalCents - (order.charge?.discountCents ?? 0));

/** True when a receipt arrived and the payment is still to be checked. */
export const awaitingReview = (order: Pick<Order, 'status' | 'receipts'>) => !!order.receipts?.length && (order.status === 'enviado' || order.status === 'confirmado');

/** The public payment page (GET /api/pay/:token): no personal data beyond the first name. */
export type PayState = 'aguardando' | 'analise' | 'pago' | 'cancelado';
export interface PayView {
  number: number;
  firstName: string;
  items: { name: string; finish: Finish; size?: string; qty: number; lineCents: number }[];
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  amountCents: number;
  state: PayState;
  receipts: { at: string }[];
  pix: { key: string; name: string; city: string } | null;
  /** Automatic Pix (Mercado Pago) can be generated for this charge. */
  auto: boolean;
  /** The automatic Pix already generated and still valid. */
  mp: { qr: string; expiresAt: string } | null;
}

/** Receipts sent for the current charge (older charges' receipts stay for the admin only). */
export const currentReceipts = (order: Pick<Order, 'receipts' | 'charge'>) => (order.receipts ?? []).filter((r) => !order.charge || !r.chargeToken || r.chargeToken === order.charge.token);

export function payState(order: Pick<Order, 'status' | 'receipts' | 'charge'>): PayState {
  if (order.status === 'cancelado') return 'cancelado';
  if (order.status === 'pago' || order.status === 'entregue') return 'pago';
  return currentReceipts(order).length ? 'analise' : 'aguardando';
}

export interface PricingProblem {
  productId: string;
  variantId: string;
  size?: string;
  name: string;
  reason: 'missing' | 'unavailable' | 'size' | 'stock';
  available?: number;
}

export type PricingResult = { ok: true; items: OrderItem[]; totalCents: number } | { ok: false; problems: PricingProblem[] };

/**
 * Prices and checks an order against the catalog: product and finish exist and
 * can be bought, the size is valid, the quantity fits the stock. Lines for the
 * same combination are merged. Pure: the server's verdict is authoritative.
 *
 * `owner`: an order the owner registers or edits in the admin. Hidden pieces and
 * finishes may be sold, and stock is not checked here: the server checks the
 * exact stock (net of what the order already holds) when the order holds stock.
 */
export function priceOrder(catalog: Catalog, items: { productId: string; variantId: string; size?: string | undefined; qty: number }[], opts: { owner?: boolean } = {}): PricingResult {
  const merged = new Map<string, { productId: string; variantId: string; size?: string; qty: number }>();
  for (const item of items) {
    const size = item.size?.trim() || undefined;
    const key = `${item.productId}|${comboKey(item.variantId, size)}`;
    const existing = merged.get(key);
    if (existing) existing.qty += item.qty;
    else merged.set(key, { productId: item.productId, variantId: item.variantId, ...(size ? { size } : {}), qty: item.qty });
  }
  const categories = new Map(catalog.categories.map((c) => [c.id, c.name]));
  const problems: PricingProblem[] = [];
  const out: OrderItem[] = [];
  for (const item of merged.values()) {
    const product = catalog.products.find((p) => p.id === item.productId);
    const variant = product && findVariant(product, item.variantId);
    const base = { productId: item.productId, variantId: item.variantId, ...(item.size ? { size: item.size } : {}) };
    if (!product || !variant) {
      problems.push({ ...base, name: product?.name ?? 'Peça', reason: 'missing' });
      continue;
    }
    if (!opts.owner && (!isPurchasable(product, catalog.stock) || !variant.available)) {
      problems.push({ ...base, name: product.name, reason: 'unavailable' });
      continue;
    }
    const sizes = variant.sizes ?? [];
    if (sizes.length ? !item.size || !sizes.includes(item.size) : item.size !== undefined) {
      problems.push({ ...base, name: product.name, reason: 'size' });
      continue;
    }
    const units = opts.owner ? null : stockOf(catalog.stock, product.id, variant.id, item.size);
    if (units !== null && units < item.qty) {
      problems.push({ ...base, name: product.name, reason: units === 0 ? 'unavailable' : 'stock', available: units });
      continue;
    }
    if (item.qty > MAX_ORDER_LINE_QTY) {
      problems.push({ ...base, name: product.name, reason: 'stock', available: MAX_ORDER_LINE_QTY });
      continue;
    }
    out.push({
      productId: product.id,
      variantId: variant.id,
      ...(item.size ? { size: item.size } : {}),
      qty: item.qty,
      name: product.name,
      finish: variant.finish as Finish,
      ...(variant.sku ? { sku: variant.sku } : {}),
      categoryId: product.categoryId,
      categoryName: categories.get(product.categoryId) ?? '',
      unitCents: effectivePrice(product),
    });
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, items: out, totalCents: out.reduce((sum, i) => sum + i.unitCents * i.qty, 0) };
}

/** pt-BR sentence for pricing problems (shown in the bag). */
export function pricingMessage(problems: PricingProblem[]): string {
  const first = problems[0];
  if (!first) return 'Confira as peças da sua sacola.';
  const more = problems.length > 1 ? ` e mais ${problems.length - 1}` : '';
  if (first.reason === 'stock') return `Só temos ${first.available} ${first.available === 1 ? 'unidade' : 'unidades'} de ${first.name}${more}. Ajuste a quantidade e finalize de novo.`;
  if (first.reason === 'size') return `Escolha o tamanho de ${first.name}${more} de novo.`;
  return `${first.name}${more} acabou de esgotar. Atualizamos a sua sacola.`;
}

export const finishLabel = (finish: Finish) => FINISH_LABEL[finish];

/** Items as stock moves (only meaningful for tracked products; the server filters). */
export const movesOf = (items: OrderItem[]): StockMove[] => items.map((i) => ({ productId: i.productId, variantId: i.variantId, size: i.size ?? '', qty: i.qty }));
