import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeed } from './seed';
import { CORRUPT_PREFIX, isQuotaError, KEYS, loadCatalog, migrateCatalog, resetStorageProbe, saveCatalog, storageUsage, writeJSON } from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  resetStorageProbe();
});

describe('isQuotaError', () => {
  it('recognizes browser variants', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError(new DOMException('full', 'NS_ERROR_DOM_QUOTA_REACHED'))).toBe(true);
    expect(isQuotaError(Object.assign(new Error('x'), { code: 22 }))).toBe(true);
    expect(isQuotaError(Object.assign(new Error('x'), { code: 1014 }))).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
    expect(isQuotaError('nope')).toBe(false);
  });
});

describe('writeJSON', () => {
  it('returns a typed quota failure instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const result = writeJSON(KEYS.cart, { items: [] });
    expect(result).toMatchObject({ ok: false, reason: 'quota' });
    if (!result.ok) expect(result.message).toMatch(/Espaço do navegador cheio/);
  });
});

describe('loadCatalog', () => {
  it('seeds on first run', () => {
    const loaded = loadCatalog();
    expect(loaded.issue).toBe('seeded');
    expect(localStorage.getItem(KEYS.catalog)).not.toBeNull();
    expect(loadCatalog().issue).toBe('none');
  });

  it('quarantines a corrupt payload before falling back to the seed', () => {
    localStorage.setItem(KEYS.catalog, '{"schemaVersion":1,"products":"broken"');
    const loaded = loadCatalog(() => 123);
    expect(loaded.issue).toBe('corrupt-recovered');
    expect(localStorage.getItem(`${CORRUPT_PREFIX}123`)).toBe('{"schemaVersion":1,"products":"broken"');
    expect(loaded.state.products).toHaveLength(24);
  });

  it('keeps the original payload untouched when it cannot be quarantined', () => {
    localStorage.setItem(KEYS.catalog, 'not json');
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith(CORRUPT_PREFIX)) throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    });
    const loaded = loadCatalog(() => 1);
    expect(loaded.issue).toBe('corrupt-recovered');
    expect(localStorage.getItem(KEYS.catalog)).toBe('not json');
  });

  it('round-trips a saved catalog', () => {
    const seed = createSeed();
    seed.products[0]!.name = 'Brinco Alterado';
    expect(saveCatalog(seed).ok).toBe(true);
    expect(loadCatalog().state.products[0]!.name).toBe('Brinco Alterado');
    expect(storageUsage()).toBeGreaterThan(1000);
  });
});

describe('migrateCatalog', () => {
  it('runs migrations step by step', () => {
    const seed = createSeed();
    const legacy = { ...seed, schemaVersion: 0, products: seed.products.map(({ featured: _f, ...rest }) => rest) };
    const result = migrateCatalog(legacy, { 0: (old) => ({ ...old, products: (old.products as object[]).map((p) => ({ ...p, featured: false })) }) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migratedFrom).toBe(0);
      expect(result.state.products.every((p) => p.featured === false)).toBe(true);
    }
  });

  it('rejects malformed or hostile input with a readable error', () => {
    expect(migrateCatalog(null)).toMatchObject({ ok: false });
    expect(migrateCatalog([])).toMatchObject({ ok: false });
    expect(migrateCatalog({ schemaVersion: 99 })).toMatchObject({ ok: false, error: expect.stringMatching(/versão mais nova/) });
    const seed = createSeed();
    seed.products[0]!.images[0]!.src = 'javascript:alert(1)';
    expect(migrateCatalog(seed)).toMatchObject({ ok: false, error: expect.stringMatching(/Imagem inválida/) });
    const dup = createSeed();
    dup.products[1]!.slug = dup.products[0]!.slug;
    expect(migrateCatalog(dup)).toMatchObject({ ok: false, error: expect.stringMatching(/repetido/) });
  });
});
