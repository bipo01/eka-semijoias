/*
 * Uploaded photos nothing uses any more (docs/arquivos/PLAN.md, front C). Shared by the Worker and its
 * tests. A save never deletes a photo: it only restarts the photo's clock (`media.created_at`) when the
 * photo leaves the catalog, so "Desfazer" after deleting a piece, a tab that keeps its own version in a
 * conflict, or a save split in several requests still find the file. The daily cron and "Apagar agora"
 * delete what nothing uses and has not been uploaded, used or let go for MEDIA_GRACE_MS.
 */

/** A photo uploaded, or taken out of the catalog, this recently is never deleted. */
export const MEDIA_GRACE_MS = 24 * 60 * 60 * 1000;
/** Keys deleted per run: keeps a run inside the Free plan's per-request limits; the rest go the next time. */
export const MEDIA_SWEEP_LIMIT = 500;

/** "media/<sha256>.<ext>" → the stored file name. */
const MEDIA_REF = /^media\/([a-f0-9]{64}\.(?:webp|jpg|png))$/;

export interface MediaRow {
  /** File name without the "media/" prefix ("<sha256>.webp"). */
  key: string;
  /** ISO time of the last upload of these bytes, or of the last save that took the photo out of the catalog. */
  created_at: string;
  size?: number;
}

/**
 * File names of every uploaded photo referenced anywhere inside `value` (any depth, any shape): reading
 * the data without its schema, an older or newer shape of a site section can never hide a photo in use.
 */
export function mediaFilesIn(value: unknown, out = new Set<string>()): Set<string> {
  const stack: unknown[] = [value];
  while (stack.length) {
    const item = stack.pop();
    if (typeof item === 'string') {
      const match = MEDIA_REF.exec(item);
      if (match) out.add(match[1]!);
    } else if (Array.isArray(item)) {
      for (const v of item) stack.push(v);
    } else if (item && typeof item === 'object') {
      for (const v of Object.values(item)) stack.push(v);
    }
  }
  return out;
}

/** Photos `before` used and `after` no longer does (their clock restarts when the save commits). */
export function releasedMedia(before: unknown, after: unknown): string[] {
  const still = mediaFilesIn(after);
  return [...mediaFilesIn(before)].filter((key) => !still.has(key));
}

/** Rows nothing in `used` references, last touched before `cutoffIso`, oldest first, at most `limit`. */
export function unusedMedia<T extends MediaRow>(used: ReadonlySet<string>, rows: T[], cutoffIso: string | null, limit = MEDIA_SWEEP_LIMIT): T[] {
  return rows
    .filter((r) => !used.has(r.key) && (cutoffIso === null || r.created_at < cutoffIso))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .slice(0, Math.max(0, limit));
}
