import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeed } from '../data/seed';
import { KEYS } from '../data/storage';

async function freshStore() {
  vi.resetModules();
  const storage = await import('../data/storage');
  storage.resetStorageProbe();
  return (await import('./catalog')).useCatalog;
}

beforeEach(() => localStorage.clear());

describe('catalog store', () => {
  it('marks admin commits as customized and lead-only commits as not', async () => {
    const useCatalog = await freshStore();
    const lead = { id: 'lead_1', name: 'Ana', whatsapp: '67999991234', city: 'X', uf: 'MS', alreadySells: true, createdAt: '2026-11-19T10:00:00.000Z' };
    expect(useCatalog.getState().commit((d) => ({ ...d, leads: [lead] }), { customize: false }).ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEYS.catalog)!).customized).toBeUndefined();
    expect(useCatalog.getState().commit((d) => ({ ...d, settings: { ...d.settings, city: 'Campo Grande/MS' } })).ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEYS.catalog)!).customized).toBe(true);
  });

  it('does not change state when a write is invalid', async () => {
    const useCatalog = await freshStore();
    const before = useCatalog.getState().data;
    const result = useCatalog.getState().commit((d) => ({ ...d, categories: [...d.categories, { ...d.categories[0]! }] }));
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    expect(useCatalog.getState().data).toBe(before);
  });

  it('blocks writes when stored data comes from a newer version', async () => {
    const newer = JSON.stringify({ ...createSeed(), schemaVersion: 2 });
    localStorage.setItem(KEYS.catalog, newer);
    const useCatalog = await freshStore();
    expect(useCatalog.getState().issue).toBe('outdated');
    expect(useCatalog.getState().commit((d) => d)).toMatchObject({ ok: false, reason: 'outdated' });
    expect(localStorage.getItem(KEYS.catalog)).toBe(newer);
  });
});
