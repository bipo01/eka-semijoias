import { applyChanges, changeSetSchema, imageSourcesOf, jsonEqual, type Change, type EntityKind } from '../src/data/changes';
import { contentImageSources, isSectionId, type SectionId } from '../src/data/content';
import { conflictMessage, entityKey, findConflicts } from './conflicts';
import { checkIntegrity } from '../src/data/integrity';
import { createCatalogSeed } from '../src/data/seed';
import { materializeStock, orphanRows, type StockRow } from '../src/data/stock';
import {
  isDataUrl,
  MAX_CATEGORIES,
  MAX_LEADS,
  MAX_COLLECTIONS,
  MAX_PRODUCTS,
  MEDIA_KEY_PATTERN,
  SCHEMA_VERSION,
  type Catalog,
  type Category,
  type Collection,
  type Product,
  type Settings,
} from '../src/data/schema';
import { requireSession } from './auth';
import { sha256Hex } from './crypto';
import { guard, isGuardMiss, toHttpError, withReadRetry } from './db';
import { HttpError, json, rawJson, readBody, zodDetails } from './http';
import { notifyCatalog } from './live';
import type { Context } from './router';

/*
 * The catalog: one materialized public snapshot (served as is) plus one row
 * per entity (the relational truth future orders/stock attach to). Both are
 * written in the same D1 batch, which runs as a single transaction.
 */

/** D1 rows top out at 2 MB; keep a margin for the snapshot body. */
export const SNAPSHOT_MAX_BYTES = 1_900_000;
const CHANGES_MAX_BYTES = 2_000_000;
export const WRITE_ATTEMPTS = 10;
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Catalog versions are strictly increasing integers that also follow the clock
 * (`max(previous + 1, now in ms)`), so a version number is never reused, even
 * after the database is restored to an earlier point in time. That keeps the
 * immutable `/api/catalog/v/<version>` URLs and every client's cache honest.
 */
export const nextVersion = (previous: number, now = Date.now()) => Math.max(previous + 1, now);

interface Snapshot {
  version: number;
  body: string;
}

type StoredCatalog = Catalog & { version: number };

const TABLE: Record<EntityKind, 'products' | 'categories' | 'collections'> = { product: 'products', category: 'categories', collection: 'collections' };
const LIST: Record<EntityKind, 'products' | 'categories' | 'collections'> = TABLE;

export function snapshotBody(catalog: Catalog, version: number): string {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    version,
    products: catalog.products,
    categories: catalog.categories,
    collections: catalog.collections,
    settings: catalog.settings,
    stock: catalog.stock ?? {},
    // Every snapshot rewrite (catalog, stock, orders, kits) carries the site content through.
    content: catalog.content ?? {},
  });
}

/** Parses a stored snapshot body into the catalog it holds (without the version field). */
export function parseSnapshotBody(body: string): Catalog {
  const parsed = JSON.parse(body) as Catalog & { version?: number };
  delete parsed.version;
  return parsed;
}

export function readSnapshot(db: D1Database): Promise<Snapshot | null> {
  return db.prepare('SELECT version, body FROM catalog_snapshot WHERE id = 1').first<Snapshot>();
}

// ---------------------------------------------------------------------------
// Bulk statements (constant statement count per write, whatever its size)
// ---------------------------------------------------------------------------

function upsertStatements(db: D1Database, kind: EntityKind, rows: (Product | Category | Collection)[], version: number): D1PreparedStatement[] {
  if (!rows.length) return [];
  const payload = JSON.stringify(rows);
  const ids = JSON.stringify(rows.map((r) => r.id));
  const upsert =
    kind === 'product'
      ? `INSERT INTO products (id, slug, category_id, version, created_at, updated_at, data)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.slug'), json_extract(value, '$.categoryId'), ?2,
                json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt'), value
         FROM json_each(?1) WHERE true
         ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, category_id = excluded.category_id, version = excluded.version,
           created_at = excluded.created_at, updated_at = excluded.updated_at, data = excluded.data`
      : `INSERT INTO ${TABLE[kind]} (id, slug, version, data)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.slug'), ?2, value
         FROM json_each(?1) WHERE true
         ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, version = excluded.version, data = excluded.data`;
  return [
    db.prepare(upsert).bind(payload, version),
    db.prepare('DELETE FROM tombstones WHERE kind = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(kind, ids),
  ];
}

function deleteStatements(db: D1Database, kind: EntityKind, ids: string[], version: number): D1PreparedStatement[] {
  if (!ids.length) return [];
  const list = JSON.stringify(ids);
  return [
    ...(kind === 'product'
      ? [
          db.prepare('DELETE FROM stock_levels WHERE product_id IN (SELECT value FROM json_each(?1))').bind(list),
          db.prepare('DELETE FROM stock_tracked WHERE product_id IN (SELECT value FROM json_each(?1))').bind(list),
        ]
      : []),
    db.prepare(`DELETE FROM ${TABLE[kind]} WHERE id IN (SELECT value FROM json_each(?1))`).bind(list),
    db
      .prepare(
        `INSERT INTO tombstones (kind, id, version) SELECT ?1, value, ?2 FROM json_each(?3) WHERE true
         ON CONFLICT (kind, id) DO UPDATE SET version = excluded.version`,
      )
      .bind(kind, version, list),
  ];
}

// ---------------------------------------------------------------------------
// First run
// ---------------------------------------------------------------------------

/** Returns the snapshot, seeding D1 from the bundled seed on the very first request. Safe under concurrency. */
export async function ensureSeeded(db: D1Database): Promise<Snapshot> {
  const existing = await withReadRetry(() => readSnapshot(db));
  if (existing) return existing;
  const seed = createCatalogSeed();
  const version = nextVersion(0);
  try {
    await db.batch([
      guard(db, 'NOT EXISTS (SELECT 1 FROM catalog_snapshot)'),
      ...upsertStatements(db, 'category', seed.categories, version),
      ...upsertStatements(db, 'collection', seed.collections, version),
      ...upsertStatements(db, 'product', seed.products, version),
      db.prepare('INSERT INTO settings (id, version, data) VALUES (1, ?1, ?2)').bind(version, JSON.stringify(seed.settings)),
      db.prepare('INSERT INTO catalog_snapshot (id, version, body) VALUES (1, ?1, ?2)').bind(version, snapshotBody({ ...seed, stock: {} }, version)),
      db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(new Date().toISOString(), 'catalog.seed', 'Catálogo inicial criado'),
    ]);
  } catch (error) {
    if (!isGuardMiss(error)) throw toHttpError(error);
    // Another request seeded first: fine.
  }
  const seeded = await withReadRetry(() => readSnapshot(db));
  if (!seeded) throw new HttpError('internal');
  return seeded;
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

const etagOf = (version: number) => `"c${version}"`;

function etagMatches(request: Request, etag: string): boolean {
  const header = request.headers.get('If-None-Match');
  if (!header) return false;
  return header.split(',').some((t) => t.trim().replace(/^W\//, '') === etag);
}

/**
 * GET /api/catalog — always revalidated by browsers (ETag → 304, never cached
 * at the edge).
 * GET /api/catalog/v/:version — immutable once that version is current: the
 * edge cache (Workers Caching) answers it without running the Worker. It never
 * answers 304 (an immutable URL is not revalidated, and a cached 304 would be
 * a poisoned entry).
 */
export async function handleCatalog(ctx: Context): Promise<Response> {
  const snapshot = await ensureSeeded(ctx.env.DB);
  const requested = ctx.params.version;
  const etag = etagOf(snapshot.version);
  const headers = { ETag: etag, 'X-Catalog-Version': String(snapshot.version) };
  if (requested !== undefined) {
    if (!/^\d{1,16}$/.test(requested)) throw new HttpError('not_found');
    const current = Number(requested) === snapshot.version;
    return rawJson(snapshot.body, { ...headers, 'Cache-Control': current ? 'public, max-age=31536000, immutable' : 'no-store' });
  }
  // Browsers revalidate (ETag → 304); the edge never stores this URL (edge-only directive).
  const latest = { ...headers, 'Cache-Control': 'no-cache', 'Cloudflare-CDN-Cache-Control': 'no-store' };
  if (etagMatches(ctx.request, etag)) return rawJson('', latest, 304);
  return rawJson(snapshot.body, latest);
}

// ---------------------------------------------------------------------------
// Admin writes
// ---------------------------------------------------------------------------

interface ReadState {
  catalog: StoredCatalog;
  versions: Map<string, number>;
  tombstones: Map<string, number>;
  settingsVersion: number;
  contentVersions: Map<SectionId, number>;
  existingMedia: Set<string>;
  replay: { request_hash: string; response: string } | null;
  stockRows: StockRow[];
  tracked: string[];
}

async function readState(db: D1Database, changes: Change[], mediaKeys: string[], idempotencyKey: string | null): Promise<ReadState> {
  const ids = (kind: EntityKind) => JSON.stringify(changes.filter((c) => c.kind === kind).map((c) => (c as { id: string }).id));
  const sectionIds = JSON.stringify(changes.filter((c) => c.kind === 'content').map((c) => (c as { id: string }).id));
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT version, body FROM catalog_snapshot WHERE id = 1'),
      db.prepare(
        `SELECT 'product' AS kind, id, version FROM products WHERE id IN (SELECT value FROM json_each(?1))
         UNION ALL SELECT 'category', id, version FROM categories WHERE id IN (SELECT value FROM json_each(?2))
         UNION ALL SELECT 'collection', id, version FROM collections WHERE id IN (SELECT value FROM json_each(?3))`,
      ).bind(ids('product'), ids('category'), ids('collection')),
      db.prepare(
        `SELECT kind, id, version FROM tombstones WHERE (kind = 'product' AND id IN (SELECT value FROM json_each(?1)))
         OR (kind = 'category' AND id IN (SELECT value FROM json_each(?2))) OR (kind = 'collection' AND id IN (SELECT value FROM json_each(?3)))`,
      ).bind(ids('product'), ids('category'), ids('collection')),
      db.prepare('SELECT version FROM settings WHERE id = 1'),
      db.prepare('SELECT key FROM media WHERE key IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(mediaKeys)),
      db.prepare('SELECT request_hash, response FROM idempotency WHERE key = ?1').bind(idempotencyKey ?? ''),
      db.prepare('SELECT product_id, variant_id, size, qty FROM stock_levels'),
      db.prepare('SELECT product_id FROM stock_tracked'),
      // Site sections: one app_config row per section ever saved ("site:<id>", data {version, content|null}).
      db.prepare(`SELECT key, data FROM app_config WHERE key IN (SELECT 'site:' || value FROM json_each(?1))`).bind(sectionIds),
    ]),
  );
  const snapshot = results[0]?.results[0] as Snapshot | undefined;
  if (!snapshot) throw new HttpError('internal');
  const parsed = JSON.parse(snapshot.body) as Catalog;
  return {
    catalog: { ...parsed, version: snapshot.version },
    versions: new Map((results[1]?.results ?? []).map((r) => [entityKey(r.kind as EntityKind, r.id as string), r.version as number])),
    tombstones: new Map((results[2]?.results ?? []).map((r) => [entityKey(r.kind as EntityKind, r.id as string), r.version as number])),
    settingsVersion: (results[3]?.results[0]?.version as number | undefined) ?? 0,
    existingMedia: new Set((results[4]?.results ?? []).map((r) => r.key as string)),
    replay: (results[5]?.results[0] as ReadState['replay']) ?? null,
    stockRows: (results[6]?.results ?? []) as unknown as StockRow[],
    tracked: (results[7]?.results ?? []).map((r) => r.product_id as string),
    contentVersions: new Map(
      (results[8]?.results ?? []).flatMap((r) => {
        const sid = String(r.key).slice('site:'.length);
        const version = (JSON.parse(String(r.data)) as { version?: unknown }).version;
        return isSectionId(sid) && typeof version === 'number' ? [[sid, version] as const] : [];
      }),
    ),
  };
}

/** Drops changes that would not change anything (same data, deleting what is gone). */
function effectiveChanges(catalog: Catalog, changes: Change[]): Change[] {
  return changes.filter((change) => {
    if (change.kind === 'settings') return !jsonEqual(catalog.settings, change.data);
    if (change.kind === 'content') {
      const stored = catalog.content?.[change.id];
      return change.op === 'delete' ? stored !== undefined : !jsonEqual(stored, change.data);
    }
    const current = (catalog[LIST[change.kind]] as { id: string }[]).find((e) => e.id === change.id);
    return change.op === 'delete' ? current !== undefined : !jsonEqual(current, change.data);
  });
}

function referencedMedia(changes: Change[]): string[] {
  const keys = new Set<string>();
  for (const change of changes) {
    if (change.op !== 'upsert' || change.kind === 'settings' || change.kind === 'category') continue;
    const sources =
      change.kind === 'content'
        ? contentImageSources({ [change.id]: change.data })
        : change.kind === 'product'
          ? imageSourcesOf({ products: [change.data], collections: [] })
          : imageSourcesOf({ products: [], collections: [change.data] });
    for (const src of sources) {
      if (isDataUrl(src)) throw new HttpError('bad_request', 'Envie as fotos antes de salvar (foto sem envio encontrada).');
      if (MEDIA_KEY_PATTERN.test(src)) keys.add(src.slice('media/'.length));
    }
  }
  return [...keys];
}

function auditSummary(changes: Change[]): string {
  const parts = changes.map((c) => (c.kind === 'settings' ? 'configurações' : c.kind === 'content' ? `site ${c.id} (${c.op === 'delete' ? 'texto original' : 'editado'})` : `${c.kind} ${c.id} (${c.op})`));
  const text = `${changes.length} alteração(ões): ${parts.join(', ')}`;
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

/**
 * POST /api/admin/changes { baseVersion, changes } (+ optional Idempotency-Key).
 * Validates, detects conflicts, checks integrity on the merged catalog and
 * commits everything in one guarded batch; retries if another write landed
 * between the read and the commit.
 */
export async function handleChanges(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const { DB: db } = ctx.env;
  const type = ctx.request.headers.get('Content-Type') ?? '';
  if (!/^application\/json\b/i.test(type)) throw new HttpError('unsupported_type', 'Envie os dados em JSON.');
  const bytes = await readBody(ctx.request, CHANGES_MAX_BYTES);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError('bad_request', 'Não foi possível ler os dados enviados.');
  }
  const parsed = changeSetSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError('bad_request', `Dados inválidos: ${issue?.message ?? 'formato inesperado'}.`, zodDetails(parsed.error.issues));
  }
  const { baseVersion } = parsed.data;
  const changes = parsed.data.changes as Change[];
  const idempotencyKey = ctx.request.headers.get('Idempotency-Key');
  if (idempotencyKey !== null && !/^[A-Za-z0-9_-]{16,64}$/.test(idempotencyKey)) throw new HttpError('bad_request', 'Chave de envio inválida.');
  const requestHash = await sha256Hex(bytes);
  const mediaKeys = referencedMedia(changes);
  await ensureSeeded(db);

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    // Lost a compare-and-swap race: back off with jitter so contending writers spread out.
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 4)));
    const state = await readState(db, changes, mediaKeys, idempotencyKey);
    if (state.replay) {
      if (state.replay.request_hash !== requestHash) throw new HttpError('bad_request', 'Esta chave de envio já foi usada para outros dados.');
      return json(JSON.parse(state.replay.response));
    }
    if (baseVersion > state.catalog.version) throw new HttpError('conflict', 'Seu painel está à frente do servidor. Recarregue a página.');

    const conflicts = findConflicts(state, changes, baseVersion);
    if (conflicts.length) throw new HttpError('conflict', conflictMessage(conflicts), { conflicts, version: state.catalog.version });

    const missing = mediaKeys.filter((k) => !state.existingMedia.has(k));
    if (missing.length) throw new HttpError('integrity', 'Uma das fotos não terminou de ser enviada. Tente salvar de novo.', { missingMedia: missing });

    const effective = effectiveChanges(state.catalog, changes);
    if (!effective.length) return json({ version: state.catalog.version, from: state.catalog.version, applied: 0 });

    const applied = applyChanges(state.catalog, effective);
    // Stock lives in its own tables; the snapshot copy follows the new catalog (removed finishes/sizes drop out).
    const next: Catalog = { ...applied, stock: materializeStock(applied.products, state.tracked, state.stockRows) };
    const orphans = orphanRows(applied.products, state.stockRows);
    if (next.products.length > MAX_PRODUCTS || next.categories.length > MAX_CATEGORIES || next.collections.length > MAX_COLLECTIONS) {
      throw new HttpError('integrity', 'O catálogo atingiu o limite de itens.');
    }
    const problem = checkIntegrity(next);
    if (problem) throw new HttpError('integrity', problem);

    const version = nextVersion(state.catalog.version);
    const body = snapshotBody(next, version);
    if (new TextEncoder().encode(body).byteLength > SNAPSHOT_MAX_BYTES) {
      throw new HttpError('integrity', 'O catálogo ficou grande demais para salvar. Encurte descrições ou remova peças antigas.');
    }
    // `from` lets the client tell whether another write landed between its base and this one.
    const response = { version, from: state.catalog.version, applied: effective.length };
    const now = Date.now();
    const pick = (kind: EntityKind, op: 'upsert' | 'delete') => effective.filter((c) => c.kind === kind && c.op === op);
    const upserts = (kind: EntityKind) => pick(kind, 'upsert').map((c) => (c as { data: Product | Category | Collection }).data);
    const deletes = (kind: EntityKind) => pick(kind, 'delete').map((c) => (c as { id: string }).id);
    const settingsChange = effective.find((c) => c.kind === 'settings') as { data: Settings } | undefined;
    const contentChanges = effective.filter((c): c is Extract<Change, { kind: 'content' }> => c.kind === 'content');
    const at = new Date(now).toISOString();

    const statements: D1PreparedStatement[] = [
      guard(db, '(SELECT version FROM catalog_snapshot WHERE id = 1) = ?1', state.catalog.version),
      // Parents before children on upsert, children before parents on delete (foreign keys are enforced per statement).
      ...upsertStatements(db, 'category', upserts('category'), version),
      ...upsertStatements(db, 'collection', upserts('collection'), version),
      ...upsertStatements(db, 'product', upserts('product'), version),
      ...deleteStatements(db, 'product', deletes('product'), version),
      ...deleteStatements(db, 'collection', deletes('collection'), version),
      ...deleteStatements(db, 'category', deletes('category'), version),
      ...(orphans.length
        ? [
            db
              .prepare(
                `DELETE FROM stock_levels WHERE (product_id || '|' || variant_id || '|' || size) IN (SELECT value FROM json_each(?1))`,
              )
              .bind(JSON.stringify(orphans.map((o) => `${o.product_id}|${o.variant_id}|${o.size}`))),
          ]
        : []),
      ...(settingsChange
        ? [
            db.prepare('INSERT INTO settings (id, version, data) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data').bind(
              version,
              JSON.stringify(settingsChange.data),
            ),
          ]
        : []),
      // A restore keeps the row (content null) so a stale save from another device is caught as a conflict.
      ...contentChanges.map((c) =>
        db
          .prepare('INSERT INTO app_config (key, updated_at, data) VALUES (?1, ?2, ?3) ON CONFLICT (key) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data')
          .bind(`site:${c.id}`, at, JSON.stringify({ version, content: c.op === 'upsert' ? c.data : null })),
      ),
      db.prepare('UPDATE catalog_snapshot SET version = ?1, body = ?2 WHERE id = 1').bind(version, body),
      db.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(new Date(now).toISOString(), 'catalog.changes', auditSummary(effective)),
    ];
    if (idempotencyKey) {
      statements.push(
        db.prepare('INSERT INTO idempotency (key, request_hash, created_at, response) VALUES (?1, ?2, ?3, ?4)').bind(idempotencyKey, requestHash, now, JSON.stringify(response)),
        db.prepare('DELETE FROM idempotency WHERE created_at < ?1').bind(now - IDEMPOTENCY_TTL_MS),
      );
    }
    try {
      await db.batch(statements);
    } catch (error) {
      if (isGuardMiss(error)) continue; // another write landed in between: re-read and retry
      const message = error instanceof Error ? error.message : '';
      if (/FOREIGN KEY constraint failed/i.test(message)) throw new HttpError('integrity', 'A alteração deixaria peças sem categoria.');
      if (/UNIQUE constraint failed: idempotency/i.test(message)) continue; // a concurrent retry committed it: replay
      throw toHttpError(error);
    }
    ctx.waitUntil(notifyCatalog(ctx.env, version));
    return json(response);
  }
  throw new HttpError('unavailable', 'Muitas alterações ao mesmo tempo. Tente de novo.');
}

/** GET /api/admin/backup — catalog plus leads, in the backup format. */
export async function handleBackup(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const snapshot = await ensureSeeded(ctx.env.DB);
  // Newest first, bounded by what a backup file may hold.
  const { results } = await withReadRetry(() => ctx.env.DB.prepare('SELECT data FROM leads ORDER BY created_at DESC LIMIT ?1').bind(MAX_LEADS).all<{ data: string }>());
  const catalog = JSON.parse(snapshot.body) as Catalog & { version?: number };
  delete catalog.version;
  return json({ ...catalog, schemaVersion: SCHEMA_VERSION, leads: results.map((r) => JSON.parse(r.data)) });
}
