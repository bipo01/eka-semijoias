import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeed } from './seed';
import { migrateCatalog, validateCatalog } from './integrity';
import { isQuotaError, KEYS, LEGACY_CATALOG_KEY, listLegacyCatalogKeys, resetStorageProbe, writeJSON } from './storage';

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

describe('legacy catalog detection', () => {
  it('finds the pre-backend catalog and its quarantined copies', () => {
    expect(listLegacyCatalogKeys()).toEqual([]);
    localStorage.setItem(LEGACY_CATALOG_KEY, '{}');
    localStorage.setItem('eka:catalog:corrupt:123', 'x');
    localStorage.setItem(KEYS.cart, '{}');
    expect(listLegacyCatalogKeys()).toEqual(['eka:catalog:corrupt:123', LEGACY_CATALOG_KEY]);
  });
});

describe('validateCatalog', () => {
  it('refuses catalogs the server would reject', () => {
    const { leads: _leads, ...catalog } = createSeed();
    expect(validateCatalog(catalog)).toBeNull();
    expect(validateCatalog({ ...catalog, collections: [...catalog.collections, { ...catalog.collections[0]! }] })).toMatch(/repetida/);
    const longSlug = structuredClone(catalog);
    longSlug.products[0]!.slug = 'a'.repeat(82);
    expect(validateCatalog(longSlug)).not.toBeNull();
    const freePromo = structuredClone(catalog);
    freePromo.products[0]!.promoPrice = 0;
    expect(validateCatalog(freePromo)).not.toBeNull();
    const orphan = structuredClone(catalog);
    orphan.products[0]!.collectionIds = ['col-missing'];
    expect(validateCatalog(orphan)).toMatch(/coleção que não existe/);
  });
});

describe('migrateCatalog', () => {
  it('runs migrations step by step', () => {
    const seed = createSeed();
    const legacy = { ...seed, schemaVersion: 0, products: seed.products.map(({ featured: _f, ...rest }) => rest) };
    const result = migrateCatalog(legacy, {
      0: (old) => ({ ...old, products: (old.products as object[]).map((p) => ({ ...p, featured: false })) }),
      1: (old) => old,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migratedFrom).toBe(0);
      expect(result.state.products.every((p) => p.featured === false)).toBe(true);
    }
  });

  it('accepts uploaded photo keys and refuses foreign URLs', () => {
    const seed = createSeed();
    seed.products[0]!.images[0]!.src = `media/${'a'.repeat(64)}.webp`;
    expect(migrateCatalog(seed).ok).toBe(true);
    seed.products[0]!.images[0]!.src = 'https://evil.example/x.webp';
    expect(migrateCatalog(seed).ok).toBe(false);
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
