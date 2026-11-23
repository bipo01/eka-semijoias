import { handleChangePin, handleLogin, handleLogout, handleSessionStatus } from './auth';
import { handleBackup, handleCatalog, handleChanges } from './catalog';
import { toHttpError } from './db';
import type { Env } from './env';
import { assertSameOrigin, errorResponse, HttpError, json } from './http';
import { handleCreateLead, handleDeleteLead, handleListLeads } from './leads';
import { handleLive } from './live';
import { handleMedia, handleUpload } from './media';
import { Router, type Context } from './router';

export { LiveHub } from './live';

/*
 * ÉKA Semijoias Worker. Static files (JS, CSS, photos, icons) are served by
 * Workers Static Assets without running this script. It runs for /api/*,
 * /media/* and every page route (/, /catalogo, /produto/<slug>, /admin…),
 * which get index.html (SPA fallback) with a per-host CSP.
 */

/** Page routes: anything that is not the API or an uploaded photo. */
const isPageRoute = (pathname: string) => !pathname.startsWith('/api/') && pathname !== '/api' && !pathname.startsWith('/media/');

const router = new Router()
  .on('GET', '/api/health', async () => json({ ok: true }))
  .on('GET', '/api/catalog', handleCatalog)
  .on('GET', '/api/catalog/v/:version', handleCatalog)
  .on('GET', '/api/live', handleLive)
  .on('POST', '/api/leads', handleCreateLead)
  .on('GET', '/api/admin/session', handleSessionStatus)
  .on('POST', '/api/admin/login', handleLogin)
  .on('POST', '/api/admin/logout', handleLogout)
  .on('POST', '/api/admin/pin', handleChangePin)
  .on('POST', '/api/admin/changes', handleChanges)
  .on('GET', '/api/admin/backup', handleBackup)
  .on('POST', '/api/admin/media', handleUpload)
  .on('GET', '/api/admin/leads', handleListLeads)
  .on('DELETE', '/api/admin/leads/:id', handleDeleteLead)
  .on('GET', '/media/:file', handleMedia);

/** Content Security Policy for the SPA document; the WebSocket host is listed explicitly (older Safari does not match wss: with 'self'). */
export function documentCsp(url: URL): string {
  const ws = `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${ws}`,
    "manifest-src 'self'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(url.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

async function serveDocument(request: Request, env: Env, url: URL): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  if ((response.headers.get('Content-Type') ?? '').includes('text/html')) {
    response.headers.set('Content-Security-Policy', documentCsp(url));
    response.headers.set('Cache-Control', 'no-cache');
  }
  return response;
}

function log(entry: Record<string, unknown>): void {
  console.log(JSON.stringify(entry));
}

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    const started = Date.now();
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    let route = 'unmatched';
    let response: Response;
    try {
      if (isPageRoute(url.pathname) && (request.method === 'GET' || request.method === 'HEAD')) {
        route = 'document';
        response = await serveDocument(request, env, url);
      } else {
        const match = router.match(request.method, url.pathname);
        if (!match) throw new HttpError('not_found');
        if ('allowed' in match) throw new HttpError('method_not_allowed', undefined, undefined, { Allow: match.allowed.join(', ') });
        route = match.name;
        if (request.method !== 'GET' && request.method !== 'HEAD') assertSameOrigin(request);
        const ctx: Context = { request, env, url, requestId, params: match.params, waitUntil: (p) => executionCtx.waitUntil(p) };
        response = await match.handler(ctx);
      }
    } catch (error) {
      if (!(error instanceof HttpError)) {
        log({ event: 'error', requestId, route, message: error instanceof Error ? error.message : String(error) });
      }
      response = errorResponse(error instanceof HttpError ? error : error instanceof URIError ? new HttpError('bad_request') : toHttpError(error));
    }
    if (response.status !== 101) {
      response = new Response(response.body, response);
      response.headers.set('X-Request-Id', requestId);
      // HEAD answers carry no body: never let the edge cache keep one for a GET.
      if (request.method === 'HEAD' && route !== 'document') response.headers.set('Cache-Control', 'no-store');
    }
    log({ event: 'request', requestId, method: request.method, route, status: response.status, ms: Date.now() - started });
    return response;
  },
} satisfies ExportedHandler<Env>;
