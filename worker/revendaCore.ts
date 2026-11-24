import { effectivePrice, findVariant } from '../src/data/catalog';
import {
  kitSchema,
  readProgram,
  resellerSaleSchema,
  resellerSchema,
  type Kit,
  type KitItem,
  type Program,
  type Reseller,
  type ResellerSale,
} from '../src/data/revenda';
import type { Catalog, Finish } from '../src/data/schema';
import { hmacHex } from './crypto';
import { guard } from './db';
import { HttpError } from './http';

/*
 * Shared pieces of the reseller program on the Worker (docs/revenda/PLAN.md):
 * row converters, the program document, kit line pricing and CAS guards.
 */

export interface ResellerRow {
  id: string;
  slug: string;
  whatsapp: string;
  status: Reseller['status'];
  updated_at: string;
  data: string;
}
export interface KitRow {
  id: string;
  reseller_id: string;
  status: Kit['status'];
  updated_at: string;
  data: string;
}
export interface SaleRow {
  id: string;
  status: ResellerSale['status'];
  data: string;
}

/** Column-backed fields win over the JSON document (they are what the indexes enforce). */
export function toReseller(row: ResellerRow): Reseller {
  return resellerSchema.parse({ ...(JSON.parse(row.data) as object), id: row.id, slug: row.slug, whatsapp: row.whatsapp, status: row.status, updatedAt: row.updated_at });
}
export const toKit = (row: KitRow): Kit => kitSchema.parse({ ...(JSON.parse(row.data) as object), id: row.id, resellerId: row.reseller_id, status: row.status, updatedAt: row.updated_at });
export const toSale = (row: SaleRow): ResellerSale => resellerSaleSchema.parse({ ...(JSON.parse(row.data) as object), id: row.id, status: row.status });

export const RESELLER_COLUMNS = 'id, slug, whatsapp, status, updated_at, data';
export const KIT_COLUMNS = 'id, reseller_id, status, updated_at, data';

export const programStatement = (db: D1Database) => db.prepare(`SELECT data FROM app_config WHERE key = 'revenda'`);
export const parseProgram = (row: { data?: unknown } | undefined): Program => readProgram(row?.data ? JSON.parse(String(row.data)) : undefined);

/** Compare-and-swap guards on the row versions every write checked. */
export const resellerUnchanged = (db: D1Database, id: string, stamp: string) => guard(db, '(SELECT updated_at FROM resellers WHERE id = ?1) = ?2', id, stamp);
export const kitUnchanged = (db: D1Database, id: string, stamp: string) => guard(db, '(SELECT updated_at FROM kits WHERE id = ?1) = ?2', id, stamp);

/** A write timestamp strictly after the stored one. */
export function nextStamp(previous: string): string {
  const now = Date.now();
  const prev = Date.parse(previous);
  return new Date(Number.isNaN(prev) ? now : Math.max(now, prev + 1)).toISOString();
}

export const MAX_KIT_LINE_QTY = 500;

/**
 * Prices kit lines from the catalog (merged per piece/finish/size). Hidden pieces may go in a kit;
 * the size must exist. Lines already in the kit keep their agreed price.
 */
export function priceKitLines(catalog: Catalog, lines: { productId: string; variantId: string; size?: string | undefined; qty: number }[], agreed: Map<string, KitItem> = new Map()): KitItem[] {
  const merged = new Map<string, { productId: string; variantId: string; size: string; qty: number }>();
  for (const l of lines) {
    const size = l.size?.trim() ?? '';
    const key = `${l.productId}|${l.variantId}|${size}`;
    const m = merged.get(key);
    if (m) m.qty += l.qty;
    else merged.set(key, { productId: l.productId, variantId: l.variantId, size, qty: l.qty });
  }
  const out: KitItem[] = [];
  for (const [key, l] of merged) {
    const kept = agreed.get(key);
    const product = catalog.products.find((p) => p.id === l.productId);
    const variant = product && findVariant(product, l.variantId);
    if (!product || !variant) {
      if (kept) {
        out.push({ ...kept, qty: Math.min(l.qty, MAX_KIT_LINE_QTY) });
        continue;
      }
      throw new HttpError('conflict', 'Uma das peças não existe mais no catálogo. Recarregue a página e escolha de novo.');
    }
    const sizes = variant.sizes ?? [];
    if (sizes.length ? !sizes.includes(l.size) : l.size !== '') throw new HttpError('conflict', `Escolha o tamanho de ${product.name} de novo.`);
    if (l.qty > MAX_KIT_LINE_QTY) throw new HttpError('bad_request', `No máximo ${MAX_KIT_LINE_QTY} unidades de uma peça por maleta.`);
    out.push({
      productId: product.id,
      variantId: variant.id,
      size: l.size,
      qty: l.qty,
      unitCents: kept?.unitCents ?? effectivePrice(product),
      name: product.name,
      finish: variant.finish as Finish,
      ...(variant.sku ? { sku: variant.sku } : {}),
    });
  }
  return out;
}

/** Hash of a reseller PIN (pepper-keyed, per-reseller salt; same construction as the admin PIN). */
export const hashResellerPin = (pepper: string, salt: string, pin: string) => hmacHex(pepper, `rpin:${salt}:${pin}`);

/** Reseller PIN policy: exactly 6 digits, not trivial. */
export function resellerPinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'O PIN precisa ter 6 números.';
  if (/^(\d)\1+$/.test(pin)) return 'Escolha um PIN com números diferentes.';
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((x, i) => (x - d[i]! + 10) % 10);
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return 'Evite sequências como 123456.';
  if (/^(\d\d)\1+$/.test(pin) || pin.slice(0, 3) === pin.slice(3)) return 'Evite repetir números, como 121212 ou 123123.';
  return null;
}

/** The reseller as her own panel sees herself (no internal notes, no lead id). */
export function publicSelf(r: Reseller) {
  return { id: r.id, name: r.name, firstName: r.name.split(/\s+/)[0] ?? r.name, slug: r.slug, whatsapp: r.whatsapp, city: r.city, uf: r.uf, status: r.status, contract: r.contract ?? null };
}
