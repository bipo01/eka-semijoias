import { handleChangePin, handleLogin, handleLogout, handleSessionStatus } from './auth';
import { handleBackup, handleCatalog, handleChanges } from './catalog';
import { toHttpError } from './db';
import type { Env } from './env';
import { assertSameOrigin, errorResponse, HttpError, json } from './http';
import { handleCreateLead, handleDeleteLead, handleListLeads, handlePatchLead } from './leads';
import { handleContractCheck, handleCreateKit, handleCreateReseller, handleEditKit, handleGetProgram, handleGetReseller, handleKitPaid, handleListResellers, handleNewInvite, handlePatchReseller, handlePutProgram, handleSettleKit } from './resellers';
import { handleAcceptInvite, handleCancelResellerSale, handleGetInvite, handleResellerLogin, handleResellerLogout, handleResellerMe, handleResellerSale, handleShowcase } from './revenda';
import { handleLive } from './live';
import { handleAnonymizeOrder, handleCreateManualOrder, handleCreateOrder, handleDeleteOrder, handleEditOrderItems, handleListOrders, handleOrderStatus } from './orders';
import { handleCharge, handleGetReceipt, handlePayView, handleUploadReceipt } from './payments';
import { handlePushDelete, handlePushStatus, handlePushSubscribe, handlePushTest } from './push';
import { handleGetStock, handlePutStock, handleStockMove } from './stock';
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
  .on('POST', '/api/admin/resellers/:id/kits', handleCreateKit)
  .on('PUT', '/api/admin/kits/:id/items', handleEditKit)
  .on('POST', '/api/admin/kits/:id/settle', handleSettleKit)
  .on('POST', '/api/admin/kits/:id/paid', handleKitPaid)
  .on('GET', '/api/revenda/invite/:token', handleGetInvite)
  .on('POST', '/api/revenda/invite/:token', handleAcceptInvite)
  .on('POST', '/api/revenda/login', handleResellerLogin)
  .on('POST', '/api/revenda/logout', handleResellerLogout)
  .on('GET', '/api/revenda/me', handleResellerMe)
  .on('POST', '/api/revenda/sales', handleResellerSale)
  .on('POST', '/api/revenda/sales/:id/cancel', handleCancelResellerSale)
  .on('GET', '/api/r/:slug', handleShowcase)
  .on('GET', '/api/admin/orders', handleListOrders)
  .on('POST', '/api/admin/orders', handleCreateManualOrder)
  .on('PUT', '/api/admin/orders/:id/items', handleEditOrderItems)
  .on('POST', '/api/admin/orders/:id/status', handleOrderStatus)
  .on('POST', '/api/admin/orders/:id/anonymize', handleAnonymizeOrder)
  .on('DELETE', '/api/admin/orders/:id', handleDeleteOrder)
  .on('POST', '/api/admin/orders/:id/charge', handleCharge)
  .on('GET', '/api/admin/receipts/:id', handleGetReceipt)
  .on('GET', '/api/admin/push', handlePushStatus)
  .on('POST', '/api/admin/push/subscribe', handlePushSubscribe)
  .on('POST', '/api/admin/push/test', handlePushTest)
  .on('DELETE', '/api/admin/push/:id', handlePushDelete)
  .on('GET', '/api/admin/stock', handleGetStock)
  .on('POST', '/api/admin/stock/moves', handleStockMove)
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
    }
    log({ event: 'request', requestId, method: request.method, route, status: response.status, ms: Date.now() - started });
    return response;
  },
} satisfies ExportedHandler<Env>;
