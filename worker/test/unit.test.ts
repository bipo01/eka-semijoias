import { applyChanges, chunkChanges, diffCatalog, jsonEqual, type Change } from '../../src/data/changes';
import { migrateCatalog } from '../../src/data/integrity';
import { createCatalogSeed, createSeed } from '../../src/data/seed';
import { networkOf, pinProblem } from '../auth';
import { conflictMessage, findConflicts, type ConflictState } from '../conflicts';
import { safeEqual } from '../crypto';
import { sniffImage } from '../media';
import { Router } from '../router';

describe('PIN policy', () => {
  it.each(['58302917', '804613', '9271538'])('accepts %s', (pin) => expect(pinProblem(pin)).toBeNull());
  it.each([
    ['12345', /de 6 a 8/],
    ['123456789', /de 6 a 8/],
    ['12a456', /de 6 a 8/],
    ['000000', /diferentes/],
    ['123456', /sequências/],
    ['987654', /sequências/],
    ['890123', /sequências/],
    ['121212', /par/],
    ['123123', /trecho/],
  ])('refuses %s', (pin, message) => expect(pinProblem(pin)).toMatch(message));
});

describe('networkOf', () => {
  it('keeps IPv4 and reduces IPv6 to its /64', () => {
    expect(networkOf('203.0.113.9')).toBe('203.0.113.9');
    expect(networkOf('2001:db8:85a3:0:1:2:3:4')).toBe('2001:db8:85a3:0::/64');
    expect(networkOf('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(networkOf('2001:0db8:0000:0042:abcd::1')).toBe(networkOf('2001:db8:0:42:ffff::2'));
  });
});

describe('crypto helpers', () => {
  it('compares strings in constant time semantics', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('sniffImage', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  it('detects real types from magic bytes', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0]))).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]))).toBeNull();
  });
});

describe('change sets', () => {
  it('diffs, applies and round-trips a catalog edit', () => {
    const prev = createCatalogSeed();
    const next = structuredClone(prev);
    next.products[0]!.price += 500;
    next.products.splice(1, 1);
    next.categories.push({ id: 'cat-x', slug: 'x', name: 'X', order: 9 });
    next.settings.announcement = 'Novo aviso';
    const changes = diffCatalog(prev, next);
    expect(changes.map((c) => `${c.kind}:${c.op}`).sort()).toEqual(['category:upsert', 'product:delete', 'product:upsert', 'settings:upsert']);
    expect(jsonEqual(applyChanges(prev, changes), next)).toBe(true);
    expect(diffCatalog(next, next)).toEqual([]);
  });

  it('treats key order and undefined fields as equal', () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1, d: undefined })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
  });

  it('chunks parents first and deletes last', () => {
    const changes: Change[] = [
      { kind: 'category', op: 'delete', id: 'c1' },
      { kind: 'product', op: 'delete', id: 'p1' },
      { kind: 'product', op: 'upsert', id: 'p2', data: createCatalogSeed().products[0]! },
      { kind: 'category', op: 'upsert', id: 'c2', data: { id: 'c2', slug: 'c2', name: 'C2', order: 1 } },
    ];
    expect(chunkChanges(changes, 3).flat().map((c) => `${c.kind}:${c.op}`)).toEqual(['category:upsert', 'product:upsert', 'product:delete', 'category:delete']);
  });
});

describe('conflict detection', () => {
  const catalog = createCatalogSeed();
  const p = catalog.products[0]!;
  const state = (overrides: Partial<ConflictState> = {}): ConflictState => ({
    catalog,
    versions: new Map([[`product:${p.id}`, 5]]),
    tombstones: new Map([['product:gone', 7]]),
    settingsVersion: 3,
    ...overrides,
  });
  const upsert = (data = { ...p, price: p.price + 1 }): Change => ({ kind: 'product', op: 'upsert', id: data.id, data });

  it('flags an entity changed after the base version', () => {
    expect(findConflicts(state(), [upsert()], 4)).toEqual([{ kind: 'product', id: p.id, name: p.name, reason: 'changed' }]);
    expect(findConflicts(state(), [upsert()], 5)).toEqual([]);
  });
  it('lets a client write exactly what is stored', () => expect(findConflicts(state(), [upsert(p)], 1)).toEqual([]));
  it('keeps deleted entities deleted for stale clients only', () => {
    const ghost = { ...p, id: 'gone' };
    expect(findConflicts(state(), [upsert(ghost)], 6)[0]?.reason).toBe('deleted');
    expect(findConflicts(state(), [upsert(ghost)], 7)).toEqual([]);
  });
  it('flags deleting something changed meanwhile, and settings edits', () => {
    expect(findConflicts(state(), [{ kind: 'product', op: 'delete', id: p.id }], 4)).toHaveLength(1);
    expect(findConflicts(state(), [{ kind: 'product', op: 'delete', id: 'unknown' }], 0)).toEqual([]);
    expect(findConflicts(state(), [{ kind: 'settings', op: 'upsert', data: { ...catalog.settings, city: 'X' } }], 2)).toHaveLength(1);
  });
  it('explains conflicts in Portuguese', () => {
    expect(conflictMessage([{ kind: 'product', id: p.id, name: p.name, reason: 'changed' }])).toContain(`alterou “${p.name}”`);
    expect(conflictMessage([{ kind: 'settings', reason: 'changed' }, { kind: 'product', id: 'x', reason: 'deleted' }])).toContain('e mais 1 item');
  });
});

describe('backup migration', () => {
  it('upgrades a v1 backup (PIN hash and customized flag dropped)', () => {
    const v1 = { ...createSeed(), schemaVersion: 1, customized: true, settings: { ...createSeed().settings, pinHash: 'a'.repeat(64) } };
    const result = migrateCatalog(v1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migratedFrom).toBe(1);
      expect(result.state.settings).not.toHaveProperty('pinHash');
      expect(result.state).not.toHaveProperty('customized');
    }
  });
});

describe('Router', () => {
  const router = new Router().on('GET', '/a/:id', async () => new Response('a')).on('DELETE', '/a/:id', async () => new Response('d'));
  it('matches params and reports allowed methods', () => {
    const m = router.match('GET', '/a/42');
    expect(m && 'params' in m && m.params).toEqual({ id: '42' });
    expect(router.match('POST', '/a/42')).toEqual({ allowed: ['GET', 'DELETE'] });
    expect(router.match('GET', '/b')).toBeNull();
  });
});
