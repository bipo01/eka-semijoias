import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalogSeed } from '../data/seed';
import { KEYS } from '../data/storage';
import { installMockApi, mockServer, resetMockServer } from '../test/mockApi';

async function freshStore() {
  vi.resetModules();
  return (await import('./catalog')).useCatalog;
}

beforeEach(() => {
  localStorage.clear();
  resetMockServer();
  installMockApi();
  mockServer.authenticated = true;
});

describe('catalog store', () => {
  it('starts loading without a cache, then renders the server catalog and caches it', async () => {
    const useCatalog = await freshStore();
    expect(useCatalog.getState().status).toBe('loading');
    await useCatalog.getState().load();
    expect(useCatalog.getState()).toMatchObject({ status: 'ready', version: 1 });
    expect(useCatalog.getState().data.products).toHaveLength(24);
    expect(JSON.parse(localStorage.getItem(KEYS.catalogCache)!).version).toBe(1);
  });

  it('renders instantly from the cache on return visits', async () => {
    localStorage.setItem(KEYS.catalogCache, JSON.stringify({ ...createCatalogSeed(), version: 7 }));
    const useCatalog = await freshStore();
    expect(useCatalog.getState()).toMatchObject({ status: 'ready', version: 7 });
  });

  it('ignores a corrupt cache', async () => {
    localStorage.setItem(KEYS.catalogCache, '{"version": 3, "products": "x"');
    const useCatalog = await freshStore();
    expect(useCatalog.getState().status).toBe('loading');
  });

  it('shows an error state when the first load fails, and recovers on retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    const useCatalog = await freshStore();
    await useCatalog.getState().load();
    expect(useCatalog.getState().status).toBe('error');
    installMockApi();
    await useCatalog.getState().load();
    expect(useCatalog.getState().status).toBe('ready');
  }, 15_000);

  it('commits through the server and only then updates the catalog', async () => {
    const useCatalog = await freshStore();
    await useCatalog.getState().load();
    const result = await useCatalog.getState().commit((d) => ({ ...d, settings: { ...d.settings, city: 'Cuiabá/MT' } }));
    expect(result).toEqual({ ok: true, version: 2 });
    expect(useCatalog.getState().data.settings.city).toBe('Cuiabá/MT');
    expect(mockServer.catalog.settings.city).toBe('Cuiabá/MT');
    const sent = mockServer.requests.find((r) => r.path === '/api/admin/changes')!.body as { baseVersion: number; changes: unknown[] };
    expect(sent.baseVersion).toBe(1);
    expect(sent.changes).toHaveLength(1);
  });

  it('keeps the catalog unchanged when the server refuses (conflict)', async () => {
    const useCatalog = await freshStore();
    await useCatalog.getState().load();
    const before = useCatalog.getState().data;
    mockServer.failNext = { status: 409, code: 'conflict', message: 'Outro aparelho alterou “X”.' };
    const result = await useCatalog.getState().commit((d) => ({ ...d, settings: { ...d.settings, city: 'Outra' } }));
    expect(result).toMatchObject({ ok: false, conflict: true, message: 'Outro aparelho alterou “X”.' });
    expect(useCatalog.getState().data).toBe(before);
  });

  it('refuses an invalid catalog before calling the server', async () => {
    const useCatalog = await freshStore();
    await useCatalog.getState().load();
    const result = await useCatalog.getState().commit((d) => ({ ...d, categories: [...d.categories, { ...d.categories[0]! }] }));
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
    expect(mockServer.requests.some((r) => r.path === '/api/admin/changes')).toBe(false);
  });

  it('uploads new photos first and saves their server keys', async () => {
    const useCatalog = await freshStore();
    await useCatalog.getState().load();
    const dataUrl = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73/w==';
    const result = await useCatalog.getState().commit((d) => ({
      ...d,
      products: d.products.map((p, i) => (i === 0 ? { ...p, images: [...p.images, { id: 'img-new', src: dataUrl, thumb: dataUrl, alt: 'Nova' }] } : p)),
    }));
    expect(result.ok).toBe(true);
    expect(mockServer.requests.filter((r) => r.path === '/api/admin/media')).toHaveLength(1); // same data URL uploaded once
    const saved = useCatalog.getState().data.products[0]!.images.find((i) => i.id === 'img-new')!;
    expect(saved.src).toMatch(/^media\//);
    expect(saved.thumb).toBe(saved.src);
  });

  it('shows the merged server catalog when another device wrote in between', async () => {
    const useCatalog = await freshStore();
    await useCatalog.getState().load();
    // Device B renames product 2 right before this device's save of product 1 reaches the server.
    mockServer.interleaveNext = (c) => ({ ...c, products: c.products.map((p, i) => (i === 1 ? { ...p, name: 'Editado em outro aparelho' } : p)) });
    const result = await useCatalog.getState().commit((d) => ({ ...d, products: d.products.map((p, i) => (i === 0 ? { ...p, price: p.price + 100 } : p)) }));
    expect(result).toEqual({ ok: true, version: 3 });
    const { data, version } = useCatalog.getState();
    expect(version).toBe(3);
    expect(data.products[1]!.name).toBe('Editado em outro aparelho'); // not overwritten by the stale local copy
    expect(data.products[0]!.price).toBe(mockServer.catalog.products[0]!.price);
  });

  it('clears the offline flag as soon as the server answers again', async () => {
    const useCatalog = await freshStore();
    await useCatalog.getState().load();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await useCatalog.getState().refresh();
    expect(useCatalog.getState().offline).toBe(true);
    installMockApi();
    await useCatalog.getState().refresh(); // same version: nothing to apply, but the server is back
    expect(useCatalog.getState().offline).toBe(false);
  }, 15_000);

  it('does not let a slow first load roll back a newer live update', async () => {
    const useCatalog = await freshStore();
    await useCatalog.getState().load();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const realFetch = globalThis.fetch;
    // The next load() answers late, with the catalog as it was before.
    const stale = JSON.stringify({ ...mockServer.catalog, version: 1 });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/catalog')) {
        await gate;
        return new Response(stale, { status: 200 });
      }
      return realFetch(input, init);
    }));
    const slowLoad = useCatalog.getState().load();
    mockServer.version = 4;
    await useCatalog.getState().refresh(4);
    expect(useCatalog.getState().version).toBe(4);
    release();
    await slowLoad;
    expect(useCatalog.getState().version).toBe(4);
  });

  it('applies newer versions announced live and ignores older ones', async () => {
    const useCatalog = await freshStore();
    await useCatalog.getState().load();
    mockServer.catalog = { ...mockServer.catalog, settings: { ...mockServer.catalog.settings, announcement: 'Novidade' } };
    mockServer.version = 5;
    await useCatalog.getState().refresh(5);
    expect(useCatalog.getState()).toMatchObject({ version: 5, externalVersion: 1 });
    expect(useCatalog.getState().data.settings.announcement).toBe('Novidade');
    await useCatalog.getState().refresh(3);
    expect(useCatalog.getState().version).toBe(5);
  });
});
