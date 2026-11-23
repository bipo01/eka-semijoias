/*
 * Fetch wrapper for the site's own API (same origin). Every failure becomes
 * an ApiError with a pt-BR message the UI can show as is; `retryable` tells
 * whether trying again can help (network loss, timeouts, 503).
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get retryable(): boolean {
    return this.status === 0 || this.status === 503 || this.status === 502 || this.status === 504 || this.code === 'timeout';
  }
}

export const NETWORK_MESSAGE = 'Sem conexão com o servidor. Confira a internet e tente de novo.';

export interface ApiOptions {
  method?: string;
  /** JSON body (sets Content-Type). */
  json?: unknown;
  /** Raw body (photos). */
  body?: BodyInit;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Extra attempts for retryable failures (GET-like requests, or writes with an Idempotency-Key). */
  retries?: number;
  signal?: AbortSignal;
}

export const apiUrl = (path: string) => `${BASE}${path}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once<T>(path: string, opts: ApiOptions): Promise<T> {
  // No custom headers on plain GETs, so the <link rel=preload> of /api/catalog can be reused.
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: opts.method ?? (opts.json !== undefined || opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
      credentials: 'same-origin',
      signal,
    });
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    if (timeout.aborted) throw new ApiError(0, 'timeout', 'O servidor demorou a responder. Tente de novo.');
    throw new ApiError(0, 'network', NETWORK_MESSAGE);
  }
  let payload: unknown = null;
  const text = await response.text().catch(() => '');
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(response.status, error?.code ?? 'http_error', error?.message ?? 'Algo deu errado no servidor. Tente de novo.', error?.details);
  }
  return payload as T;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const attempts = 1 + (opts.retries ?? 0);
  for (let attempt = 1; ; attempt++) {
    try {
      return await once<T>(path, opts);
    } catch (error) {
      if (!(error instanceof ApiError) || !error.retryable || attempt >= attempts) throw error;
      await sleep(400 * 2 ** (attempt - 1) + Math.random() * 300);
    }
  }
}

/** A random key so a retried write is applied once. */
export function idempotencyKey(): string {
  return crypto.randomUUID();
}

/** User-facing text for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Algo deu errado. Tente de novo.';
}
