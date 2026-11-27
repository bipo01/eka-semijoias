import { MEDIA_GRACE_MS, MEDIA_SWEEP_LIMIT, mediaFilesIn, unusedMedia, type MediaRow } from '../src/data/mediaSweep';
import { requireSession } from './auth';
import { ensureSeeded } from './catalog';
import { guard, isGuardMiss, toHttpError, withReadRetry } from './db';
import type { Env } from './env';
import { json } from './http';
import type { Context } from './router';

/*
 * Erases uploaded photos nothing uses any more (docs/arquivos/PLAN.md, front C). A photo counts as used
 * when its "media/<sha256>" key appears anywhere in the catalog snapshot's pieces and collections or in
 * any saved site section (read raw, without its schema). A save never deletes: it restarts the clock of
 * the photos it lets go (worker/catalog.ts); the daily cron and "Apagar agora" (Painel → Backup) delete
 * the photos nothing used, uploaded or let go for MEDIA_GRACE_MS (a day). The delete is guarded by the
 * catalog version and checks the time again inside the batch, so a save or an upload that lands
 * meanwhile always wins and the photo stays until the next run.
 */

/** The grace period; tests may shorten it (DEV_MEDIA_GRACE_MS), production always uses MEDIA_GRACE_MS. */
export function mediaGraceMs(env: Env): number {
  const override = env.DEV_MEDIA_GRACE_MS?.trim() ? Number(env.DEV_MEDIA_GRACE_MS) : NaN;
  return Number.isFinite(override) && override >= 0 ? override : MEDIA_GRACE_MS;
}

/** Deletes the given rows still older than the cutoff (time checked again inside the batch); returns the deleted keys. */
export function deleteMediaStatement(db: D1Database, rows: MediaRow[], cutoffMs: number): D1PreparedStatement {
  return db
    .prepare('DELETE FROM media WHERE key IN (SELECT value FROM json_each(?1)) AND created_at < ?2 RETURNING key, size')
    .bind(JSON.stringify(rows.map((r) => r.key)), new Date(cutoffMs).toISOString());
}

/** After a committed delete: the same objects leave R2 (when bound), and one log line with counts only. */
export async function afterMediaDelete(env: Env, result: D1Result | undefined, source: 'cron' | 'admin'): Promise<{ deleted: number; deletedBytes: number }> {
  const rows = ((result?.results ?? []) as { key: string; size: number }[]).filter((r) => typeof r.key === 'string');
  const deletedBytes = rows.reduce((sum, r) => sum + (Number(r.size) || 0), 0);
  if (rows.length && env.MEDIA) {
    try {
      // Only objects whose row is still gone: an upload of the same bytes meanwhile stored it again.
      const back = await env.DB.prepare('SELECT key FROM media WHERE key IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(rows.map((r) => r.key))).all<{ key: string }>();
      const again = new Set((back.results ?? []).map((r) => r.key));
      const gone = rows.map((r) => r.key).filter((key) => !again.has(key));
      if (gone.length) await env.MEDIA.delete(gone);
    } catch (error) {
      // The row is gone, so the photo is unused either way; an object left behind only costs storage.
      console.log(JSON.stringify({ event: 'media_sweep_r2_failed', count: rows.length, message: error instanceof Error ? error.message : String(error) }));
    }
  }
  if (rows.length) console.log(JSON.stringify({ event: 'media_sweep', source, deleted: rows.length, bytes: deletedBytes }));
  return { deleted: rows.length, deletedBytes };
}

interface SweepState {
  version: number;
  used: Set<string>;
  rows: MediaRow[];
}

/** Every photo the catalog uses (snapshot pieces and collections, every saved site section) and every stored photo. */
async function readSweepState(db: D1Database): Promise<SweepState> {
  await ensureSeeded(db);
  const results = await withReadRetry(() =>
    db.batch<Record<string, unknown>>([
      db.prepare('SELECT version, body FROM catalog_snapshot WHERE id = 1'),
      db.prepare(`SELECT data FROM app_config WHERE key LIKE 'site:%'`),
      // Key, time and size only (the bytes column is never read).
      db.prepare('SELECT key, created_at, size FROM media'),
    ]),
  );
  const snapshot = results[0]?.results[0] as { version: number; body: string } | undefined;
  if (!snapshot) throw new Error('catalog snapshot missing');
  const parsed = JSON.parse(snapshot.body) as { products?: unknown; collections?: unknown; content?: unknown };
  // Unreadable site rows make the whole run fail rather than let their photos look unused.
  const sections = (results[1]?.results ?? []).map((r) => JSON.parse(String(r.data)) as unknown);
  return {
    version: snapshot.version,
    used: mediaFilesIn([parsed.products, parsed.collections, parsed.content, sections]),
    rows: (results[2]?.results ?? []) as unknown as MediaRow[],
  };
}

/**
 * One sweep outside a save (cron, Painel → Backup). `busy`: a save landed between the read and the
 * delete, nothing was deleted, and the next run takes it.
 */
export async function sweepUnusedMedia(env: Env, source: 'cron' | 'admin', now = Date.now()): Promise<{ deleted: number; deletedBytes: number; busy?: true }> {
  const db = env.DB;
  const state = await readSweepState(db);
  const cutoff = now - mediaGraceMs(env);
  const unused = unusedMedia(state.used, state.rows, new Date(cutoff).toISOString(), MEDIA_SWEEP_LIMIT);
  if (!unused.length) return { deleted: 0, deletedBytes: 0 };
  let results: D1Result[];
  try {
    results = await db.batch([guard(db, '(SELECT version FROM catalog_snapshot WHERE id = 1) = ?1', state.version), deleteMediaStatement(db, unused, cutoff)]);
  } catch (error) {
    if (isGuardMiss(error)) return { deleted: 0, deletedBytes: 0, busy: true };
    throw error;
  }
  return afterMediaDelete(env, results[1], source);
}

/** GET /api/admin/media/usage — stored photos, and how many of them nothing uses (erasable now, or still in the grace period). */
export async function handleMediaUsage(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  let state: SweepState;
  try {
    state = await readSweepState(ctx.env.DB);
  } catch (error) {
    throw toHttpError(error);
  }
  const cutoff = new Date(Date.now() - mediaGraceMs(ctx.env)).toISOString();
  const unused = unusedMedia(state.used, state.rows, null, Number.MAX_SAFE_INTEGER);
  const erasable = unused.filter((r) => r.created_at < cutoff);
  const bytes = (rows: MediaRow[]) => rows.reduce((sum, r) => sum + (Number(r.size) || 0), 0);
  return json(
    {
      stored: state.rows.length,
      storedBytes: bytes(state.rows),
      unused: erasable.length,
      unusedBytes: bytes(erasable),
      recent: unused.length - erasable.length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** POST /api/admin/media/sweep — "Apagar agora": erases the photos nothing uses (not the ones uploaded or let go in the last day). */
export async function handleMediaSweep(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  try {
    const result = await sweepUnusedMedia(ctx.env, 'admin');
    return json(result);
  } catch (error) {
    throw toHttpError(error);
  }
}
