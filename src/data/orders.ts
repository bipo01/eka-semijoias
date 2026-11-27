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
  /** A registered customer (Painel → Clientes): the server takes the order's name and city from her record. */
  customerId: z.string().max(64).optional(),
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
/** Records kept per order (stored files + records of erased ones); only past this are the oldest erased records dropped. */
export const MAX_RECEIPT_RECORDS = 20;

/** The current Pix charge of an order: what the payment link asks for. */
export const chargeSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  shippingCents: z.number().int().min(0).max(10_000_000),
  discountCents: z.number().int().min(0).max(100_000_000),
  amountCents: z.number().int().min(1).max(100_000_000),
  createdAt: isoDate,
});
export type Charge = z.infer<typeof chargeSchema>;

export const receiptMetaSchema = z.object({
  id,
  at: isoDate,
  contentType: z.enum(RECEIPT_TYPES),
  size: z.number().int().min(1).max(RECEIPT_MAX_BYTES),
  /** The charge (payment link) the receipt answered; a new amount starts a new charge. */
  chargeToken: z.string().max(64).optional(),
  /** When the file itself was erased (by the owner, or automatically after the payment); the record stays. */
  erasedAt: isoDate.optional(),
  /** Discarded by the owner before the payment was accepted (a wrong file): the customer is asked for the right one. */
  rejected: z.literal(true).optional(),
  /** SHA-256 of the file (kept after erasure, so the same wrong file sent again is recognised). */
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
export type ReceiptMeta = z.infer<typeof receiptMetaSchema>;

/**
 * Receipt files are kept only while the payment is being checked: the owner's bank statement is the real proof.
 * Once an order is paid (or cancelled) she can erase them at once, and they go by themselves after this many days.
 */
export const RECEIPT_KEEP_DAYS = 7;
export const RECEIPT_KEEP_MS = RECEIPT_KEEP_DAYS * 24 * 3600_000;
/** Statuses in which the payment is settled (or no longer expected): receipt files may be erased. */
export const RECEIPTS_ERASABLE: ReadonlySet<OrderStatus> = new Set(['pago', 'entregue', 'cancelado']);

/**
 * Since when the order has been settled without interruption: the first entry of the trailing run of
 * history entries in an erasable status (pago → entregue keeps counting from pago; a reopened order
 * starts over). Null while the order is open or has no such entry.
 */
export function settledSince(order: Pick<Order, 'status' | 'history'>): string | null {
  if (!RECEIPTS_ERASABLE.has(order.status)) return null;
  let since: string | null = null;
  for (let i = order.history.length - 1; i >= 0; i--) {
    const entry = order.history[i]!;
    if (entry.event) continue; // item edits are not status changes
    if (!RECEIPTS_ERASABLE.has(entry.status)) break;
    since = entry.at;
  }
  return since;
}

/** Receipts whose file is still stored. */
export const storedReceipts = (order: Pick<Order, 'receipts'>) => (order.receipts ?? []).filter((r) => !r.erasedAt);

/** True when the files are due for automatic erasure (settled for RECEIPT_KEEP_MS or longer). */
export function receiptsExpired(order: Pick<Order, 'status' | 'history' | 'receipts'>, now: number, keepMs = RECEIPT_KEEP_MS): boolean {
  const since = settledSince(order);
  return !!since && storedReceipts(order).length > 0 && Date.parse(since) + keepMs <= now;
}

/** Hour (UTC) of the daily cron that erases expired receipt files (wrangler.jsonc: 03:00 in Cuiabá). */
export const RECEIPT_ERASE_HOUR_UTC = 7;
/**
 * The daily run erases files that would come due before the next run, so no file outlives
 * RECEIPT_KEEP_DAYS (they go between 6 and 7 days after the order settled).
 */
export const RECEIPT_ERASE_WINDOW_MS = 24 * 3600_000;

/** When the daily run will erase the files of an order settled at `since`: the first run inside the window. */
export function receiptsEraseAt(since: string, keepMs = RECEIPT_KEEP_MS): Date {
  const due = Date.parse(since) + keepMs - RECEIPT_ERASE_WINDOW_MS;
  const run = new Date(due);
  run.setUTCHours(RECEIPT_ERASE_HOUR_UTC, 0, 0, 0);
  if (run.getTime() < due) run.setUTCDate(run.getUTCDate() + 1);
  return run;
}

/**
 * Receipt records after a new upload: at most MAX_RECEIPTS_PER_ORDER stored files (a discarded wrong
 * file does not use up a slot for the right one); every record stays, up to MAX_RECEIPT_RECORDS, past
 * which the oldest erased record goes. Null when the stored files already fill every slot.
 */
export function receiptsWithNew(receipts: ReceiptMeta[], added: ReceiptMeta): ReceiptMeta[] | null {
  if (receipts.filter((r) => !r.erasedAt).length >= MAX_RECEIPTS_PER_ORDER) return null;
  let kept = receipts;
  while (kept.length >= MAX_RECEIPT_RECORDS) {
    const oldestErased = kept.findIndex((r) => r.erasedAt);
    if (oldestErased < 0) return null;
    kept = kept.filter((_, i) => i !== oldestErased);
  }
  return [...kept, added];
}

/** True when the newest receipt sent for the current charge was discarded and the payment is still awaited. */
export function lastReceiptDiscarded(order: Pick<Order, 'status' | 'receipts' | 'charge'>): boolean {
  if (!order.charge || payState(order) !== 'aguardando') return false;
  const mine = (order.receipts ?? []).filter((r) => r.chargeToken === order.charge!.token);
  return mine.at(-1)?.rejected === true;
}

/** The order with one stored receipt marked as erased at `at` (rejected when the payment is still open). */
export function withReceiptErased<T extends Pick<Order, 'receipts' | 'status'>>(order: T, receiptId: string, at: string): T {
  const open = !RECEIPTS_ERASABLE.has(order.status);
  return { ...order, receipts: (order.receipts ?? []).map((r) => (r.id !== receiptId || r.erasedAt ? r : { ...r, erasedAt: at, ...(open ? { rejected: true as const } : {}) })) };
}

/** The order with every stored receipt marked as erased at `at`. */
export function withReceiptsErased<T extends Pick<Order, 'receipts'>>(order: T, at: string): T {
  if (!order.receipts?.length) return order;
  return { ...order, receipts: order.receipts.map((r) => (r.erasedAt ? r : { ...r, erasedAt: at })) };
}

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
  /** The registered customer this order belongs to (Painel → Clientes); mirrors orders.customer_id. */
  customerId: z.string().max(64).optional(),
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
  receipts: z.array(receiptMetaSchema).max(MAX_RECEIPT_RECORDS).optional(),
});
export type Order = z.infer<typeof orderSchema>;

/** What the sale is worth for the report: the items minus any discount (shipping is not a sale). */
export const saleCents = (order: Pick<Order, 'totalCents' | 'charge'>) => Math.max(0, order.totalCents - (order.charge?.discountCents ?? 0));

/** True when a receipt arrived and the payment is still to be checked. */
export const awaitingReview = (order: Pick<Order, 'status' | 'receipts'>) => storedReceipts(order).length > 0 && (order.status === 'enviado' || order.status === 'confirmado');

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
  /** The store discarded a receipt sent for this charge while the payment is still awaited (ask for the right one). */
  discarded: boolean;
}

/** Receipts sent for the current charge (older charges' receipts stay for the admin only). */
/** An erased file is no longer under review: a reopened order asks for the payment again. */
export const currentReceipts = (order: Pick<Order, 'receipts' | 'charge'>) => (order.receipts ?? []).filter((r) => !r.erasedAt && (!order.charge || !r.chargeToken || r.chargeToken === order.charge.token));

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
