import { z } from 'zod';
import { categorySchema, collectionSchema, MAX_CATEGORIES, MAX_COLLECTIONS, MAX_PRODUCTS, productSchema, settingsSchema, type Catalog, type Category, type Collection, type Product, type Settings } from './schema';

/*
 * Change sets: the unit of an admin write. The browser diffs the catalog
 * before and after an edit into per-entity upserts/deletes; the Worker
 * validates them, checks for conflicts against `baseVersion`, applies them to
 * the stored catalog and commits atomically. Shared by both sides.
 */

export type EntityKind = 'product' | 'category' | 'collection';

export type Change =
  | { kind: 'product'; op: 'upsert'; id: string; data: Product }
  | { kind: 'category'; op: 'upsert'; id: string; data: Category }
  | { kind: 'collection'; op: 'upsert'; id: string; data: Collection }
  | { kind: EntityKind; op: 'delete'; id: string }
  | { kind: 'settings'; op: 'upsert'; data: Settings };

export interface ChangeSet {
  baseVersion: number;
  changes: Change[];
}

/**
 * Upper bound per request: a whole catalog (every product, category and
 * collection plus settings), so imports and restores are one atomic change set.
 */
export const MAX_CHANGES = MAX_PRODUCTS + MAX_CATEGORIES + MAX_COLLECTIONS + 1;

const id = z.string().min(1).max(64);
const changeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('product'), op: z.literal('upsert'), id, data: productSchema }),
  z.object({ kind: z.literal('category'), op: z.literal('upsert'), id, data: categorySchema }),
  z.object({ kind: z.literal('collection'), op: z.literal('upsert'), id, data: collectionSchema }),
  z.object({ kind: z.literal('settings'), op: z.literal('upsert'), data: settingsSchema }),
]);
const deleteSchema = z.object({ kind: z.enum(['product', 'category', 'collection']), op: z.literal('delete'), id });

export const changeSetSchema = z.object({
  baseVersion: z.number().int().min(0),
  changes: z
    .array(z.union([deleteSchema, changeSchema]))
    .min(1)
    .max(MAX_CHANGES),
});

/** Structural equality for JSON-like values (key order independent). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => jsonEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bKeys = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return aKeys.length === bKeys.length && aKeys.every((k) => jsonEqual(ao[k], bo[k]));
}

function diffList<T extends { id: string }>(kind: EntityKind, prev: T[], next: T[]): Change[] {
  const out: Change[] = [];
  const before = new Map(prev.map((e) => [e.id, e]));
  const after = new Set(next.map((e) => e.id));
  for (const entity of next) {
    const old = before.get(entity.id);
    if (!old || !jsonEqual(old, entity)) out.push({ kind, op: 'upsert', id: entity.id, data: entity } as unknown as Change);
  }
  for (const entity of prev) if (!after.has(entity.id)) out.push({ kind, op: 'delete', id: entity.id });
  return out;
}

/** Per-entity changes that turn `prev` into `next`. */
export function diffCatalog(prev: Catalog, next: Catalog): Change[] {
  const changes = [
    ...diffList('category', prev.categories, next.categories),
    ...diffList('collection', prev.collections, next.collections),
    ...diffList('product', prev.products, next.products),
  ];
  if (!jsonEqual(prev.settings, next.settings)) changes.push({ kind: 'settings', op: 'upsert', data: next.settings });
  return changes;
}

const listKey = { product: 'products', category: 'categories', collection: 'collections' } as const;

/**
 * Applies changes to a catalog (immutably). Upserts replace in place or
 * append; deletes of missing entities are no-ops, so replays are harmless.
 */
export function applyChanges(catalog: Catalog, changes: Change[]): Catalog {
  const next: Catalog = {
    ...catalog,
    products: [...catalog.products],
    categories: [...catalog.categories],
    collections: [...catalog.collections],
  };
  for (const change of changes) {
    if (change.kind === 'settings') {
      next.settings = change.data;
      continue;
    }
    const list = next[listKey[change.kind]] as { id: string }[];
    const index = list.findIndex((e) => e.id === change.id);
    if (change.op === 'delete') {
      if (index >= 0) list.splice(index, 1);
    } else if (index >= 0) {
      list[index] = change.data;
    } else {
      list.push(change.data);
    }
  }
  return next;
}

/** Orders changes parents-first and splits them into request-sized chunks (normally one). */
export function chunkChanges(changes: Change[], size = MAX_CHANGES): Change[][] {
  const rank = (c: Change) => (c.op === 'delete' ? (c.kind === 'product' ? 3 : 4) : c.kind === 'product' ? 2 : c.kind === 'settings' ? 0 : 1);
  const ordered = [...changes].sort((a, b) => rank(a) - rank(b));
  const chunks: Change[][] = [];
  for (let i = 0; i < ordered.length; i += size) chunks.push(ordered.slice(i, i + size));
  return chunks;
}

/** Every image source referenced by a catalog (products and collection heroes). */
export function imageSourcesOf(catalog: Pick<Catalog, 'products' | 'collections'>): string[] {
  const out: string[] = [];
  for (const p of catalog.products) for (const img of p.images) out.push(img.src, ...(img.thumb ? [img.thumb] : []));
  for (const c of catalog.collections) if (c.heroImage) out.push(c.heroImage);
  return out;
}
