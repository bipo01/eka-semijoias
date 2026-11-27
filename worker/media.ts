import { requireSession } from './auth';
import { sha256Hex } from './crypto';
import { toHttpError, withReadRetry } from './db';
import { BASE_HEADERS, HttpError, json, readBody } from './http';
import type { Context } from './router';

/*
 * Uploaded photos: content-addressed (SHA-256 of the bytes), immutable,
 * stored in R2 when the MEDIA bucket is bound, otherwise in D1.
 */

export const MEDIA_MAX_BYTES = 1_000_000;
const EXTENSION: Record<string, 'webp' | 'jpg' | 'png'> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const CONTENT_TYPE: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };
const FILE_PATTERN = /^([a-f0-9]{64})\.(webp|jpg|png)$/;
const IMMUTABLE = 'public, max-age=31536000, immutable';

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((b, i) => bytes[offset + i] === b);

/** Detects the real image type from magic bytes (never trust the declared type alone). */
export function sniffImage(bytes: Uint8Array): 'image/webp' | 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 12 && startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (bytes.length >= 8 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  return null;
}

/** Detects the real type of a payment receipt from its first bytes (images, or PDF by "%PDF-"). */
export function sniffReceipt(bytes: Uint8Array): 'image/webp' | 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  const image = sniffImage(bytes);
  if (image) return image;
  if (bytes.length >= 5 && startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

/** POST /api/admin/media — raw image body; returns { key: "media/<sha256>.<ext>" }. Idempotent. */
export async function handleUpload(ctx: Context): Promise<Response> {
  await requireSession(ctx);
  const declared = (ctx.request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!EXTENSION[declared]) throw new HttpError('unsupported_type', 'Envie a foto em WebP, JPEG ou PNG.');
  const bytes = await readBody(ctx.request, MEDIA_MAX_BYTES);
  if (!bytes.length) throw new HttpError('bad_request', 'A foto chegou vazia.');
  if (bytes.length > MEDIA_MAX_BYTES) throw new HttpError('too_large', 'A foto passou de 1 MB.');
  const actual = sniffImage(bytes);
  if (actual !== declared) throw new HttpError('unsupported_type', 'O arquivo não é uma foto válida.');
  const file = `${await sha256Hex(bytes)}.${EXTENSION[declared]}`;
  const db = ctx.env.DB;
  const existing = await withReadRetry(() => db.prepare('SELECT key FROM media WHERE key = ?1').bind(file).first());
  const now = new Date().toISOString();
  // `created_at` is the last time the photo was uploaded (or let go by a save): a photo uploaded again
  // is about to be saved, so the sweep of unused photos (worker/mediaSweep.ts) leaves it alone for a day.
  let stored = false;
  try {
    // With R2 the object is written every time (idempotent): if a sweep deleted it a moment ago, the
    // upload that answers "saved" has really put it back.
    if (ctx.env.MEDIA) await ctx.env.MEDIA.put(file, bytes, { httpMetadata: { contentType: declared, cacheControl: IMMUTABLE } });
    if (existing) {
      const touched = await db.prepare('UPDATE media SET created_at = ?2 WHERE key = ?1').bind(file, now).run();
      stored = (touched.meta?.changes ?? 0) > 0; // 0: a sweep deleted the row meanwhile; store it again below
    }
    if (!stored) {
      if (ctx.env.MEDIA) await db.prepare('INSERT OR IGNORE INTO media (key, content_type, size, created_at) VALUES (?1, ?2, ?3, ?4)').bind(file, declared, bytes.length, now).run();
      else await db.prepare('INSERT OR IGNORE INTO media (key, content_type, size, created_at, bytes) VALUES (?1, ?2, ?3, ?4, ?5)').bind(file, declared, bytes.length, now, bytes).run();
    }
  } catch (error) {
    throw toHttpError(error);
  }
  return json({ key: `media/${file}` }, { status: existing ? 200 : 201 });
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return null;
}

/**
 * GET /media/:file — immutable; cached at the edge by Workers Caching. No
 * conditional (304) answers: immutable URLs are not revalidated by browsers,
 * and a cached 304 would poison the edge entry.
 */
export async function handleMedia(ctx: Context): Promise<Response> {
  const match = FILE_PATTERN.exec(ctx.params.file ?? '');
  if (!match) return new Response('Not found', { status: 404, headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store' } });
  const file = match[0];
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    'Content-Type': CONTENT_TYPE[match[2]!]!,
    'Cache-Control': IMMUTABLE,
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };

  if (ctx.env.MEDIA) {
    const object = await ctx.env.MEDIA.get(file);
    if (object) return new Response(ctx.request.method === 'HEAD' ? null : object.body, { headers: { ...headers, 'Content-Length': String(object.size) } });
  }
  const row = await withReadRetry(() => ctx.env.DB.prepare('SELECT bytes FROM media WHERE key = ?1').bind(file).first<{ bytes: unknown }>());
  const bytes = toBytes(row?.bytes);
  if (!bytes) return new Response('Not found', { status: 404, headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store' } });
  return new Response(ctx.request.method === 'HEAD' ? null : bytes, { headers: { ...headers, 'Content-Length': String(bytes.length) } });
}
