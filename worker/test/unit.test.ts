import { applyChanges, chunkChanges, diffCatalog, jsonEqual, type Change } from '../../src/data/changes';
import { migrateCatalog } from '../../src/data/integrity';
import { createCatalogSeed, createSeed } from '../../src/data/seed';
import { networkOf, pinProblem } from '../auth';
import { conflictMessage, findConflicts, type ConflictState } from '../conflicts';
import { safeEqual } from '../crypto';
import { sniffImage, sniffReceipt } from '../media';
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

describe('sniffReceipt', () => {
  const b = (...v: number[]) => Uint8Array.from(v);
  it('accepts images and PDFs by their first bytes only', () => {
    expect(sniffReceipt(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffReceipt(new TextEncoder().encode('%PDF-1.4'))).toBe('application/pdf');
    expect(sniffReceipt(new TextEncoder().encode('<script>'))).toBeNull();
    expect(sniffReceipt(new TextEncoder().encode('%PD'))).toBeNull();
  });
});

describe('base64 storage', () => {
  it('round-trips arbitrary bytes exactly', async () => {
    const { base64ToBytes, bytesToBase64 } = await import('../crypto');
    const bytes = new Uint8Array(200_003);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7919) % 256;
    const back = base64ToBytes(bytesToBase64(bytes));
    expect(back.length).toBe(bytes.length);
    expect(back.every((b, i) => b === bytes[i])).toBe(true);
    expect(bytesToBase64(new TextEncoder().encode('%PDF-'))).toBe('JVBERi0=');
  });
});

describe('Web Push (RFC 8291 / RFC 8292)', () => {
  it('encrypts the RFC 8291 example byte for byte', async () => {
    const { b64urlToBytes, bytesToB64url, encryptPayload, senderKeysFrom } = await import('../webpush');
    const sender = await senderKeysFrom('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const body = await encryptPayload(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      b64urlToBytes('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
      b64urlToBytes('BTBZMqHH6r4Tts7J_aSIgg'),
      { sender, salt: b64urlToBytes('DGv6ra1nlYgDCS1FRnbzlw') },
    );
    expect(bytesToB64url(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('signs a VAPID JWT that verifies with the public key it announces', async () => {
    const { b64urlToBytes, parseVapidJwk, vapidAuthorization } = await import('../webpush');
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = parseVapidJwk(JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)))!;
    expect(jwk).not.toBeNull();
    const auth = await vapidAuthorization(jwk, 'https://fcm.googleapis.com', 'https://loja.example', 1_000_000);
    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(auth)!;
    const [h, c, s] = token!.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlToBytes(c!)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_000_000 + 43_200, sub: 'https://loja.example' });
    const pub = await crypto.subtle.importKey('raw', b64urlToBytes(key!), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlToBytes(s!), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
    expect(parseVapidJwk('{"kty":"EC"}')).toBeNull();
    expect(parseVapidJwk('nope')).toBeNull();
  });

  it('only accepts endpoints of real push services', async () => {
    const { isPushEndpoint } = await import('../webpush');
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://evil.example/fcm.googleapis.com')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isPushEndpoint('https://user@fcm.googleapis.com/x')).toBe(false);
  });
});
