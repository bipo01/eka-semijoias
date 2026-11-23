/*
 * ÉKA Semijoias service worker (scope "/").
 *
 * It does three things only: makes the site installable, shows Web Push notifications and opens
 * the right page when one is tapped. It caches nothing and has no fetch listener, so every request
 * goes to the network as usual and the site can never get stuck on an old version.
 *
 * Push payload (JSON): { title: string, body: string, url?: string, tag?: string }
 *   url: same-origin path to open on tap (default /admin/pedidos).
 *   tag: notifications with the same tag replace each other (and alert again).
 */

const DEFAULT_TITLE = 'ÉKA Semijoias';
const DEFAULT_BODY = 'Você tem uma novidade no painel.';
const DEFAULT_URL = '/admin/pedidos';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/** Same-origin absolute URL for a payload `url`, or the default; never another site. */
function targetUrl(url) {
  try {
    const resolved = new URL(typeof url === 'string' && url ? url : DEFAULT_URL, self.location.origin);
    if (resolved.origin === self.location.origin) return resolved.href;
  } catch {
    /* fall through to the default */
  }
  return new URL(DEFAULT_URL, self.location.origin).href;
}

/** Reads the push payload; anything missing or malformed falls back to a generic notice. */
function readPayload(event) {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  const ok = data && typeof data === 'object';
  const title = ok && typeof data.title === 'string' && data.title.trim() ? data.title : DEFAULT_TITLE;
  const body = ok && typeof data.body === 'string' && data.body.trim() ? data.body : DEFAULT_BODY;
  const tag = ok && typeof data.tag === 'string' && data.tag ? data.tag : undefined;
  return { title, body, tag, url: targetUrl(ok ? data.url : undefined) };
}

self.addEventListener('push', (event) => {
  const { title, body, tag, url } = readPayload(event);
  const options = {
    body,
    icon: '/admin-icon-192.png',
    badge: '/admin-badge-96.png',
    lang: 'pt-BR',
    data: { url },
  };
  if (tag) {
    options.tag = tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = targetUrl(event.notification.data && event.notification.data.url);
  const target = new URL(url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // A window already showing exactly that URL is just focused. Otherwise a window on the same page
      // (e.g. the panel on /admin/pedidos while the notice opens ?pedido=1049) or anywhere in the same
      // app area is focused and taken to the URL.
      const exact = windows.find((w) => w.url === target.href);
      if (exact) {
        await exact.focus();
        return;
      }
      const samePage = windows.find((w) => w.url.startsWith(target.origin + target.pathname));
      const panel = samePage ?? (target.pathname.startsWith('/admin') ? windows.find((w) => new URL(w.url).pathname.startsWith('/admin')) : undefined);
      if (panel) {
        await panel.focus();
        if ('navigate' in panel) await panel.navigate(url).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
