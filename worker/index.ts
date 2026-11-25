import { handleChangePin, handleLogin, handleLogout, handleSessionStatus } from './auth';
import { handleBackup, handleCatalog, handleChanges, parseSnapshotBody, readSnapshot } from './catalog';
import type { Catalog } from '../src/data/schema';
import { isPrivatePath, pageMeta, type PageMeta } from './seo';
import { APP_HEAD, appForPath } from '../src/lib/appHead';
import { handleCreateCustomer, handleDeleteCustomer, handleGetCustomer, handleLinkOrderCustomer, handleListCustomers, handleUpdateCustomer } from './customers';
import { toHttpError } from './db';
import type { Env } from './env';
import { assertSameOrigin, errorResponse, HttpError, json } from './http';
import { handleCreateLead, handleDeleteLead, handleListLeads, handlePatchLead } from './leads';
import { handleContractCheck, handleCreateKit, handleCreateReseller, handleEditKit, handleEraseReseller, handleGetProgram, handleGetReseller, handleKitPaid, handleKitReportClear, handleListResellers, handleNewInvite, handlePatchReseller, handlePutProgram, handleSettleKit } from './resellers';
import { handleAcceptContract, handleAcceptInvite, handleCancelResellerSale, handleGetInvite, handleReportRepasse, handleResellerLogin, handleResellerLogout, handleResellerMe, handleResellerSale, handleShowcase } from './revenda';
import { handleLive } from './live';
import { handleAnonymizeOrder, handleCreateManualOrder, handleCreateOrder, handleDeleteOrder, handleEditOrderItems, handleListOrders, handleOrderStatus } from './orders';
import { handleCharge, handleGetReceipt, handlePayView, handleUploadReceipt } from './payments';
import { handlePushDelete, handlePushStatus, handlePushSubscribe, handlePushTest } from './push';
import { handleGetStock, handlePutStock, handleSetStockMotive, handleStockMove } from './stock';
import { handleMedia, handleUpload } from './media';
import { handleCheckMpPix, handleCreateMpPix, handleMpWebhook } from './mercadopago';
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
  .on('POST', '/api/orders', handleCreateOrder)
  .on('GET', '/api/pay/:token', handlePayView)
  .on('POST', '/api/pay/:token/receipt', handleUploadReceipt)
  .on('POST', '/api/pay/:token/pix', handleCreateMpPix)
  .on('POST', '/api/pay/:token/pix/check', handleCheckMpPix)
  .on('POST', '/api/webhooks/mercadopago', handleMpWebhook)
  .on('GET', '/api/admin/session', handleSessionStatus)
  .on('POST', '/api/admin/login', handleLogin)
  .on('POST', '/api/admin/logout', handleLogout)
  .on('POST', '/api/admin/pin', handleChangePin)
  .on('POST', '/api/admin/changes', handleChanges)
  .on('GET', '/api/admin/backup', handleBackup)
  .on('POST', '/api/admin/media', handleUpload)
  .on('GET', '/api/admin/leads', handleListLeads)
  .on('DELETE', '/api/admin/leads/:id', handleDeleteLead)
  .on('PATCH', '/api/admin/leads/:id', handlePatchLead)
  .on('GET', '/api/admin/reseller-program', handleGetProgram)
  .on('PUT', '/api/admin/reseller-program', handlePutProgram)
  .on('GET', '/api/admin/resellers', handleListResellers)
  .on('POST', '/api/admin/resellers', handleCreateReseller)
  .on('GET', '/api/admin/resellers/:id', handleGetReseller)
  .on('PATCH', '/api/admin/resellers/:id', handlePatchReseller)
  .on('POST', '/api/admin/resellers/:id/invite', handleNewInvite)
  .on('POST', '/api/admin/resellers/:id/contract-check', handleContractCheck)
  .on('POST', '/api/admin/resellers/:id/erase', handleEraseReseller)
  .on('POST', '/api/admin/resellers/:id/kits', handleCreateKit)
  .on('PUT', '/api/admin/kits/:id/items', handleEditKit)
  .on('POST', '/api/admin/kits/:id/settle', handleSettleKit)
  .on('POST', '/api/admin/kits/:id/paid', handleKitPaid)
  .on('POST', '/api/admin/kits/:id/report-clear', handleKitReportClear)
  .on('GET', '/api/revenda/invite/:token', handleGetInvite)
  .on('POST', '/api/revenda/invite/:token', handleAcceptInvite)
  .on('POST', '/api/revenda/login', handleResellerLogin)
  .on('POST', '/api/revenda/contract', handleAcceptContract)
  .on('POST', '/api/revenda/logout', handleResellerLogout)
  .on('GET', '/api/revenda/me', handleResellerMe)
  .on('POST', '/api/revenda/sales', handleResellerSale)
  .on('POST', '/api/revenda/sales/:id/cancel', handleCancelResellerSale)
  .on('POST', '/api/revenda/settlements/:kitId/report', handleReportRepasse)
  .on('GET', '/api/r/:slug', handleShowcase)
  .on('GET', '/api/admin/orders', handleListOrders)
  .on('POST', '/api/admin/orders', handleCreateManualOrder)
  .on('PUT', '/api/admin/orders/:id/items', handleEditOrderItems)
  .on('POST', '/api/admin/orders/:id/status', handleOrderStatus)
  .on('POST', '/api/admin/orders/:id/anonymize', handleAnonymizeOrder)
  .on('DELETE', '/api/admin/orders/:id', handleDeleteOrder)
  .on('POST', '/api/admin/orders/:id/customer', handleLinkOrderCustomer)
  .on('GET', '/api/admin/customers', handleListCustomers)
  .on('POST', '/api/admin/customers', handleCreateCustomer)
  .on('GET', '/api/admin/customers/:id', handleGetCustomer)
  .on('PUT', '/api/admin/customers/:id', handleUpdateCustomer)
  .on('DELETE', '/api/admin/customers/:id', handleDeleteCustomer)
  .on('POST', '/api/admin/orders/:id/charge', handleCharge)
  .on('GET', '/api/admin/receipts/:id', handleGetReceipt)
  .on('GET', '/api/admin/push', handlePushStatus)
  .on('POST', '/api/admin/push/subscribe', handlePushSubscribe)
  .on('POST', '/api/admin/push/test', handlePushTest)
  .on('DELETE', '/api/admin/push/:id', handlePushDelete)
  .on('GET', '/api/admin/stock', handleGetStock)
  .on('POST', '/api/admin/stock/moves', handleStockMove)
  .on('PUT', '/api/admin/stock-motives', handleSetStockMotive)
  .on('PUT', '/api/admin/stock/:productId', handlePutStock)
  .on('GET', '/media/:file', handleMedia);

/**
 * Hosts the photo standardizer downloads its background-removal model from (admin only, first use;
 * then the browser cache). The ONNX Runtime WASM files are served by this site.
 */
export const MODEL_HOSTS = ['https://huggingface.co', 'https://*.huggingface.co', 'https://*.hf.co'];

/**
 * Content Security Policy for the SPA document; the WebSocket host is listed explicitly (older Safari
 * does not match wss: with 'self'). Every page may register the root service worker (install + push);
 * only /admin may run WebAssembly and fetch the model (the photo standardizer).
 */
export function documentCsp(url: URL): string {
  const ws = `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`;
  const admin = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
  return [
    "default-src 'self'",
    admin ? "script-src 'self' 'wasm-unsafe-eval'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${ws}${admin ? ` ${MODEL_HOSTS.join(' ')}` : ''}`,
    "manifest-src 'self'",
    admin ? "worker-src 'self' blob:" : "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(url.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/**
 * Hashed build output (/assets/*). A file that exists never changes: immutable, so Workers Caching
 * answers repeats at the edge. A missing one is `no-store`: during a deploy rollout a new page can ask
 * for a file this edge does not serve yet, and that 404 must not be cached (a cached 404 for the entry
 * script blanks the whole site until the next build renames it).
 */
async function serveAsset(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  response.headers.set('Cache-Control', asset.status === 200 || asset.status === 304 ? 'public, max-age=31536000, immutable' : 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

async function serveDocument(request: Request, env: Env, url: URL): Promise<Response> {
  // A real file at this path is served as is; any other page route gets the SPA document. (Assets use
  // not_found_handling "none": a missing /assets/*.js must be a 404, never index.html cached as
  // immutable JavaScript by the browser — an old tab after a deploy would stay blank.)
  // The page tags depend on the catalog, not on the static file: no conditional request to the
  // assets (a 304 would keep old titles), and no static validators on the rewritten document.
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const plain = new Request(request.url, { method: request.method, headers });
  let asset = await env.ASSETS.fetch(plain);
  if (asset.status === 404) asset = await env.ASSETS.fetch(new Request(new URL('/', url), { method: request.method, headers }));
  const response = new Response(asset.body, asset);
  if (!(response.headers.get('Content-Type') ?? '').includes('text/html')) return response;
  response.headers.set('Content-Security-Policy', documentCsp(url));
  response.headers.set('Cache-Control', 'no-cache');
  response.headers.delete('ETag');
  response.headers.delete('Last-Modified');
  if (request.method !== 'GET' || !response.ok) return response;
  return withAppHead(withPageMeta(response, pageMeta(url, isPrivatePath(url.pathname) ? null : await catalogForMeta(env))), url);
}

/**
 * The panels are installable apps of their own ("Painel ÉKA", "ÉKA Revenda"). Safari on iOS 26 reads
 * the home-screen name and icon from the document the server sends, not from tags the app swaps in
 * later, so the panel pages get their manifest, icon and title here (the app keeps them in sync on
 * in-app navigation).
 */
function withAppHead(response: Response, url: URL): Response {
  const app = appForPath(url.pathname);
  if (app === 'store') return response;
  const head = APP_HEAD[app];
  return new HTMLRewriter()
    .on('link[rel="manifest"]', { element: (el) => void el.setAttribute('href', head.manifest) })
    .on('link[rel="apple-touch-icon"]', { element: (el) => void el.setAttribute('href', head.appleTouchIcon) })
    .on('meta[name="apple-mobile-web-app-title"]', { element: (el) => void el.setAttribute('content', head.appleTitle) })
    .transform(response);
}

/**
 * The published catalog for the page tags, kept per isolate for a minute (tags may lag an edit by up
 * to 60 s; the page itself always loads the live catalog). Any failure falls back to the built-in tags.
 */
let metaCache: { at: number; catalog: Catalog | null } | null = null;
const META_TTL_MS = 60_000;
async function catalogForMeta(env: Env): Promise<Catalog | null> {
  if (metaCache && Date.now() - metaCache.at < META_TTL_MS) return metaCache.catalog;
  try {
    const snapshot = await readSnapshot(env.DB);
    const catalog = snapshot ? parseSnapshotBody(snapshot.body) : null;
    metaCache = { at: Date.now(), catalog };
    return catalog;
  } catch (error) {
    log({ event: 'meta_fallback', message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Writes the page's title, description, share picture and robots rule into the SPA document. */
function withPageMeta(response: Response, meta: PageMeta): Response {
  const set = (value: string) => ({ element: (el: Element) => void el.setAttribute('content', value) });
  return new HTMLRewriter()
    .on('title', { element: (el) => void el.setInnerContent(meta.title) })
    .on('meta[name="description"]', set(meta.description))
    .on('meta[property="og:title"]', set(meta.title))
    .on('meta[property="og:description"]', set(meta.description))
    .on('meta[property="og:image"]', set(meta.image))
    .on('meta[property="og:type"]', set(meta.type))
    // The built-in hero picture is preloaded only where it is the first thing on screen.
    .on('link[rel="preload"][as="image"]', { element: (el) => void (meta.preloadHero ? undefined : el.remove()) })
    .on('head', {
      element: (el) =>
        void el.append(
          [
            `<meta property="og:url" content="${escapeAttr(meta.url)}" />`,
            `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
            `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
            `<meta name="twitter:image" content="${escapeAttr(meta.image)}" />`,
            `<link rel="canonical" href="${escapeAttr(meta.url)}" />`,
            ...(meta.noindex ? ['<meta name="robots" content="noindex, nofollow" />'] : []),
          ].join(''),
          { html: true },
        ),
    })
    .transform(response);
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
      if (url.pathname.startsWith('/assets/') && (request.method === 'GET' || request.method === 'HEAD')) {
        route = 'asset';
        response = await serveAsset(request, env);
      } else if (isPageRoute(url.pathname) && (request.method === 'GET' || request.method === 'HEAD')) {
        route = 'document';
        response = await serveDocument(request, env, url);
      } else {
        const match = router.match(request.method, url.pathname);
        if (!match) throw new HttpError('not_found');
        if ('allowed' in match) throw new HttpError('method_not_allowed', undefined, undefined, { Allow: match.allowed.join(', ') });
        route = match.name;
        // Webhooks come from the provider's servers (no Origin); they authenticate by signature instead.
        if (request.method !== 'GET' && request.method !== 'HEAD' && !url.pathname.startsWith('/api/webhooks/')) assertSameOrigin(request);
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
      // Cached copies of an asset are shared by every visitor: no per-request id in them.
      if (route === 'asset') response.headers.delete('X-Request-Id');
    }
    if (route !== 'asset' || response.status !== 200) log({ event: 'request', requestId, method: request.method, route, status: response.status, ms: Date.now() - started });
    return response;
  },
} satisfies ExportedHandler<Env>;
