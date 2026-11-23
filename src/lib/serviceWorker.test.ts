import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// public/sw.js is plain JS served as-is; run it against a fake ServiceWorkerGlobalScope.
const source = readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8'); // vitest runs from the project root
const ORIGIN = 'https://eka.example';

interface FakeWindow {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

function windowAt(path: string): FakeWindow {
  return { url: ORIGIN + path, focus: vi.fn().mockResolvedValue(undefined), navigate: vi.fn().mockResolvedValue(undefined) };
}

function loadWorker(windows: FakeWindow[] = []) {
  const listeners = new Map<string, (event: unknown) => void>();
  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue(windows),
      openWindow: vi.fn().mockResolvedValue(null),
    },
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
  };
  new Function('self', source)(scope);

  const dispatch = async (type: string, event: object) => {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  };
  const push = (data: unknown) => dispatch('push', { data: { json: () => data } });
  const click = (url: string | undefined) => {
    const notification = { data: { url }, close: vi.fn() };
    return dispatch('notificationclick', { notification }).then(() => notification);
  };
  return { scope, listeners, push, click };
}

describe('service worker', () => {
  it('activates at once, claims open pages and never intercepts requests', async () => {
    const { scope, listeners } = loadWorker();
    listeners.get('install')?.({});
    expect(scope.skipWaiting).toHaveBeenCalled();
    const pending: Promise<unknown>[] = [];
    listeners.get('activate')?.({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
    expect(scope.clients.claim).toHaveBeenCalled();
    expect(listeners.has('fetch')).toBe(false);
  });

  it('shows the pushed title, body and target, replacing notifications with the same tag', async () => {
    const { scope, push } = loadWorker();
    await push({ title: 'Novo pedido nº 42', body: 'R$ 189,90 · 3 peças', url: '/admin/pedidos?pedido=42', tag: 'order-42' });
    expect(scope.registration.showNotification).toHaveBeenCalledWith('Novo pedido nº 42', {
      body: 'R$ 189,90 · 3 peças',
      icon: '/admin-icon-192.png',
      badge: '/admin-badge-96.png',
      lang: 'pt-BR',
      data: { url: `${ORIGIN}/admin/pedidos?pedido=42` },
      tag: 'order-42',
      renotify: true,
    });
  });

  it.each([
    ['no payload', undefined],
    ['text that is not JSON', { json: () => JSON.parse('oi') }],
    ['wrong types', { title: 3, body: null, url: 7 }],
  ])('falls back to a generic notice with %s', async (_, data) => {
    const { scope, listeners } = loadWorker();
    const pending: Promise<unknown>[] = [];
    const event = data && 'json' in data ? { data } : { data: data === undefined ? null : { json: () => data } };
    listeners.get('push')?.({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
    expect(scope.registration.showNotification).toHaveBeenCalledWith('ÉKA Semijoias', {
      body: 'Você tem uma novidade no painel.',
      icon: '/admin-icon-192.png',
      badge: '/admin-badge-96.png',
      lang: 'pt-BR',
      data: { url: `${ORIGIN}/admin/pedidos` },
    });
  });

  it('never points a notification at another site', async () => {
    const { scope, push } = loadWorker();
    await push({ title: 'x', body: 'y', url: 'https://evil.example/admin' });
    expect(scope.registration.showNotification.mock.calls[0]?.[1]).toMatchObject({ data: { url: `${ORIGIN}/admin/pedidos` } });
  });

  it('on tap, focuses a window already on that page', async () => {
    const orders = windowAt('/admin/pedidos?pedido=42');
    const { scope, click } = loadWorker([windowAt('/'), orders]);
    const notification = await click(`${ORIGIN}/admin/pedidos`);
    expect(notification.close).toHaveBeenCalled();
    expect(orders.focus).toHaveBeenCalled();
    expect(scope.clients.openWindow).not.toHaveBeenCalled();
  });

  it('on tap, brings an open panel window to the target page', async () => {
    const panel = windowAt('/admin/produtos');
    const store = windowAt('/catalogo');
    const { scope, click } = loadWorker([store, panel]);
    await click(`${ORIGIN}/admin/pedidos`);
    expect(panel.focus).toHaveBeenCalled();
    expect(panel.navigate).toHaveBeenCalledWith(`${ORIGIN}/admin/pedidos`);
    expect(store.focus).not.toHaveBeenCalled();
    expect(scope.clients.openWindow).not.toHaveBeenCalled();
  });

  it('on tap, opens a new window when none is open (default: orders)', async () => {
    const { scope, click } = loadWorker([windowAt('/catalogo')]);
    await click(undefined);
    expect(scope.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/admin/pedidos`);
  });
});
