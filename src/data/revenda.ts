import { z } from 'zod';
import { FINISHES } from './schema';

/*
 * Reseller program (docs/revenda/PLAN.md): resellers, kits ("maletas"),
 * reseller sales, commission tiers and settlement. Shared by the Worker, the
 * owner's admin and the reseller's panel; the rules here are pure.
 */

const id = z.string().min(1).max(64);
const isoDate = z.string().max(40);
const text = (max: number) => z.string().max(max);

// ---------------------------------------------------------------------------
// Program configuration (app_config key 'revenda', admin-only)
// ---------------------------------------------------------------------------

export const commissionTierSchema = z.object({
  /** The tier applies from this sold total (centavos) in the kit cycle. The first tier starts at 0. */
  fromCents: z.number().int().min(0).max(100_000_000),
  percent: z.number().min(0).max(90),
});
export type CommissionTier = z.infer<typeof commissionTierSchema>;

export const CONTRACT_MODES = ['aceite', 'link'] as const;
export type ContractMode = (typeof CONTRACT_MODES)[number];

export const programSchema = z
  .object({
    tiers: z.array(commissionTierSchema).min(1).max(8),
    /** Days from handing the kit over to the settlement. */
    cycleDays: z.number().int().min(1).max(365),
    contract: z.object({
      mode: z.enum(CONTRACT_MODES),
      title: text(120),
      /** Plain text (line breaks kept). Each change bumps `version`. */
      text: text(30_000),
      version: z.number().int().min(1),
      /** Default external link (Autentique, ZapSign…) when mode = 'link'; a reseller may have her own. */
      url: z.url().max(500).optional(),
    }),
  })
  .superRefine((p, ctx) => {
    if (p.tiers[0]?.fromCents !== 0) ctx.addIssue({ code: 'custom', path: ['tiers', 0, 'fromCents'], message: 'A primeira faixa começa em R$ 0,00.' });
    for (let i = 1; i < p.tiers.length; i++) {
      if (p.tiers[i]!.fromCents <= p.tiers[i - 1]!.fromCents) ctx.addIssue({ code: 'custom', path: ['tiers', i, 'fromCents'], message: 'Cada faixa começa acima da anterior.' });
    }
    if (p.contract.mode === 'link' && !p.contract.url) ctx.addIssue({ code: 'custom', path: ['contract', 'url'], message: 'Informe o link do contrato.' });
    if (p.contract.mode === 'aceite' && p.contract.text.trim().length < 20) ctx.addIssue({ code: 'custom', path: ['contract', 'text'], message: 'Escreva o texto do contrato.' });
  });
export type Program = z.infer<typeof programSchema>;

export const DEFAULT_CONTRACT_TEXT = `CONTRATO DE REVENDA EM CONSIGNAÇÃO — ÉKA SEMIJOIAS

1. A ÉKA Semijoias entrega à revendedora, em consignação, as peças listadas na maleta, que continuam sendo da ÉKA até serem vendidas.
2. A revendedora vende as peças pelo preço indicado na maleta e registra cada venda no painel da revendedora.
3. A cada ciclo (prazo indicado no painel), é feito o acerto: a revendedora devolve as peças não vendidas e repassa à ÉKA o valor das vendas, descontada a sua comissão.
4. A comissão segue as faixas de venda indicadas no painel e é calculada sobre o total vendido no ciclo.
5. Peças perdidas, danificadas por mau uso ou não devolvidas no acerto são cobradas pelo preço de venda, sem comissão.
6. A revendedora cuida das peças, não as usa e não altera os preços sem combinar com a ÉKA.
7. A garantia das peças vendidas segue as regras da ÉKA, informadas à cliente na mensagem de compra.
8. Qualquer uma das partes pode encerrar a parceria, com o acerto final das peças e dos valores.
9. Os dados pessoais da revendedora e das clientes são usados só para a revenda, conforme a LGPD.`;

export const DEFAULT_PROGRAM: Program = {
  tiers: [
    { fromCents: 0, percent: 25 },
    { fromCents: 100_000, percent: 30 },
    { fromCents: 200_000, percent: 35 },
  ],
  cycleDays: 30,
  contract: { mode: 'aceite', title: 'Contrato de revenda', text: DEFAULT_CONTRACT_TEXT, version: 1 },
};

/** The stored program, or the defaults when absent or unreadable. */
export function readProgram(value: unknown): Program {
  const parsed = programSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_PROGRAM;
}

// ---------------------------------------------------------------------------
// Resellers
// ---------------------------------------------------------------------------

export const RESELLER_STATUSES = ['ativa', 'pausada', 'encerrada'] as const;
export type ResellerStatus = (typeof RESELLER_STATUSES)[number];
export const RESELLER_STATUS_LABEL: Record<ResellerStatus, string> = { ativa: 'Ativa', pausada: 'Pausada', encerrada: 'Encerrada' };

export const LEAD_STATUSES = ['nova', 'analise', 'aprovada', 'recusada', 'efetivada'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = { nova: 'Nova', analise: 'Em análise', aprovada: 'Aprovada', recusada: 'Recusada', efetivada: 'Revendedora' };

export const resellerSchema = z.object({
  id,
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: text(120).min(2),
  /** Digits only (DDD + number). */
  whatsapp: z.string().regex(/^\d{10,11}$/),
  city: text(80),
  uf: text(2),
  instagram: text(60).optional(),
  status: z.enum(RESELLER_STATUSES),
  leadId: id.optional(),
  /** Overrides the program's commission tiers for this reseller. */
  tiers: z.array(commissionTierSchema).min(1).max(8).optional(),
  /** Her own contract link (mode 'link'). */
  contractUrl: z.url().max(500).optional(),
  contract: z
    .object({
      acceptedAt: isoDate,
      version: z.number().int(),
      mode: z.enum(CONTRACT_MODES),
      /** The owner checked the external signature (mode 'link'). */
      checkedAt: isoDate.optional(),
    })
    .optional(),
  /** Show her WhatsApp on the public showcase (default true). */
  showWhatsapp: z.boolean(),
  hasPin: z.boolean(),
  note: text(600).optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
  lastSeenAt: isoDate.optional(),
});
export type Reseller = z.infer<typeof resellerSchema>;

/** "ana-souza" style slug from a name (accents removed), max 40 chars. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : 'revendedora';
}

/** A slug not in `taken`: the first name, then first + second name, then numbered. */
export function uniqueSlug(name: string, taken: ReadonlySet<string>): string {
  const parts = slugify(name).split('-');
  const candidates = [parts[0]!, parts.slice(0, 2).join('-'), slugify(name)];
  for (const c of candidates) if (c.length >= 2 && !taken.has(c)) return c;
  const base = candidates[0]!.length >= 2 ? candidates[0]! : 'revendedora';
  for (let n = 2; n < 1000; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Kits and sales
// ---------------------------------------------------------------------------

export const kitItemSchema = z.object({
  productId: id,
  variantId: id,
  /** '' when the finish has no sizes. */
  size: text(12),
  qty: z.number().int().min(1).max(500),
  /** Selling price agreed when the piece entered the kit. */
  unitCents: z.number().int().min(0),
  name: text(120),
  finish: z.enum(FINISHES),
  sku: text(40).optional(),
});
export type KitItem = z.infer<typeof kitItemSchema>;

export const settlementSchema = z.object({
  at: isoDate,
  soldCents: z.number().int().min(0),
  percent: z.number().min(0).max(90),
  commissionCents: z.number().int().min(0),
  missingCents: z.number().int().min(0),
  /** What the reseller pays the store: sold − commission + missing. */
  dueCents: z.number().int(),
  returned: z.array(z.object({ productId: id, variantId: id, size: text(12), qty: z.number().int().min(0) })),
  missing: z.array(z.object({ productId: id, variantId: id, size: text(12), qty: z.number().int().min(1), name: text(120) })),
  paidAt: isoDate.optional(),
});
export type Settlement = z.infer<typeof settlementSchema>;

export const kitSchema = z.object({
  id,
  resellerId: id,
  status: z.enum(['aberta', 'fechada']),
  openedAt: isoDate,
  dueAt: isoDate,
  closedAt: isoDate.optional(),
  updatedAt: isoDate,
  items: z.array(kitItemSchema).max(300),
  /** Units of tracked pieces taken out of stock for this kit (given back on settlement/removal). */
  stockMoves: z.array(z.object({ productId: id, variantId: id, size: text(12), qty: z.number().int().min(1) })).max(300),
  /** Commission tiers frozen when the kit was opened (changes to the program apply to the next kit). */
  tiers: z.array(commissionTierSchema).min(1).max(8),
  settlement: settlementSchema.optional(),
});
export type Kit = z.infer<typeof kitSchema>;

export const PAYMENT_METHODS = ['pix', 'dinheiro', 'cartao', 'outro'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', outro: 'Outro' };

export const saleLineSchema = z.object({
  productId: id,
  variantId: id,
  size: text(12),
  qty: z.number().int().min(1).max(100),
  unitCents: z.number().int().min(0).max(10_000_000),
  name: text(120),
  finish: z.enum(FINISHES),
});
export type SaleLine = z.infer<typeof saleLineSchema>;

export const resellerSaleSchema = z.object({
  id,
  resellerId: id,
  kitId: id,
  createdAt: isoDate,
  status: z.enum(['ativa', 'cancelada']),
  lines: z.array(saleLineSchema).min(1).max(50),
  totalCents: z.number().int().min(0),
  customer: z.object({ name: text(80), whatsapp: z.string().regex(/^(\d{10,11})?$/) }).optional(),
  payment: z.enum(PAYMENT_METHODS),
  note: text(300).optional(),
  cancelledAt: isoDate.optional(),
});
export type ResellerSale = z.infer<typeof resellerSaleSchema>;

/** What the reseller sends to register a sale. She sets the price of each line (the kit price by default; a discount is common). */
export const saleRequestSchema = z.object({
  lines: z
    .array(z.object({ productId: id, variantId: id, size: text(12), qty: z.number().int().min(1).max(100), unitCents: z.number().int().min(0).max(10_000_000) }))
    .min(1, 'Escolha pelo menos uma peça.')
    .max(50),
  customer: z
    .object({
      name: z.string().trim().max(80),
      whatsapp: z.string().transform((v) => v.replace(/\D/g, '')).pipe(z.string().regex(/^(\d{10,11})?$/, 'WhatsApp com DDD, ex.: (65) 99999-9999')),
    })
    .optional(),
  payment: z.enum(PAYMENT_METHODS),
  note: z
    .string()
    .max(300)
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
});
export type SaleRequest = z.input<typeof saleRequestSchema>;

export const lineKey = (l: { productId: string; variantId: string; size?: string | undefined }) => `${l.productId}|${l.variantId}|${l.size ?? ''}`;

export interface KitLineState extends KitItem {
  sold: number;
  available: number;
}

/** Each kit line with units sold (active sales) and still available. */
export function kitState(kit: Pick<Kit, 'items'>, sales: Pick<ResellerSale, 'status' | 'lines'>[]): KitLineState[] {
  const sold = new Map<string, number>();
  for (const s of sales) if (s.status === 'ativa') for (const l of s.lines) sold.set(lineKey(l), (sold.get(lineKey(l)) ?? 0) + l.qty);
  return kit.items.map((i) => {
    const n = sold.get(lineKey(i)) ?? 0;
    return { ...i, sold: n, available: Math.max(0, i.qty - n) };
  });
}

export const kitValueCents = (items: Pick<KitItem, 'qty' | 'unitCents'>[]) => items.reduce((sum, i) => sum + i.qty * i.unitCents, 0);
export const salesTotalCents = (sales: Pick<ResellerSale, 'status' | 'totalCents'>[]) => sales.reduce((sum, s) => sum + (s.status === 'ativa' ? s.totalCents : 0), 0);

/** What a sale would have been at the kit price (lines no longer in the kit count at the price sold). */
export function saleKitPriceCents(kit: Pick<Kit, 'items'>, sale: Pick<ResellerSale, 'lines'>): number {
  const price = new Map(kit.items.map((i) => [lineKey(i), i.unitCents]));
  return sale.lines.reduce((sum, l) => sum + l.qty * Math.max(l.unitCents, price.get(lineKey(l)) ?? l.unitCents), 0);
}

/** How much below the kit price a sale went; 0 when sold at (or above) it. */
export function saleDiscountCents(kit: Pick<Kit, 'items'>, sale: Pick<ResellerSale, 'lines'>): number {
  return saleKitPriceCents(kit, sale) - sale.lines.reduce((sum, l) => sum + l.qty * l.unitCents, 0);
}

/** Discounts given in the active sales of a kit: total and how many sales had one. */
export function kitDiscounts(kit: Pick<Kit, 'items'>, sales: Pick<ResellerSale, 'status' | 'lines'>[]): { cents: number; sales: number } {
  let cents = 0;
  let count = 0;
  for (const s of sales) {
    if (s.status !== 'ativa') continue;
    const d = saleDiscountCents(kit, s);
    if (d > 0) {
      cents += d;
      count += 1;
    }
  }
  return { cents, sales: count };
}

export interface CommissionState {
  percent: number;
  commissionCents: number;
  /** The next tier, when there is one. */
  next: { percent: number; fromCents: number; missingCents: number } | null;
  /** 0–1 progress from the current tier's start to the next tier. */
  progress: number;
}

/** Commission for a sold total: the tier reached applies to the whole cycle. */
export function commissionFor(soldCents: number, tiers: CommissionTier[]): CommissionState {
  const sorted = [...tiers].sort((a, b) => a.fromCents - b.fromCents);
  let index = 0;
  sorted.forEach((t, i) => {
    if (soldCents >= t.fromCents) index = i;
  });
  const current = sorted[index] ?? { fromCents: 0, percent: 0 };
  const next = sorted[index + 1];
  return {
    percent: current.percent,
    commissionCents: Math.round((soldCents * current.percent) / 100),
    next: next ? { percent: next.percent, fromCents: next.fromCents, missingCents: next.fromCents - soldCents } : null,
    progress: next ? Math.min(1, Math.max(0, (soldCents - current.fromCents) / (next.fromCents - current.fromCents))) : 1,
  };
}

/**
 * Settlement of a kit: `returned` says how many units of each line came back (missing lines =
 * all available units). Units neither sold nor returned are owed at full price, without commission.
 */
export function settle(
  kit: Pick<Kit, 'items' | 'tiers'>,
  sales: Pick<ResellerSale, 'status' | 'lines' | 'totalCents'>[],
  returned: { productId: string; variantId: string; size: string; qty: number }[],
): Omit<Settlement, 'at'> | { error: string } {
  const lines = kitState(kit, sales);
  const back = new Map(returned.map((r) => [lineKey(r), r.qty]));
  for (const [key, qty] of back) {
    const line = lines.find((l) => lineKey(l) === key);
    if (!line) return { error: 'Uma peça devolvida não está na maleta.' };
    if (qty > line.available) return { error: `${line.name}: devolvidas ${qty}, mas só ${line.available} não foram vendidas.` };
  }
  const soldCents = salesTotalCents(sales);
  const { percent, commissionCents } = commissionFor(soldCents, kit.tiers);
  const missing = lines
    .map((l) => ({ productId: l.productId, variantId: l.variantId, size: l.size, name: l.name, qty: l.available - (back.get(lineKey(l)) ?? l.available), unitCents: l.unitCents }))
    .filter((m) => m.qty > 0);
  const missingCents = missing.reduce((sum, m) => sum + m.qty * m.unitCents, 0);
  return {
    soldCents,
    percent,
    commissionCents,
    missingCents,
    dueCents: soldCents - commissionCents + missingCents,
    returned: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, size: l.size, qty: back.get(lineKey(l)) ?? l.available })),
    missing: missing.map(({ unitCents: _u, ...m }) => m),
  };
}

/** Whole days until the settlement date (negative when overdue). */
export function daysLeft(dueAt: string, now = Date.now()): number {
  return Math.ceil((Date.parse(dueAt) - now) / 86_400_000);
}

/** The panel's money summary for a reseller: current cycle + closed cycles. */
export function earnings(current: { soldCents: number; tiers: CommissionTier[] } | null, closed: Pick<Settlement, 'commissionCents'>[]) {
  const received = closed.reduce((sum, s) => sum + s.commissionCents, 0);
  const projected = current ? commissionFor(current.soldCents, current.tiers).commissionCents : 0;
  return { receivedCents: received, projectedCents: projected, totalCents: received + projected };
}
