/*
 * HTTP helpers: JSON responses, the error shape, body limits and the
 * same-origin guard. Every API error is `{ error: { code, message, details? } }`
 * with a pt-BR message the UI can show as is.
 */

export type ErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'invalid_pin'
  | 'forbidden_origin'
  | 'not_found'
  | 'method_not_allowed'
  | 'conflict'
  | 'too_large'
  | 'unsupported_type'
  | 'integrity'
  | 'rate_limited'
  | 'not_configured'
  | 'unavailable'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  invalid_pin: 401,
  forbidden_origin: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  too_large: 413,
  unsupported_type: 415,
  integrity: 422,
  rate_limited: 429,
  not_configured: 503,
  unavailable: 503,
  internal: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  bad_request: 'Os dados enviados não estão corretos.',
  unauthenticated: 'Sua sessão terminou. Entre de novo com o PIN.',
  invalid_pin: 'PIN incorreto. Tente de novo.',
  forbidden_origin: 'Pedido recusado.',
  not_found: 'Não encontrado.',
  method_not_allowed: 'Operação não permitida.',
  conflict: 'Outro aparelho alterou estes dados agora há pouco.',
  too_large: 'O envio é grande demais.',
  unsupported_type: 'Formato não aceito.',
  integrity: 'A alteração deixaria o catálogo inconsistente.',
  rate_limited: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  not_configured: 'O painel ainda não está configurado no servidor.',
  unavailable: 'O servidor está ocupado agora. Tente de novo em instantes.',
  internal: 'Algo deu errado no servidor. Tente de novo.',
};

export class HttpError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.status = STATUS[code];
  }
}

/** Headers on every Worker response (API and media). Static assets get theirs from public/_headers. */
export const BASE_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const API_HEADERS: Record<string, string> = {
  ...BASE_HEADERS,
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export function json(body: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...API_HEADERS });
  new Headers(init.headers).forEach((value, key) => (key === 'set-cookie' ? headers.append(key, value) : headers.set(key, value)));
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

/** A JSON body that is already serialized (the stored catalog snapshot). */
export function rawJson(body: string, headers: Record<string, string>, status = 200): Response {
  return new Response(status === 304 ? null : body, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...API_HEADERS, ...headers },
  });
}

export function errorResponse(error: HttpError): Response {
  return json(
    { error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) } },
    { status: error.status, headers: error.headers ?? {} },
  );
}

/** Reads the body as bytes, refusing anything over `limit` without buffering it all. */
export async function readBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > limit) throw new HttpError('too_large');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError('too_large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Parses a JSON request body (Content-Type must be JSON, which also blocks cross-site HTML forms). */
export async function readJson(request: Request, limit: number): Promise<unknown> {
  const type = request.headers.get('Content-Type') ?? '';
  if (!/^application\/json\b/i.test(type)) throw new HttpError('unsupported_type', 'Envie os dados em JSON.');
  const bytes = await readBody(request, limit);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError('bad_request', 'Não foi possível ler os dados enviados.');
  }
}

/**
 * CSRF guard for state-changing requests: the browser-set Origin must be this
 * site's own origin. Combined with SameSite=Strict cookies and JSON-only
 * bodies, cross-site requests cannot act with the admin session.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('Origin');
  const self = new URL(request.url).origin;
  if (origin !== self) throw new HttpError('forbidden_origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') throw new HttpError('forbidden_origin');
}

/** Turns a zod error into the `details` of a 400. */
export function zodDetails(issues: readonly { path: PropertyKey[]; message: string }[]): { path: string; message: string }[] {
  return issues.slice(0, 10).map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}
