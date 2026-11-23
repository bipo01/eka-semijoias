/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are asserted field by field in these tests. */
import { randomUUID } from 'node:crypto';

/*
 * End-to-end API tests against a real local Worker (workerd, local D1 and the
 * LiveHub Durable Object). Each test uses its own client IP so throttles do not
 * interfere. ADMIN_INITIAL_PIN comes from .dev.vars(.example): 314159.
 */

const BASE = () => process.env.INTEGRATION_URL!;
const INITIAL_PIN = '314159';
let ipCounter = 0;
const nextIp = () => `10.${Math.floor(Math.random() * 200)}.${(ipCounter = (ipCounter + 1) % 250)}.${Math.floor(Math.random() * 250)}`;

class Client {
  cookies = new Map<string, string>();
  constructor(public ip = nextIp()) {}

  async req(path: string, init: { method?: string; body?: unknown; raw?: BodyInit | Uint8Array; type?: string; origin?: string | null; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { 'CF-Connecting-IP': this.ip, ...init.headers };
    const method = init.method ?? (init.body !== undefined || init.raw !== undefined ? 'POST' : 'GET');
    if (method !== 'GET' && init.origin !== null) headers.Origin = init.origin ?? BASE();
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.type) headers['Content-Type'] = init.type;
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE() + path, { method, headers, body: (init.raw as BodyInit | undefined) ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined) });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const [name, value] = pair!.split('=');
      if (value) this.cookies.set(name!, value);
      else this.cookies.delete(name!);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  login(pin = currentPin) {
    return this.req('/api/admin/login', { body: { pin } });
  }
}

let currentPin = INITIAL_PIN;

async function catalog() {
  const res = await fetch(`${BASE()}/api/catalog`);
  return (await res.json()) as any;
}

async function admin(): Promise<Client> {
  const c = new Client();
  const res = await c.login();
  expect(res.status).toBe(200);
  return c;
}

function webpBytes(seed: string): Uint8Array {
  const body = new TextEncoder().encode(`VP8 ${seed}`);
  const out = new Uint8Array(12 + body.length);
  out.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(new TextEncoder().encode('WEBP'), 8);
  out.set(body, 12);
  return out;
}

describe('catalog reads', () => {
  it('uses clock-based versions that never repeat', async () => {
    const { version } = await catalog();
    expect(version).toBeGreaterThan(Date.parse('2026-01-01'));
    expect(version).toBeLessThanOrEqual(Date.now());
  });

  it('seeds on first read and serves the snapshot with an ETag', async () => {
    const res = await fetch(`${BASE()}/api/catalog`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const etag = res.headers.get('ETag')!;
    expect(etag).toMatch(/^"c\d+"$/);
    const body = (await res.json()) as any;
    expect(body.schemaVersion).toBe(2);
    expect(body.products.length).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('leads');
    expect(JSON.stringify(body)).not.toMatch(/pinHash|pin_hash/);
    const again = await fetch(`${BASE()}/api/catalog`, { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
  });

  it('serves versioned URLs as immutable only when current', async () => {
    const { version } = await catalog();
    const current = await fetch(`${BASE()}/api/catalog/v/${version}`);
    expect(current.headers.get('Cache-Control')).toContain('immutable');
    // Immutable URLs never answer 304 (a cached 304 would poison the edge); `*` is not a match.
    expect((await fetch(`${BASE()}/api/catalog/v/${version}`, { headers: { 'If-None-Match': '*' } })).status).toBe(200);
    expect((await fetch(`${BASE()}/api/catalog`, { headers: { 'If-None-Match': '*' } })).status).toBe(200);
    const old = await fetch(`${BASE()}/api/catalog/v/0`);
    expect(old.headers.get('Cache-Control')).toBe('no-store');
    expect(((await old.json()) as any).version).toBe(version);
    expect((await fetch(`${BASE()}/api/catalog/v/abc`)).status).toBe(404);
    const head = await fetch(`${BASE()}/api/catalog/v/${version}`, { method: 'HEAD' });
    expect(head.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers unknown API routes and methods with JSON errors', async () => {
    const res = await new Client().req('/api/nope');
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe('not_found');
    const method = await new Client().req('/api/catalog', { method: 'PUT', body: {} });
    expect(method.status).toBe(405);
  });

  it('serves every page route as the SPA document; static files skip the Worker', async () => {
    for (const path of ['/catalogo', '/produto/brinco-gota-cristal', '/admin/produtos', '/pagina-que-nao-existe']) {
      const res = await fetch(`${BASE()}${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('Content-Type'), path).toContain('text/html');
      expect(res.headers.get('Content-Security-Policy'), path).toContain(`connect-src 'self' ws://${new URL(BASE()).host}`);
      expect(await res.text(), path).toContain('id="root"');
    }
    const icon = await fetch(`${BASE()}/favicon.svg`);
    expect(icon.status).toBe(200);
    expect(icon.headers.get('X-Request-Id')).toBeNull(); // served by static assets, not the Worker
  });

  it('serves the SPA document with a CSP naming the WebSocket host', async () => {
    const res = await fetch(`${BASE()}/`);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const csp = res.headers.get('Content-Security-Policy')!;
    expect(csp).toContain(`connect-src 'self' ws://${new URL(BASE()).host}`);
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe('admin authentication', () => {
  it('rejects admin routes without a session', async () => {
    const c = new Client();
    expect((await c.req('/api/admin/leads')).status).toBe(401);
    expect((await c.req('/api/admin/backup')).status).toBe(401);
    expect((await c.req('/api/admin/changes', { body: { baseVersion: 0, changes: [] } })).status).toBe(401);
    const status = await c.req('/api/admin/session');
    expect(status.json).toEqual({ authenticated: false, pinLength: 6 });
  });

  it('refuses state changes from another origin or without an Origin', async () => {
    const c = new Client();
    expect((await c.req('/api/admin/login', { body: { pin: INITIAL_PIN }, origin: 'https://evil.example' })).status).toBe(403);
    expect((await c.req('/api/admin/login', { body: { pin: INITIAL_PIN }, origin: null })).status).toBe(403);
    expect((await c.req('/api/admin/login', { raw: `pin=${INITIAL_PIN}`, type: 'application/x-www-form-urlencoded' })).status).toBe(415);
  });

  it('gives a known device its own budget that a successful login resets', async () => {
    const c = new Client();
    expect((await c.login()).status).toBe(200); // now a known device
    for (let round = 0; round < 3; round++) {
      c.cookies.delete('eka_admin');
      for (let i = 0; i < 4; i++) {
        (c as { ip: string }).ip = nextIp(); // new network each time: only the device bucket accumulates
        expect((await c.login('000001')).status).toBe(401);
      }
      expect((await c.login()).status).toBe(200); // resets the device bucket
    }
  });

  it('logs in with a hardened session cookie and logs out', async () => {
    const c = new Client();
    const wrong = await c.login('000001');
    expect(wrong.status).toBe(401);
    expect(wrong.json.error.code).toBe('invalid_pin');
    const res = await c.req('/api/admin/login', { body: { pin: currentPin } });
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie().join('\n');
    expect(cookies).toMatch(/eka_admin=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000/);
    expect(cookies).toMatch(/eka_device=/);
    expect((await c.req('/api/admin/session')).json.authenticated).toBe(true);
    expect((await c.req('/api/admin/leads')).status).toBe(200);
    expect((await c.req('/api/admin/logout', { method: 'POST' })).status).toBe(200);
    expect((await c.req('/api/admin/leads')).status).toBe(401);
  });

  it('counts attempts before checking and locks a network after 5', async () => {
    const c = new Client();
    for (let i = 0; i < 5; i++) expect((await c.login('000001')).status).toBe(401);
    const locked = await c.login(currentPin); // even the right PIN waits out the lock
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('Retry-After'))).toBeGreaterThan(800);
    const parallel = new Client();
    const results = await Promise.all(Array.from({ length: 12 }, () => parallel.login('000002')));
    expect(results.filter((r) => r.status === 401).length).toBeLessThanOrEqual(5);
    expect(results.some((r) => r.status === 429)).toBe(true);
  });

  it('rejects a malformed session cookie', async () => {
    const c = new Client();
    c.cookies.set('eka_admin', 'x'.repeat(43));
    expect((await c.req('/api/admin/leads')).status).toBe(401);
  });
});

describe('catalog changes', () => {
  it('applies an edit, bumps the version and refuses a stale conflicting edit', async () => {
    const a = await admin();
    const before = await catalog();
    const product = before.products[0];
    const edited = { ...product, price: product.price + 100, updatedAt: new Date().toISOString() };
    const ok = await a.req('/api/admin/changes', { body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'upsert', id: product.id, data: edited }] } });
    expect(ok.status).toBe(200);
    expect(ok.json.version).toBeGreaterThan(before.version);
    expect(ok.json.from).toBe(before.version);
    expect((await catalog()).products[0].price).toBe(product.price + 100);

    // A second device that loaded before the edit changes the same product differently.
    const stale = { ...product, name: `${product.name} B` };
    const conflict = await a.req('/api/admin/changes', { body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'upsert', id: product.id, data: stale }] } });
    expect(conflict.status).toBe(409);
    expect(conflict.json.error.code).toBe('conflict');
    expect(conflict.json.error.message).toContain(product.name);

    // Writing exactly what is stored is not a conflict; another product from the same stale base is fine.
    const same = await a.req('/api/admin/changes', { body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'upsert', id: product.id, data: edited }] } });
    expect(same.status).toBe(200);
    expect(same.json.applied).toBe(0);
    const other = before.products[1];
    const otherOk = await a.req('/api/admin/changes', {
      body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'upsert', id: other.id, data: { ...other, featured: !other.featured } }] },
    });
    expect(otherOk.status).toBe(200);
  });

  it('keeps deleted entities deleted against stale saves (tombstones), but allows undo from the new base', async () => {
    const a = await admin();
    const before = await catalog();
    const victim = before.products[2];
    const del = await a.req('/api/admin/changes', { body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'delete', id: victim.id }] } });
    expect(del.status).toBe(200);
    const resurrect = await a.req('/api/admin/changes', {
      body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'upsert', id: victim.id, data: { ...victim, price: victim.price + 1 } }] },
    });
    expect(resurrect.status).toBe(409);
    expect(resurrect.json.error.message).toMatch(/excluiu/);
    const undo = await a.req('/api/admin/changes', { body: { baseVersion: del.json.version, changes: [{ kind: 'product', op: 'upsert', id: victim.id, data: victim }] } });
    expect(undo.status).toBe(200);
    expect((await catalog()).products.some((p: any) => p.id === victim.id)).toBe(true);
  });

  it('replays an idempotent retry and refuses a reused key with another body', async () => {
    const a = await admin();
    const before = await catalog();
    const settings = { ...before.settings, announcement: `Aviso ${randomUUID().slice(0, 8)}` };
    const key = randomUUID();
    const body = { baseVersion: before.version, changes: [{ kind: 'settings', op: 'upsert', data: settings }] };
    const first = await a.req('/api/admin/changes', { body, headers: { 'Idempotency-Key': key } });
    expect(first.status).toBe(200);
    const replay = await a.req('/api/admin/changes', { body, headers: { 'Idempotency-Key': key } });
    expect(replay.status).toBe(200);
    expect(replay.json).toEqual(first.json);
    expect((await catalog()).version).toBe(first.json.version);
    const reused = await a.req('/api/admin/changes', { body: { ...body, baseVersion: first.json.version }, headers: { 'Idempotency-Key': key } });
    expect(reused.status).toBe(400);
  });

  it('serializes concurrent writes without losing any', async () => {
    const a = await admin();
    const before = await catalog();
    const targets = before.products.slice(3, 11);
    const results = await Promise.all(
      targets.map((p: any) =>
        a.req('/api/admin/changes', { body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'upsert', id: p.id, data: { ...p, description: `${p.description} *` } }] } }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(targets.map(() => 200));
    const versions = results.map((r) => r.json.version).sort((x, y) => x - y);
    expect(new Set(versions).size).toBe(targets.length);
    // Every write knows which version it built on: exactly one started from the base, the rest chained.
    expect(results.filter((r) => r.json.from === before.version)).toHaveLength(1);
    const after = await catalog();
    expect(after.version).toBe(versions[versions.length - 1]);
    for (const p of targets) expect(after.products.find((q: any) => q.id === p.id).description).toBe(`${p.description} *`);
  });

  it('enforces integrity, schema and photo rules', async () => {
    const a = await admin();
    const before = await catalog();
    const p = before.products[0];
    const send = (changes: unknown[]) => a.req('/api/admin/changes', { body: { baseVersion: before.version, changes } });
    expect((await send([{ kind: 'product', op: 'upsert', id: p.id, data: { ...p, categoryId: 'cat-missing' } }])).status).toBe(422);
    expect((await send([{ kind: 'product', op: 'upsert', id: p.id, data: { ...p, price: -5 } }])).status).toBe(400);
    expect((await send([{ kind: 'category', op: 'delete', id: p.categoryId }])).status).toBe(422);
    const dataUrl = { ...p, images: [{ ...p.images[0], src: 'data:image/webp;base64,AAAA' }] };
    expect((await send([{ kind: 'product', op: 'upsert', id: p.id, data: dataUrl }])).status).toBe(400);
    const missingMedia = { ...p, images: [{ ...p.images[0], src: `media/${'a'.repeat(64)}.webp` }] };
    expect((await send([{ kind: 'product', op: 'upsert', id: p.id, data: missingMedia }])).status).toBe(422);
    expect((await a.req('/api/admin/changes', { raw: '{not json', type: 'application/json' })).status).toBe(400);
  });

  it('moves products and deletes their category in one change set (foreign keys hold)', async () => {
    const a = await admin();
    const before = await catalog();
    const cat = { id: 'cat-temp', slug: 'temporaria', name: 'Temporária', order: 99 };
    const created = await a.req('/api/admin/changes', { body: { baseVersion: before.version, changes: [{ kind: 'category', op: 'upsert', id: cat.id, data: cat }] } });
    expect(created.status).toBe(200);
    const p = before.products[10];
    const moved = await a.req('/api/admin/changes', { body: { baseVersion: created.json.version, changes: [{ kind: 'product', op: 'upsert', id: p.id, data: { ...p, categoryId: cat.id } }] } });
    expect(moved.status).toBe(200);
    // Delete the category and move the product back, listed category-first on purpose.
    const both = await a.req('/api/admin/changes', {
      body: {
        baseVersion: moved.json.version,
        changes: [
          { kind: 'category', op: 'delete', id: cat.id },
          { kind: 'product', op: 'upsert', id: p.id, data: p },
        ],
      },
    });
    expect(both.status).toBe(200);
    const after = await catalog();
    expect(after.categories.some((c: any) => c.id === cat.id)).toBe(false);
    expect(after.products.find((q: any) => q.id === p.id).categoryId).toBe(p.categoryId);
  });

  it('exports a backup with leads only for the admin', async () => {
    const a = await admin();
    const backup = await a.req('/api/admin/backup');
    expect(backup.status).toBe(200);
    expect(Array.isArray(backup.json.leads)).toBe(true);
    expect(backup.json.schemaVersion).toBe(2);
  });
});

describe('media', () => {
  it('uploads content-addressed photos idempotently and serves them immutable', async () => {
    const a = await admin();
    const bytes = webpBytes(randomUUID());
    const up = await a.req('/api/admin/media', { raw: bytes, type: 'image/webp' });
    expect(up.status).toBe(201);
    expect(up.json.key).toMatch(/^media\/[a-f0-9]{64}\.webp$/);
    const again = await a.req('/api/admin/media', { raw: bytes, type: 'image/webp' });
    expect(again.status).toBe(200);
    expect(again.json.key).toBe(up.json.key);
    const res = await fetch(`${BASE()}/${up.json.key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect((await fetch(`${BASE()}/${up.json.key}`, { headers: { 'If-None-Match': '*' } })).status).toBe(200);

    // The uploaded key can now be used in a product.
    const before = await catalog();
    const p = before.products[4];
    const withPhoto = { ...p, images: [...p.images, { id: 'img-up', src: up.json.key, alt: 'Foto' }] };
    const saved = await a.req('/api/admin/changes', { body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'upsert', id: p.id, data: withPhoto }] } });
    expect(saved.status).toBe(200);
  });

  it('refuses lies, oversize files and anonymous uploads', async () => {
    const a = await admin();
    expect((await a.req('/api/admin/media', { raw: webpBytes('x'), type: 'image/png' })).status).toBe(415);
    expect((await a.req('/api/admin/media', { raw: new TextEncoder().encode('<svg/>'), type: 'image/svg+xml' })).status).toBe(415);
    expect((await a.req('/api/admin/media', { raw: new Uint8Array(1_000_001), type: 'image/jpeg' })).status).toBe(413);
    expect((await new Client().req('/api/admin/media', { raw: webpBytes('y'), type: 'image/webp' })).status).toBe(401);
    expect((await fetch(`${BASE()}/media/${'b'.repeat(64)}.webp`)).status).toBe(404);
    expect((await fetch(`${BASE()}/media/..%2Fsecret`)).status).toBe(404);
  });
});

describe('leads', () => {
  const lead = { name: 'Maria da Silva', whatsapp: '(67) 99999-1234', city: 'Campo Grande', uf: 'MS', instagram: '@maria', alreadySells: true, source: 'Instagram', consent: true };

  it('stores a lead for the admin only, and honours the honeypot', async () => {
    const visitor = new Client();
    const created = await visitor.req('/api/leads', { body: lead });
    expect(created.status).toBe(201);
    const bot = await new Client().req('/api/leads', { body: { ...lead, name: 'Robo Spam', website: 'http://spam' } });
    expect(bot.status).toBe(202);
    expect(JSON.stringify(await catalog())).not.toContain('Maria da Silva');
    const a = await admin();
    const list = await a.req('/api/admin/leads');
    const names = list.json.leads.map((l: any) => l.name);
    expect(names).toContain('Maria da Silva');
    expect(names).not.toContain('Robo Spam');
    const mine = list.json.leads.find((l: any) => l.id === created.json.id);
    expect(mine).toMatchObject({ whatsapp: '67999991234', instagram: 'maria', uf: 'MS' });
    const del = await a.req(`/api/admin/leads/${created.json.id}`, { method: 'DELETE' });
    expect(del.json.deleted).toBe(true);
    expect((await a.req(`/api/admin/leads/${created.json.id}`, { method: 'DELETE' })).json.deleted).toBe(false);
  });

  it('validates input and rate-limits per network', async () => {
    const c = new Client();
    const bad = await c.req('/api/leads', { body: { ...lead, whatsapp: '123' } });
    expect(bad.status).toBe(400);
    expect(bad.json.error.message).toMatch(/WhatsApp/);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await c.req('/api/leads', { body: lead })).status);
    expect(statuses.slice(0, 4)).toEqual([201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
    expect((await c.req('/api/leads', { raw: 'x'.repeat(5000), type: 'application/json' })).status).toBe(413);
  });
});

describe('live updates (WebSocket)', () => {
  const wsUrl = () => BASE().replace(/^http/, 'ws') + '/api/live';

  function open(headers: Record<string, string> = { Origin: BASE() }): Promise<{ ws: WebSocket; messages: any[]; next: (pred: (m: any) => boolean) => Promise<any> }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl(), { headers } as any);
      const messages: any[] = [];
      const waiters: { pred: (m: any) => boolean; resolve: (m: any) => void }[] = [];
      ws.addEventListener('message', (e) => {
        if (String(e.data) === 'pong') return;
        const m = JSON.parse(String(e.data));
        messages.push(m);
        for (const w of [...waiters]) if (w.pred(m)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(m);
        }
      });
      ws.addEventListener('error', () => reject(new Error('ws error')));
      ws.addEventListener('open', () =>
        resolve({
          ws,
          messages,
          next: (pred) =>
            new Promise((res, rej) => {
              const found = messages.find(pred);
              if (found) return res(found);
              waiters.push({ pred, resolve: res });
              setTimeout(() => rej(new Error('timeout waiting for message')), 5000);
            }),
        }),
      );
    });
  }

  it('says hello with the current version and pushes new versions after a write', async () => {
    const socket = await open();
    const hello = await socket.next((m) => m.type === 'hello');
    const before = await catalog();
    expect(hello.version).toBe(before.version);
    const a = await admin();
    const p = before.products[5];
    const res = await a.req('/api/admin/changes', { body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'upsert', id: p.id, data: { ...p, featured: !p.featured } }] } });
    const pushed = await socket.next((m) => m.type === 'catalog' && m.version === res.json.version);
    expect(pushed.version).toBeGreaterThan(before.version);
    socket.ws.close();
  });

  it('answers ping with pong and closes on any other message', async () => {
    const socket = await open();
    await socket.next((m) => m.type === 'hello');
    const pong = new Promise<string>((resolve) => socket.ws.addEventListener('message', (e) => String(e.data) === 'pong' && resolve('pong')));
    socket.ws.send('ping');
    expect(await pong).toBe('pong');
    const closed = new Promise<number>((resolve) => socket.ws.addEventListener('close', (e) => resolve(e.code)));
    socket.ws.send('{"type":"hack"}');
    expect(await closed).toBe(1008);
  });

  it('caps sockets per network', async () => {
    const ip = `10.77.${Math.floor(Math.random() * 250)}.1`;
    const sockets = [];
    for (let i = 0; i < 100; i++) sockets.push(await open({ Origin: BASE(), 'CF-Connecting-IP': ip }));
    await expect(open({ Origin: BASE(), 'CF-Connecting-IP': ip })).rejects.toThrow();
    const other = await open({ Origin: BASE(), 'CF-Connecting-IP': '10.78.0.1' });
    for (const s of [...sockets, other]) s.ws.close();
  });

  it('refuses foreign origins and sends lead notices to admin sockets only', async () => {
    await expect(open({ Origin: 'https://evil.example' })).rejects.toThrow();
    const a = await admin();
    const cookie = [...a.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const adminSocket = await open({ Origin: BASE(), Cookie: cookie });
    const publicSocket = await open();
    await adminSocket.next((m) => m.type === 'hello');
    await new Client().req('/api/leads', { body: { name: 'Ana Souza', whatsapp: '(11) 98888-7777', city: 'São Paulo', uf: 'SP', instagram: '', alreadySells: false, source: '', consent: true } });
    await adminSocket.next((m) => m.type === 'leads');
    await new Promise((r) => setTimeout(r, 300));
    expect(publicSocket.messages.some((m) => m.type === 'leads')).toBe(false);
    adminSocket.ws.close();
    publicSocket.ws.close();
  });
});

describe('orders and stock', () => {
  const price = (p: any) => p.promoPrice ?? p.price;
  /** A purchasable product whose finishes have no sizes (optionally with at least `finishes` finishes). */
  async function plainProduct(finishes = 1, skip: string[] = []) {
    const c = await catalog();
    return c.products.find(
      (p: any) => p.available && !skip.includes(p.id) && p.variants.length >= finishes && p.variants.every((v: any) => v.available && !v.sizes?.length) && !c.stock?.[p.id],
    );
  }
  const order = (items: any[], extra: Record<string, unknown> = {}) => ({ items, name: 'Cliente Teste', city: 'Dourados', ...extra });
  const place = (body: unknown, key = randomUUID(), client = new Client()) => client.req('/api/orders', { body, headers: { 'Idempotency-Key': key } });

  it('registers an order priced by the server, idempotently, without exposing it publicly', async () => {
    const product = await plainProduct();
    const v = product.variants[0];
    const secretName = `Fulana ${randomUUID().slice(0, 8)}`;
    const body = order([{ productId: product.id, variantId: v.id, qty: 2 }], { name: secretName, note: 'presente' });
    const key = randomUUID();
    const first = await place(body, key);
    expect(first.status).toBe(201);
    expect(first.json.order.number).toBeGreaterThanOrEqual(1001);
    expect(first.json.order.totalCents).toBe(price(product) * 2);
    expect(first.json.order.items[0]).toMatchObject({ productId: product.id, qty: 2, unitCents: price(product) });

    // A retry (or a double tap) returns the same order; the key cannot be reused for another body.
    const replay = await place(body, key);
    expect(replay.status).toBe(201);
    expect(replay.json.order.number).toBe(first.json.order.number);
    expect((await place({ ...body, city: 'Outra' }, key)).status).toBe(400);

    expect((await new Client().req('/api/orders', { body })).status).toBe(400); // no key
    expect((await place({ ...body, name: ' ' })).json.error.message).toBe('Informe seu nome.');
    const bot = await place({ ...body, website: 'http://spam' });
    expect(bot.status).toBe(202);
    expect(bot.json.order).toBeNull();
    // Prices sent by the browser are ignored (none accepted in the schema): unknown fields do not change the total.
    const tampered = await place({ ...body, items: [{ productId: product.id, variantId: v.id, qty: 1, unitCents: 1 }] });
    expect(tampered.json.order.totalCents).toBe(price(product));

    expect(JSON.stringify(await catalog())).not.toContain(secretName);
    expect((await new Client().req('/api/admin/orders')).status).toBe(401);
    const a = await admin();
    const list = await a.req('/api/admin/orders');
    const stored = list.json.orders.find((o: any) => o.number === first.json.order.number);
    expect(stored).toMatchObject({ status: 'enviado', customer: { name: secretName, city: 'Dourados' }, note: 'presente', totalCents: price(product) * 2 });

    const anon = await a.req(`/api/admin/orders/${stored.id}/anonymize`, { body: {} });
    expect(anon.json.order).toMatchObject({ customer: { name: 'Cliente removida', city: '' }, anonymized: true });
    expect(anon.json.order.note).toBeUndefined();
  });

  it('refuses unknown products, wrong sizes and missing details', async () => {
    const c = await catalog();
    const ring = c.products.find((p: any) => p.available && p.variants.some((v: any) => v.available && v.sizes?.length));
    const rv = ring.variants.find((v: any) => v.sizes?.length);
    expect((await place(order([{ productId: 'nope', variantId: 'x', qty: 1 }]))).status).toBe(409);
    const noSize = await place(order([{ productId: ring.id, variantId: rv.id, qty: 1 }]));
    expect(noSize.status).toBe(409);
    expect(noSize.json.error.details.problems[0].reason).toBe('size');
    expect((await place(order([{ productId: ring.id, variantId: rv.id, size: rv.sizes[0], qty: 21 }]))).status).toBe(400);
    expect((await place({ items: [], name: 'Ana', city: 'Rio' })).status).toBe(400);
  });

  it('takes stock on confirmation, gives it back on cancel, and never sells the last unit twice', async () => {
    const a = await admin();
    const product = await plainProduct();
    const v = product.variants[0];
    const key = `${v.id}|`;

    const set = await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: true, levels: [{ variantId: v.id, size: '', qty: 1, expected: null }] } });
    expect(set.status).toBe(200);
    let pub = await catalog();
    expect(pub.version).toBe(set.json.version);
    expect(pub.stock[product.id]).toEqual({ [key]: 1 });
    // A stale editor (expected the old value) is refused instead of overwriting.
    const stale = await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: true, levels: [{ variantId: v.id, size: '', qty: 5, expected: null }] } });
    expect(stale.status).toBe(409);
    expect(stale.json.error.details.conflicts[0].current).toBe(1);

    // More than the stock is refused at registration; two orders of 1 are accepted (stock moves only on confirmation).
    expect((await place(order([{ productId: product.id, variantId: v.id, qty: 2 }]))).json.error.details.problems[0]).toMatchObject({ reason: 'stock', available: 1 });
    const o1 = (await place(order([{ productId: product.id, variantId: v.id, qty: 1 }]))).json.order;
    const o2 = (await place(order([{ productId: product.id, variantId: v.id, qty: 1 }]))).json.order;
    const list = (await a.req('/api/admin/orders')).json.orders;
    const id1 = list.find((o: any) => o.number === o1.number).id;
    const id2 = list.find((o: any) => o.number === o2.number).id;

    // Both confirmed at the same time: exactly one wins the last unit.
    const results = await Promise.all([id1, id2].map((id) => a.req(`/api/admin/orders/${id}/status`, { body: { from: 'enviado', to: 'confirmado' } })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.json.error.message).toContain('Estoque insuficiente');
    expect(loser.json.error.message).toMatch(/, (Rosé|Dourado|Prateado|Ródio negro):/); // labels, not internal ids
    const winnerId = results[0]!.status === 200 ? id1 : id2;
    const loserId = winnerId === id1 ? id2 : id1;

    pub = await catalog();
    expect(pub.stock[product.id][key]).toBe(0);
    expect((await place(order([{ productId: product.id, variantId: v.id, qty: 1 }]))).json.error.details.problems[0].reason).toBe('unavailable');

    // Compare-and-swap on the status: a wrong `from` is refused, a repeated move is harmless.
    expect((await a.req(`/api/admin/orders/${winnerId}/status`, { body: { from: 'enviado', to: 'confirmado' } })).status).toBe(200);
    expect((await a.req(`/api/admin/orders/${winnerId}/status`, { body: { from: 'pago', to: 'entregue' } })).status).toBe(409);
    expect((await a.req(`/api/admin/orders/${winnerId}/status`, { body: { from: 'confirmado', to: 'entregue' } })).status).toBe(400);
    expect((await a.req(`/api/admin/orders/${winnerId}`, { method: 'DELETE' })).status).toBe(409); // holds stock

    // Paid then cancelled: the unit comes back exactly once.
    expect((await a.req(`/api/admin/orders/${winnerId}/status`, { body: { from: 'confirmado', to: 'pago' } })).json.order.status).toBe('pago');
    const cancelled = await a.req(`/api/admin/orders/${winnerId}/status`, { body: { from: 'pago', to: 'cancelado' } });
    expect(cancelled.json.order.status).toBe('cancelado');
    expect(cancelled.json.order.stockMoves).toBeUndefined();
    expect((await catalog()).stock[product.id][key]).toBe(1);

    // Now the other order can be confirmed.
    expect((await a.req(`/api/admin/orders/${loserId}/status`, { body: { from: 'enviado', to: 'confirmado' } })).status).toBe(200);
    expect((await catalog()).stock[product.id][key]).toBe(0);

    const stock = (await a.req('/api/admin/stock')).json;
    const moves = stock.movements.filter((m: any) => m.productId === product.id).map((m: any) => [m.reason, m.delta, m.qtyAfter]);
    expect(moves).toEqual([
      ['pedido', -1, 0],
      ['devolucao', 1, 1],
      ['pedido', -1, 0],
      ['ajuste', 1, 1],
    ]);

    expect((await a.req(`/api/admin/orders/${winnerId}`, { method: 'DELETE' })).json.deleted).toBe(true);
    expect((await a.req(`/api/admin/orders/${winnerId}`, { method: 'DELETE' })).json.deleted).toBe(false);

    // Turning control off restores the plain behaviour.
    const off = await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: false, levels: [] } });
    expect(off.status).toBe(200);
    expect((await catalog()).stock[product.id]).toBeUndefined();
  });

  it('keeps the stock map through catalog edits and drops the rows of a removed finish', async () => {
    const a = await admin();
    const product = await plainProduct(2);
    const [v1, v2] = product.variants;
    await a.req(`/api/admin/stock/${product.id}`, {
      method: 'PUT',
      body: { tracked: true, levels: [{ variantId: v1.id, size: '', qty: 4, expected: null }, { variantId: v2.id, size: '', qty: 3, expected: null }] },
    });
    const before = await catalog();
    expect(before.stock[product.id]).toEqual({ [`${v1.id}|`]: 4, [`${v2.id}|`]: 3 });

    // An unrelated edit keeps the map.
    const other = before.products.find((p: any) => p.id !== product.id);
    await a.req('/api/admin/changes', { body: { baseVersion: before.version, changes: [{ kind: 'product', op: 'upsert', id: other.id, data: { ...other, featured: !other.featured } }] } });
    expect((await catalog()).stock[product.id]).toEqual({ [`${v1.id}|`]: 4, [`${v2.id}|`]: 3 });

    // Removing a finish drops its stock (snapshot and table); the product stays tracked.
    const now = await catalog();
    const edited = { ...product, variants: [v1], images: product.images, updatedAt: new Date().toISOString() };
    const res = await a.req('/api/admin/changes', { body: { baseVersion: now.version, changes: [{ kind: 'product', op: 'upsert', id: product.id, data: edited }] } });
    expect(res.status).toBe(200);
    expect((await catalog()).stock[product.id]).toEqual({ [`${v1.id}|`]: 4 });
    const rows = (await a.req('/api/admin/stock')).json.levels.filter((l: any) => l.productId === product.id);
    expect(rows.map((r: any) => r.variantId)).toEqual([v1.id]);
  });

  it('never reuses the number of a deleted order', async () => {
    const a = await admin();
    const product = await plainProduct();
    const body = order([{ productId: product.id, variantId: product.variants[0].id, qty: 1 }]);
    const first = (await place(body)).json.order;
    const id = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.number === first.number).id;
    expect((await a.req(`/api/admin/orders/${id}`, { method: 'DELETE' })).json.deleted).toBe(true);
    const next = (await place(body)).json.order;
    expect(next.number).toBe(first.number + 1);
  });

  it('keeps both the erasure and the stock record when anonymizing and moving an order', async () => {
    const a = await admin();
    const product = await plainProduct();
    const v = product.variants[0];
    await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: true, levels: [{ variantId: v.id, size: '', qty: 3, expected: null }] } });
    const placed = (await place(order([{ productId: product.id, variantId: v.id, qty: 2 }], { name: 'Para Apagar', note: 'nota' }))).json.order;
    const id = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.number === placed.number).id;
    // Anonymize and confirm at the same time: neither write may undo the other.
    const [anon, confirmed] = await Promise.all([
      a.req(`/api/admin/orders/${id}/anonymize`, { body: {} }),
      a.req(`/api/admin/orders/${id}/status`, { body: { from: 'enviado', to: 'confirmado' } }),
    ]);
    expect(anon.status).toBe(200);
    expect(confirmed.status).toBe(200);
    const stored = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === id);
    expect(stored).toMatchObject({ status: 'confirmado', anonymized: true, customer: { name: 'Cliente removida', city: '' } });
    expect(stored.note).toBeUndefined();
    expect(stored.stockMoves).toEqual([{ productId: product.id, variantId: v.id, size: '', qty: 2 }]);
    expect((await catalog()).stock[product.id][`${v.id}|`]).toBe(1);
    expect((await a.req(`/api/admin/orders/${id}/status`, { body: { from: 'confirmado', to: 'cancelado' } })).status).toBe(200);
    expect((await catalog()).stock[product.id][`${v.id}|`]).toBe(3);
    await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: false, levels: [] } });
  });

  it('refuses a malformed Pix key in the settings', async () => {
    const a = await admin();
    const c = await catalog();
    const bad = await a.req('/api/admin/changes', { body: { baseVersion: c.version, changes: [{ kind: 'settings', op: 'upsert', data: { ...c.settings, pix: { key: '(67) 99999-8888', name: 'EKA', city: 'RIO' } } }] } });
    expect(bad.status).toBe(400);
    const good = await a.req('/api/admin/changes', { body: { baseVersion: c.version, changes: [{ kind: 'settings', op: 'upsert', data: { ...c.settings, pix: { key: '+5567999998888', name: 'EKA', city: 'RIO' } } }] } });
    expect(good.status).toBe(200);
    expect((await catalog()).settings.pix.key).toBe('+5567999998888');
    const back = await catalog();
    const { pix: _pix, ...rest } = back.settings;
    expect((await a.req('/api/admin/changes', { body: { baseVersion: back.version, changes: [{ kind: 'settings', op: 'upsert', data: rest }] } })).status).toBe(200);
  });

  it('pushes an orders notice to admin sockets only', async () => {
    const a = await admin();
    const wsUrl = BASE().replace(/^http/, 'ws') + '/api/live';
    const listen = (headers: Record<string, string>) =>
      new Promise<{ ws: WebSocket; got: string[] }>((resolve) => {
        const ws = new WebSocket(wsUrl, { headers } as any);
        const got: string[] = [];
        ws.addEventListener('message', (e) => got.push(String(e.data)));
        ws.addEventListener('open', () => resolve({ ws, got }));
      });
    const cookie = [...a.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const adminWs = await listen({ Origin: BASE(), Cookie: cookie, 'CF-Connecting-IP': a.ip });
    const publicWs = await listen({ Origin: BASE() });
    const product = await plainProduct();
    await place(order([{ productId: product.id, variantId: product.variants[0].id, qty: 1 }]));
    const deadline = Date.now() + 5000;
    while (!adminWs.got.some((m) => m.includes('"orders"')) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    expect(adminWs.got.some((m) => m.includes('"orders"'))).toBe(true);
    expect(publicWs.got.some((m) => m.includes('"orders"'))).toBe(false);
    for (const m of adminWs.got) expect(m).not.toContain('Cliente Teste');
    adminWs.ws.close();
    publicWs.ws.close();
  });
});

describe('PIN change', () => {
  it('ends a session that keeps answering the current PIN wrong', async () => {
    const a = await admin();
    expect((await a.req('/api/admin/pin', { body: { currentPin: '000009', newPin: '58302917' } })).json.error.code).toBe('invalid_pin');
    expect((await a.req('/api/admin/pin', { body: { currentPin: '000008', newPin: '58302917' } })).json.error.code).toBe('invalid_pin');
    const third = await a.req('/api/admin/pin', { body: { currentPin: '000007', newPin: '58302917' } });
    expect(third.status).toBe(401);
    expect(third.json.error.code).toBe('unauthenticated');
    expect((await a.req('/api/admin/leads')).status).toBe(401);
  });

  it('enforces the PIN policy, revokes other sessions and accepts the new PIN', async () => {
    const a = await admin();
    const other = await admin();
    expect((await a.req('/api/admin/pin', { body: { currentPin, newPin: '123456' } })).status).toBe(400);
    expect((await a.req('/api/admin/pin', { body: { currentPin, newPin: '111111' } })).status).toBe(400);
    expect((await a.req('/api/admin/pin', { body: { currentPin, newPin: '12345' } })).status).toBe(400);
    expect((await a.req('/api/admin/pin', { body: { currentPin: '000009', newPin: '58302917' } })).status).toBe(401);
    const deviceBefore = a.cookies.get('eka_device');
    const changed = await a.req('/api/admin/pin', { body: { currentPin, newPin: '58302917' } });
    expect(changed.status).toBe(200);
    currentPin = '58302917';
    // This device gets a fresh session and device cookie; everything issued before is void.
    expect(changed.headers.getSetCookie().join('\n')).toMatch(/eka_admin=.+eka_device=|eka_device=.+eka_admin=|eka_admin=[^\n]+\n[^\n]*eka_device=/s);
    expect(a.cookies.get('eka_device')).not.toBe(deviceBefore);
    expect((await other.req('/api/admin/leads')).status).toBe(401);
    expect((await a.req('/api/admin/leads')).status).toBe(200);
    expect((await new Client().login(INITIAL_PIN)).status).toBe(401);
    const fresh = new Client();
    expect((await fresh.login('58302917')).status).toBe(200);
    expect((await fresh.req('/api/admin/session')).json).toEqual({ authenticated: true, pinLength: 8 });
  });
});
