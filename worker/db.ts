import { HttpError } from './http';

/*
 * D1 helpers. Reads retry transient failures; writes rely on the version
 * guard + idempotency key instead (a write that may have committed must not be
 * blindly repeated).
 */

const TRANSIENT = [
  'Network connection lost',
  'storage caused object to be reset',
  'reset because its code was updated',
  'Cannot resolve D1 DB due to transient issue',
  'internal error',
  'D1 DB is overloaded',
  'Too many requests queued',
  'timed out',
];

export function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT.some((t) => message.toLowerCase().includes(t.toLowerCase()));
}

/** True when a batch was aborted by the `write_guard` CHECK (a compare-and-swap miss). */
export function isGuardMiss(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /CHECK constraint failed/i.test(message) && /ok\s*=\s*1|write_guard/i.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs a read with up to two retries on transient D1 errors (jittered backoff). */
export async function withReadRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts - 1) break;
      await sleep(40 * 2 ** attempt + Math.random() * 40);
    }
  }
  throw toHttpError(lastError);
}

/** Maps unexpected D1 failures to API errors (transient → 503 retryable, else 500). */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (isTransient(error)) return new HttpError('unavailable');
  return new HttpError('internal');
}

/**
 * A statement that aborts the surrounding batch unless `condition` is true.
 * D1 runs a batch as one transaction, so a failing statement rolls back all of it.
 */
export function guard(db: D1Database, condition: string, ...params: unknown[]): D1PreparedStatement {
  // `IS NOT 1` (not `NOT (...)`): a NULL condition must abort too.
  return db.prepare(`INSERT INTO write_guard (ok) SELECT 0 WHERE (${condition}) IS NOT 1`).bind(...params);
}
