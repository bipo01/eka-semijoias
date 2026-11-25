/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are asserted field by field in these tests. */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { MP_WEBHOOK_SECRET } from '../global-setup';

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

let knownDevice: string | undefined;
/** A logged-in admin. Reuses a device that logged in before (exempt from the global login cap, like a real phone). */
async function admin(): Promise<Client> {
  const c = new Client();
  if (knownDevice) c.cookies.set('eka_device', knownDevice);
  const res = await c.login();
  if (res.status === 200) knownDevice = c.cookies.get('eka_device') ?? knownDevice;
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

  it('names each installable app in the document itself (iOS reads the home-screen name from it)', async () => {
    const head = async (path: string) => {
      const html = await (await fetch(`${BASE()}${path}`)).text();
      return {
        manifest: /<link rel="manifest" href="([^"]+)"/.exec(html)?.[1],
        icon: /<link rel="apple-touch-icon" href="([^"]+)"/.exec(html)?.[1],
        title: /<meta name="apple-mobile-web-app-title" content="([^"]+)"/.exec(html)?.[1],
      };
    };
    expect(await head('/')).toEqual({ manifest: '/manifest.webmanifest', icon: '/apple-touch-icon.png', title: 'ÉKA' });
    expect(await head('/admin')).toEqual({ manifest: '/admin.webmanifest', icon: '/admin-apple-touch-icon.png', title: 'Painel ÉKA' });
    expect(await head('/admin/pedidos')).toEqual({ manifest: '/admin.webmanifest', icon: '/admin-apple-touch-icon.png', title: 'Painel ÉKA' });
    expect(await head('/revenda')).toEqual({ manifest: '/revenda.webmanifest', icon: '/apple-touch-icon.png', title: 'ÉKA Revenda' });
    expect((await head('/administrar')).title).toBe('ÉKA');
  });

  it('marks hashed assets immutable only when they exist (a 404 must never be cached)', async () => {
    const html = await (await fetch(`${BASE()}/`)).text();
    const entry = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect(entry).toBeTruthy();
    const ok = await fetch(`${BASE()}${entry}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(ok.headers.get('Content-Type')).toContain('javascript');
    const missing = await fetch(`${BASE()}/assets/index-naoexiste.js`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('no-store');
    expect(missing.headers.get('Content-Type') ?? '').not.toContain('text/html'); // never the SPA document
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
  const lead = { name: 'Maria da Silva', whatsapp: '(65) 99999-1234', city: 'Cuiabá', uf: 'MT', instagram: '@maria', alreadySells: true, source: 'Instagram', consent: true };

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
    expect(mine).toMatchObject({ whatsapp: '65999991234', instagram: 'maria', uf: 'MT' });
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
  const order = (items: any[], extra: Record<string, unknown> = {}) => ({ items, name: 'Cliente Teste', city: 'Várzea Grande', ...extra });
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
    expect(stored).toMatchObject({ status: 'enviado', customer: { name: secretName, city: 'Várzea Grande' }, note: 'presente', totalCents: price(product) * 2 });

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
    // Newest first; other suites may have moved this piece before (only this test's four count).
    const moves = stock.movements.filter((m: any) => m.productId === product.id).slice(0, 4).map((m: any) => [m.reason, m.delta, m.qtyAfter]);
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

  it('registers manual orders and edits items with exact stock (netted swaps, no oversell)', async () => {
    const a = await admin();
    const p1 = await plainProduct();
    const p2 = await plainProduct(1, [p1.id]);
    const v1 = p1.variants[0];
    const v2 = p2.variants[0];
    const k1 = `${v1.id}|`;
    const k2 = `${v2.id}|`;
    for (const [p, v, qty] of [[p1, v1, 2], [p2, v2, 1]] as const) {
      expect((await a.req(`/api/admin/stock/${p.id}`, { method: 'PUT', body: { tracked: true, levels: [{ variantId: v.id, size: '', qty, expected: null }] } })).status).toBe(200);
    }
    const manual = (body: unknown, key = randomUUID(), client: Client = a) => client.req('/api/admin/orders', { body, headers: { 'Idempotency-Key': key } });
    const line = (p: any, v: any, qty: number) => ({ productId: p.id, variantId: v.id, qty });

    expect((await manual({ items: [line(p1, v1, 1)], name: 'Ana', status: 'enviado' }, randomUUID(), new Client())).status).toBe(401);
    expect((await a.req('/api/admin/orders', { body: { items: [line(p1, v1, 1)], name: 'Ana', status: 'enviado' } })).status).toBe(400); // no key
    expect((await manual({ items: [line(p1, v1, 1)], name: 'Ana', status: 'pago' })).status).toBe(400);

    // Confirmed with more than the stock: refused, nothing moves.
    const tooMany = await manual({ items: [line(p1, v1, 3)], name: 'Ana Manual', status: 'confirmado' });
    expect(tooMany.status).toBe(409);
    expect(tooMany.json.error.message).toContain('Estoque insuficiente');
    // In negotiation: registered (city optional), stock untouched.
    const neg = await manual({ items: [line(p1, v1, 3)], name: 'Ana Manual', status: 'enviado' });
    expect(neg.status).toBe(201);
    expect(neg.json.order).toMatchObject({ status: 'enviado', source: 'manual', customer: { name: 'Ana Manual', city: '' }, totalCents: price(p1) * 3 });
    expect((await catalog()).stock[p1.id][k1]).toBe(2);

    // Confirmed: takes the pieces in the same batch; a retry returns the same order.
    const key = randomUUID();
    const body = { items: [line(p1, v1, 1)], name: 'Bia Manual', city: 'Cuiabá', note: 'veio pelo WhatsApp', status: 'confirmado' };
    const conf = await manual(body, key);
    expect(conf.status).toBe(201);
    expect(conf.json.order).toMatchObject({ status: 'confirmado', stockMoves: [{ productId: p1.id, variantId: v1.id, size: '', qty: 1 }] });
    expect(conf.json.order.history.map((h: any) => h.status)).toEqual(['enviado', 'confirmado']);
    expect((await manual(body, key)).json.order.number).toBe(conf.json.order.number);
    expect((await catalog()).stock[p1.id][k1]).toBe(1);
    const stored = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.number === conf.json.order.number);
    expect(stored).toMatchObject({ id: conf.json.order.id, status: 'confirmado', source: 'manual', note: 'veio pelo WhatsApp' });

    // Edit the confirmed order: 2 × p1 (1 held + the last free unit) and 1 × p2. Only the difference moves.
    const edit = (order: any, items: unknown[]) => a.req(`/api/admin/orders/${order.id}/items`, { method: 'PUT', body: { items, stamp: order.updatedAt } });
    const e1 = await edit(stored, [line(p1, v1, 2), line(p2, v2, 1)]);
    expect(e1.status).toBe(200);
    expect(e1.json.order.totalCents).toBe(price(p1) * 2 + price(p2));
    expect(e1.json.order.history.at(-1)).toMatchObject({ status: 'confirmado', event: 'itens' });
    let pub = await catalog();
    expect(pub.stock[p1.id][k1]).toBe(0);
    expect(pub.stock[p2.id][k2]).toBe(0);
    // A stale editor (old stamp) is refused.
    expect((await edit(stored, [line(p1, v1, 1)])).status).toBe(409);
    // One more p2 than exists: refused, nothing moves.
    const over = await edit(e1.json.order, [line(p1, v1, 2), line(p2, v2, 2)]);
    expect(over.status).toBe(409);
    expect(over.json.error.message).toContain('pedido 2, disponível 1');

    // A confirmation and an edit racing for the same two free units: only one gets them.
    const neg2 = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.number === neg.json.order.number);
    const back = await edit(e1.json.order, [line(p2, v2, 1)]); // gives back the 2 × p1
    expect(back.status).toBe(200);
    expect((await catalog()).stock[p1.id][k1]).toBe(2);
    const confirmNeg = await a.req(`/api/admin/orders/${neg2.id}/status`, { body: { from: 'enviado', to: 'confirmado' } }); // wants 3 × p1
    expect(confirmNeg.status).toBe(409);
    const shrunk = await edit(neg2, [line(p1, v1, 2)]);
    expect(shrunk.status).toBe(200);
    const race = await Promise.all([
      a.req(`/api/admin/orders/${neg2.id}/status`, { body: { from: 'enviado', to: 'confirmado' } }),
      edit(back.json.order, [line(p2, v2, 1), line(p1, v1, 2)]),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    pub = await catalog();
    expect(pub.stock[p1.id][k1]).toBe(0);

    const moves = (await a.req('/api/admin/stock')).json.movements.filter((m: any) => m.productId === p1.id);
    expect(moves.every((m: any) => m.qtyAfter >= 0)).toBe(true);
    expect(moves.filter((m: any) => m.reason !== 'ajuste').every((m: any) => typeof m.orderNumber === 'number')).toBe(true);

    // Cleanup: cancel and delete, stock control off.
    for (const o of (await a.req('/api/admin/orders')).json.orders.filter((x: any) => [neg.json.order.number, conf.json.order.number].includes(x.number))) {
      if (o.status !== 'enviado' && o.status !== 'cancelado') expect((await a.req(`/api/admin/orders/${o.id}/status`, { body: { from: o.status, to: 'cancelado' } })).status).toBe(200);
      expect((await a.req(`/api/admin/orders/${o.id}`, { method: 'DELETE' })).json.deleted).toBe(true);
    }
    pub = await catalog();
    expect(pub.stock[p1.id][k1]).toBe(2);
    expect(pub.stock[p2.id][k2]).toBe(1);
    for (const p of [p1, p2]) expect((await a.req(`/api/admin/stock/${p.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
  });

  it('does not take stock again for a line confirmed before its piece had stock control', async () => {
    const a = await admin();
    const p1 = await plainProduct();
    const p2 = await plainProduct(1, [p1.id]);
    const line = (p: any, qty: number) => ({ productId: p.id, variantId: p.variants[0].id, qty });
    const conf = await a.req('/api/admin/orders', { body: { items: [line(p1, 1)], name: 'Sem Controle', status: 'confirmado' }, headers: { 'Idempotency-Key': randomUUID() } });
    expect(conf.json.order.stockMoves).toEqual([]);
    // Stock control turned on afterwards, with the piece set aside for this order (0 free).
    expect((await a.req(`/api/admin/stock/${p1.id}`, { method: 'PUT', body: { tracked: true, levels: [{ variantId: p1.variants[0].id, size: '', qty: 0, expected: null }] } })).status).toBe(200);
    const order = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === conf.json.order.id);
    const edited = await a.req(`/api/admin/orders/${order.id}/items`, { method: 'PUT', body: { items: [line(p1, 1), line(p2, 1)], stamp: order.updatedAt } });
    expect(edited.status).toBe(200);
    expect((await catalog()).stock[p1.id][`${p1.variants[0].id}|`]).toBe(0);
    // One more unit of that line is a real take (and there is none).
    const more = await a.req(`/api/admin/orders/${order.id}/items`, { method: 'PUT', body: { items: [line(p1, 2), line(p2, 1)], stamp: edited.json.order.updatedAt } });
    expect(more.status).toBe(409);
    await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'confirmado', to: 'cancelado' } });
    await a.req(`/api/admin/orders/${order.id}`, { method: 'DELETE' });
    expect((await a.req(`/api/admin/stock/${p1.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
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
    const bad = await a.req('/api/admin/changes', { body: { baseVersion: c.version, changes: [{ kind: 'settings', op: 'upsert', data: { ...c.settings, pix: { key: '(65) 99999-8888', name: 'EKA', city: 'RIO' } } }] } });
    expect(bad.status).toBe(400);
    const good = await a.req('/api/admin/changes', { body: { baseVersion: c.version, changes: [{ kind: 'settings', op: 'upsert', data: { ...c.settings, pix: { key: '+5565999998888', name: 'EKA', city: 'RIO' } } }] } });
    expect(good.status).toBe(200);
    expect((await catalog()).settings.pix.key).toBe('+5565999998888');
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

describe('Pix charges and receipts', () => {
  const pngBytes = () => {
    const out = new Uint8Array(64);
    out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    out.set(new TextEncoder().encode(randomUUID()), 16);
    return out;
  };
  async function withPix(a: Client, on: boolean) {
    const c = await catalog();
    const { pix: _pix, ...rest } = c.settings;
    const settings = on ? { ...rest, pix: { key: '+5565999998888', name: 'EKA SEMIJOIAS', city: 'CUIABA' } } : rest;
    const res = await a.req('/api/admin/changes', { body: { baseVersion: c.version, changes: [{ kind: 'settings', op: 'upsert', data: settings }] } });
    expect(res.status).toBe(200);
  }
  async function newOrder(a: Client, name = 'Maria Clara Souza') {
    const c = await catalog();
    const product = c.products.find((p: any) => p.available && p.variants.every((v: any) => v.available && !v.sizes?.length) && !c.stock?.[p.id]);
    const created = await new Client().req('/api/orders', { body: { items: [{ productId: product.id, variantId: product.variants[0].id, qty: 1 }], name, city: 'Várzea Grande' }, headers: { 'Idempotency-Key': randomUUID() } });
    expect(created.status).toBe(201);
    const order = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.number === created.json.order.number);
    return { order, product };
  }

  it('charges a confirmed order, serves the payment page by token and takes receipts for the admin only', async () => {
    const a = await admin();
    await withPix(a, true);
    const { order, product } = await newOrder(a);
    expect(order.pix).toBe(false); // no Pix at checkout any more

    // Charging needs a confirmed order.
    const early = await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 2000, discountCents: 500 } });
    expect(early.status).toBe(409);
    await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'enviado', to: 'confirmado' } });
    const charged = await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 2000, discountCents: 500 } });
    expect(charged.status).toBe(200);
    const charge = charged.json.order.charge;
    expect(charge.amountCents).toBe((product.promoPrice ?? product.price) + 2000 - 500);
    expect(charge.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 0, discountCents: 99_999_999 } })).status).toBe(400);

    // Public payment view: first name only, amounts, Pix data; nothing else personal.
    const view = await new Client().req(`/api/pay/${charge.token}`);
    expect(view.status).toBe(200);
    expect(view.json).toMatchObject({ number: order.number, firstName: 'Maria', amountCents: charge.amountCents, shippingCents: 2000, discountCents: 500, state: 'aguardando', pix: { key: '+5565999998888' } });
    expect(view.text).not.toContain('Souza');
    expect(view.text).not.toContain('Várzea Grande');
    expect((await new Client().req('/api/pay/not-a-real-token-1234567890')).status).toBe(404);

    // Same amount keeps the link; a new amount issues a new one and the old link dies.
    const same = await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 2000, discountCents: 500 } });
    expect(same.json.order.charge.token).toBe(charge.token);
    const changed = await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 1500, discountCents: 0 } });
    const token = changed.json.order.charge.token;
    expect(token).not.toBe(charge.token);
    expect((await new Client().req(`/api/pay/${charge.token}`)).status).toBe(404);

    // Receipts: real type checked, size capped, stored for the admin only.
    const visitor = new Client();
    expect((await visitor.req(`/api/pay/${token}/receipt`, { raw: new TextEncoder().encode('<html>hi</html>'), type: 'image/png' })).status).toBe(415);
    expect((await visitor.req(`/api/pay/${token}/receipt`, { raw: pngBytes(), type: 'application/pdf' })).status).toBe(415);
    expect((await visitor.req(`/api/pay/${token}/receipt`, { raw: new Uint8Array(800_000), type: 'image/png' })).status).toBe(413);
    expect((await visitor.req(`/api/pay/${token}/receipt`, { raw: pngBytes(), type: 'image/png', origin: 'https://evil.example' })).status).toBe(403);
    const shot = pngBytes();
    const sent = await visitor.req(`/api/pay/${token}/receipt`, { raw: shot, type: 'image/png' });
    expect(sent.status).toBe(201);
    // The same file again (a retry after a lost answer): answered as received, stored once.
    const again = await visitor.req(`/api/pay/${token}/receipt`, { raw: shot, type: 'image/png' });
    expect(again.status).toBe(201);
    expect(again.json.receipt.at).toBe(sent.json.receipt.at);
    const pdf = await visitor.req(`/api/pay/${token}/receipt`, { raw: new TextEncoder().encode('%PDF-1.7\n%comprovante'), type: 'application/pdf' });
    expect(pdf.status).toBe(201);
    expect((await new Client().req(`/api/pay/${token}`)).json).toMatchObject({ state: 'analise', receipts: [{}, {}] });

    const stored = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === order.id);
    expect(stored.receipts.map((r: any) => r.contentType)).toEqual(['image/png', 'application/pdf']);
    const file = await a.req(`/api/admin/receipts/${stored.receipts[1].id}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('Content-Type')).toBe('application/pdf');
    expect(file.headers.get('Cache-Control')).toContain('no-store');
    expect(file.headers.get('Content-Disposition')).toMatch(/^attachment;/); // customer PDFs never render on this origin
    expect(file.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(file.text.startsWith('%PDF-')).toBe(true);
    expect((await new Client().req(`/api/admin/receipts/${stored.receipts[1].id}`)).status).toBe(401);
    expect(JSON.stringify(await catalog())).not.toContain('rcp_');

    // Paid: the page says so and takes no more receipts.
    await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'confirmado', to: 'pago' } });
    expect((await new Client().req(`/api/pay/${token}`)).json.state).toBe('pago');
    expect((await visitor.req(`/api/pay/${token}/receipt`, { raw: pngBytes(), type: 'image/png' })).status).toBe(409);

    // Erasing the customer's data erases the receipts too.
    const anon = await a.req(`/api/admin/orders/${order.id}/anonymize`, { body: {} });
    expect(anon.json.order.receipts).toBeUndefined();
    expect((await a.req(`/api/admin/receipts/${stored.receipts[0].id}`)).status).toBe(404);
    expect((await new Client().req(`/api/pay/${token}`)).status).toBe(404); // the link dies with the personal data
    await withPix(a, false);
  });

  it('kills the link when the order goes back to negotiation or is anonymized, and starts fresh after a new amount', async () => {
    const a = await admin();
    await withPix(a, true);
    const { order } = await newOrder(a, 'Lia Mendes');
    const status = (from: string, to: string) => a.req(`/api/admin/orders/${order.id}/status`, { body: { from, to } });
    const charge = (shippingCents: number) => a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents, discountCents: 0 } });
    await status('enviado', 'confirmado');
    const t1 = (await charge(0)).json.order.charge.token;
    expect((await new Client().req(`/api/pay/${t1}/receipt`, { raw: pngBytes(), type: 'image/png' })).status).toBe(201);
    expect((await new Client().req(`/api/pay/${t1}`)).json.state).toBe('analise');

    // New amount after a receipt: the new link asks for the new value (Pix shown again).
    const t2 = (await charge(1500)).json.order.charge.token;
    const view = await new Client().req(`/api/pay/${t2}`);
    expect(view.json).toMatchObject({ state: 'aguardando', receipts: [] });
    expect((await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === order.id).receipts).toHaveLength(1); // the admin still sees it

    // Undo to "em negociação": the link dies and takes nothing.
    expect((await status('confirmado', 'enviado')).json.order.charge).toBeUndefined();
    expect((await new Client().req(`/api/pay/${t2}`)).status).toBe(404);
    expect((await new Client().req(`/api/pay/${t2}/receipt`, { raw: pngBytes(), type: 'image/png' })).status).toBe(404);

    // Cancel then reopen: same.
    await status('enviado', 'confirmado');
    const t3 = (await charge(0)).json.order.charge.token;
    await status('confirmado', 'cancelado');
    expect((await new Client().req(`/api/pay/${t3}`)).json.state).toBe('cancelado');
    expect((await new Client().req(`/api/pay/${t3}/receipt`, { raw: pngBytes(), type: 'image/png' })).status).toBe(409);
    await status('cancelado', 'enviado');
    expect((await new Client().req(`/api/pay/${t3}`)).status).toBe(404);

    // Anonymized: the link dies.
    await status('enviado', 'confirmado');
    const t4 = (await charge(0)).json.order.charge.token;
    await a.req(`/api/admin/orders/${order.id}/anonymize`, { body: {} });
    expect((await new Client().req(`/api/pay/${t4}/receipt`, { raw: pngBytes(), type: 'image/png' })).status).toBe(404);
    await withPix(a, false);
  });

  it('drops the charge (and the old link) when an edit changes the amount, and keeps it otherwise', async () => {
    const a = await admin();
    await withPix(a, true);
    const { order, product } = await newOrder(a, 'Edite Itens');
    const confirmed = (await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'enviado', to: 'confirmado' } })).json.order;
    const charged = (await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 1000, discountCents: 0 } })).json.order;
    const token = charged.charge.token;
    expect((await new Client().req(`/api/pay/${token}`)).status).toBe(200);
    const line = { productId: product.id, variantId: product.variants[0].id, qty: 1 };
    // Same pieces: nothing changes.
    const same = await a.req(`/api/admin/orders/${order.id}/items`, { method: 'PUT', body: { items: [line], stamp: charged.updatedAt } });
    expect(same.json.order.charge.token).toBe(token);
    // Two units: new amount, the charge falls and the link stops working.
    const more = await a.req(`/api/admin/orders/${order.id}/items`, { method: 'PUT', body: { items: [{ ...line, qty: 2 }], stamp: charged.updatedAt } });
    expect(more.status).toBe(200);
    expect(more.json.chargeDropped).toBe(true);
    expect(more.json.order.charge).toBeUndefined();
    expect(more.json.order.totalCents).toBe(confirmed.totalCents * 2);
    expect((await new Client().req(`/api/pay/${token}`)).status).toBe(404);
    // Delivered orders cannot be edited.
    await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'confirmado', to: 'pago' } });
    const paid = (await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'pago', to: 'entregue' } })).json.order;
    expect((await a.req(`/api/admin/orders/${order.id}/items`, { method: 'PUT', body: { items: [line], stamp: paid.updatedAt } })).status).toBe(409);
  });

  it('charges without a Pix key only through the automatic Pix, caps receipts per order and drops them with the order', async () => {
    const a = await admin();
    await withPix(a, false);
    const { order } = await newOrder(a, 'Bia');
    await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'enviado', to: 'confirmado' } });
    // This suite runs with the Mercado Pago secrets: the automatic Pix covers an order without a key
    // (without the secrets the charge is refused with 503 until a key is saved).
    const noPix = await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 0, discountCents: 0 } });
    expect(noPix.status).toBe(200);
    expect((await new Client().req(`/api/pay/${noPix.json.order.charge.token}`)).json).toMatchObject({ pix: null, auto: true });
    await withPix(a, true);
    const token = (await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 0, discountCents: 0 } })).json.order.charge.token;
    for (let i = 0; i < 6; i++) expect((await new Client().req(`/api/pay/${token}/receipt`, { raw: pngBytes(), type: 'image/png' })).status).toBe(201);
    expect((await new Client().req(`/api/pay/${token}/receipt`, { raw: pngBytes(), type: 'image/png' })).status).toBe(409);
    const ids = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === order.id).receipts.map((r: any) => r.id);
    await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'confirmado', to: 'cancelado' } });
    expect((await new Client().req(`/api/pay/${token}`)).json.state).toBe('cancelado');
    expect((await a.req(`/api/admin/orders/${order.id}`, { method: 'DELETE' })).json.deleted).toBe(true);
    expect((await a.req(`/api/admin/receipts/${ids[0]}`)).status).toBe(404);
    expect((await new Client().req(`/api/pay/${token}`)).status).toBe(404);
    await withPix(a, false);
  });
});




// ---------------------------------------------------------------------------
// Phone notices (Web Push) and the automatic Pix (Mercado Pago), against a mock server
// ---------------------------------------------------------------------------

interface PushHit {
  path: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
}
interface MockPayment {
  id: number;
  status: string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string;
}
const mock = {
  pushHits: [] as PushHit[],
  pushStatus: new Map<string, number>(),
  payments: new Map<number, MockPayment>(),
  idempotency: new Map<string, number>(),
  creates: [] as { body: any; key: string | undefined; auth: string | undefined }[],
  cancels: [] as number[],
};
let mockServer: Server;

beforeAll(async () => {
  mockServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = req.url ?? '';
      const send = (status: number, payload?: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(payload === undefined ? '' : JSON.stringify(payload));
      };
      if (url.startsWith('/push/')) {
        mock.pushHits.push({ path: url, headers: req.headers, body });
        return send(mock.pushStatus.get(url) ?? 201);
      }
      if (req.method === 'POST' && url === '/v1/payments') {
        const parsed = JSON.parse(body.toString());
        const key = req.headers['x-idempotency-key'] as string | undefined;
        mock.creates.push({ body: parsed, key, auth: req.headers.authorization });
        let id = key ? mock.idempotency.get(key) : undefined;
        if (!id) {
          id = 900_000 + mock.payments.size + 1;
          if (key) mock.idempotency.set(key, id);
          mock.payments.set(id, { id, status: 'pending', transaction_amount: parsed.transaction_amount, currency_id: 'BRL', external_reference: parsed.external_reference });
        }
        return send(201, { id, status: 'pending', point_of_interaction: { transaction_data: { qr_code: `00020126MOCKPIX${id}-6304ABCD` } } });
      }
      const m = /^\/v1\/payments\/(\d+)$/.exec(url);
      if (req.method === 'PUT' && m) {
        mock.cancels.push(Number(m[1]));
        const payment = mock.payments.get(Number(m[1]));
        if (payment && payment.status === 'pending') payment.status = 'cancelled';
        return payment ? send(200, payment) : send(404, {});
      }
      if (req.method === 'GET' && m) {
        const payment = mock.payments.get(Number(m[1]));
        return payment ? send(200, payment) : send(404, { message: 'not found' });
      }
      send(404);
    });
  });
  await new Promise<void>((resolve) => mockServer.listen(Number(process.env.MOCK_PORT), '127.0.0.1', resolve));
});
afterAll(() => new Promise<void>((resolve) => mockServer.close(() => resolve())));

const b64u = (bytes: Uint8Array | ArrayBuffer) => Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString('base64url');

/** A browser-like push subscription: P-256 key pair + auth secret, endpoint on the mock. */
async function fakeSubscription(name: string) {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, publicRaw, auth, json: { endpoint: `http://127.0.0.1:${process.env.MOCK_PORT}/push/${name}`, keys: { p256dh: b64u(publicRaw), auth: b64u(auth) } } };
}

/** Decrypts an aes128gcm push body as the browser would (RFC 8291), proving the server's encryption end to end. */
async function decryptPush(sub: Awaited<ReturnType<typeof fakeSubscription>>, body: Buffer): Promise<any> {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const asPublic = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey } as unknown as Parameters<SubtleCrypto['deriveBits']>[0], sub.pair.privateKey, 256));
  const hmac = async (key: Uint8Array, data: Uint8Array) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), data));
  const hkdf = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => (await hmac(await hmac(s, ikm), Buffer.concat([info, Buffer.from([1])]))).slice(0, len);
  const ikm = await hkdf(sub.auth, ecdh, Buffer.concat([Buffer.from('WebPush: info\0'), sub.publicRaw, asPublic]), 32);
  const cek = await hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, record));
  expect(plain.at(-1)).toBe(2); // last-record delimiter
  return JSON.parse(Buffer.from(plain.subarray(0, -1)).toString());
}

const waitFor = async <T,>(fn: () => T | undefined, ms = 5000): Promise<T> => {
  const until = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v !== undefined) return v;
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('phone notices (Web Push)', () => {
  it('subscribes a device, sends an encrypted notice on a new order (number and amount only) and forgets dead devices', async () => {
    const a = await admin();
    expect((await new Client().req('/api/admin/push')).status).toBe(401);
    const status = await a.req('/api/admin/push');
    expect(status.json).toMatchObject({ available: true });
    expect(status.json.publicKey).toMatch(/^B[A-Za-z0-9_-]{86}$/);

    const live = await fakeSubscription(`live-${randomUUID().slice(0, 8)}`);
    const dead = await fakeSubscription(`dead-${randomUUID().slice(0, 8)}`);
    expect((await a.req('/api/admin/push/subscribe', { body: { ...live.json, label: 'iPhone' } })).status).toBe(200);
    const deadSub = await a.req('/api/admin/push/subscribe', { body: { ...dead.json, label: 'Android' } });
    expect(deadSub.json.id).toMatch(/^[0-9a-f]{24}$/);
    mock.pushStatus.set(new URL(dead.json.endpoint).pathname, 410);
    // Anything that is not a push service is refused (no arbitrary outbound requests).
    expect((await a.req('/api/admin/push/subscribe', { body: { ...live.json, endpoint: 'https://evil.example/x' } })).status).toBe(400);
    expect((await a.req('/api/admin/push/subscribe', { body: { ...live.json, keys: { p256dh: 'abc', auth: live.json.keys.auth } } })).status).toBe(400);

    const c = await catalog();
    const product = c.products.find((p: any) => p.available && p.variants.every((v: any) => v.available && !v.sizes?.length) && !c.stock?.[p.id]);
    const secret = `Sigilosa ${randomUUID().slice(0, 6)}`;
    const placed = await new Client().req('/api/orders', { body: { items: [{ productId: product.id, variantId: product.variants[0].id, qty: 2 }], name: secret, city: 'Várzea Grande' }, headers: { 'Idempotency-Key': randomUUID() } });
    expect(placed.status).toBe(201);
    const hit = await waitFor(() => mock.pushHits.find((h) => h.path === new URL(live.json.endpoint).pathname));
    expect(hit.headers['content-encoding']).toBe('aes128gcm');
    expect(hit.headers.ttl).toBe('86400');
    expect(hit.headers.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=B[\w-]+$/);
    const notice = await decryptPush(live, hit.body);
    expect(notice.title).toBe(`Novo pedido nº ${placed.json.order.number}`);
    expect(notice.body).toContain('2 peças');
    expect(notice.url).toBe(`/admin/pedidos?pedido=${placed.json.order.number}`);
    expect(JSON.stringify(notice)).not.toContain(secret);

    // The dead device (410) is erased; the live one shows its last notice.
    await waitFor(() => mock.pushHits.find((h) => h.path === new URL(dead.json.endpoint).pathname));
    let list: any[] = [];
    for (let i = 0; i < 40; i++) {
      list = (await a.req('/api/admin/push')).json.devices;
      if (!list.some((d: any) => d.id === deadSub.json.id)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(list.some((d: any) => d.id === deadSub.json.id)).toBe(false);
    const mine = list.find((d: any) => d.label === 'iPhone');
    expect(mine.lastUsedAt).toBeTruthy();

    const test = await a.req('/api/admin/push/test', { body: {} });
    expect(test.json.sent).toBeGreaterThanOrEqual(1);
    expect((await a.req(`/api/admin/push/${mine.id}`, { method: 'DELETE' })).json.deleted).toBe(true);
    expect((await a.req('/api/admin/push')).json.devices.some((d: any) => d.id === mine.id)).toBe(false);
  });
});

describe('automatic Pix (Mercado Pago)', () => {
  const sign = (dataId: string, requestId: string, ts = String(Date.now())) => `ts=${ts},v1=${createHmac('sha256', MP_WEBHOOK_SECRET).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex')}`;
  const notify = (paymentId: number | string, headers?: Record<string, string>) => {
    const requestId = randomUUID();
    return new Client().req(`/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, {
      body: { action: 'payment.updated', data: { id: String(paymentId) } },
      origin: null,
      headers: headers ?? { 'x-signature': sign(String(paymentId), requestId), 'x-request-id': requestId },
    });
  };

  async function chargedOrder(a: Client) {
    const c = await catalog();
    const product = c.products.find((p: any) => p.available && p.variants.every((v: any) => v.available && !v.sizes?.length) && !c.stock?.[p.id]);
    const created = await new Client().req('/api/orders', { body: { items: [{ productId: product.id, variantId: product.variants[0].id, qty: 1 }], name: 'Paula Pix', city: 'Rio' }, headers: { 'Idempotency-Key': randomUUID() } });
    const order = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.number === created.json.order.number);
    await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'enviado', to: 'confirmado' } });
    const charged = await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 1500, discountCents: 0 } });
    expect(charged.status).toBe(200);
    return charged.json.order;
  }

  it('creates one dynamic Pix per charge and marks the order paid only on a signed, approved, exact payment', async () => {
    const a = await admin();
    const order = await chargedOrder(a);
    const token = order.charge.token;
    const view = await new Client().req(`/api/pay/${token}`);
    expect(view.json).toMatchObject({ auto: true, mp: null });

    expect((await new Client().req(`/api/pay/${token}/pix`, { body: { email: 'nao-e-email' } })).status).toBe(400);
    const pix = await new Client().req(`/api/pay/${token}/pix`, { body: { email: 'Paula@Example.com' } });
    expect(pix.status).toBe(200);
    expect(pix.json.mp.qr).toMatch(/^00020126MOCKPIX\d+/);
    const create = mock.creates.at(-1)!;
    expect(create.auth).toBe('Bearer TEST-integration-token');
    expect(create.key).toBe(`eka-${token}-1`);
    expect(create.body).toMatchObject({ transaction_amount: order.charge.amountCents / 100, payment_method_id: 'pix', payer: { email: 'paula@example.com' }, external_reference: `${order.id}:${token}` });
    expect(create.body.notification_url).toMatch(/\/api\/webhooks\/mercadopago\?source_news=webhooks$/);
    expect(create.body.date_of_expiration).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}-03:00$/);
    // A second tap shows the same Pix (no second payment).
    const again = await new Client().req(`/api/pay/${token}/pix`, { body: { email: 'paula@example.com' } });
    expect(again.json.mp.qr).toBe(pix.json.mp.qr);
    expect(mock.creates.filter((c) => c.key?.startsWith(`eka-${token}`))).toHaveLength(1);
    expect((await new Client().req(`/api/pay/${token}`)).json.mp.qr).toBe(pix.json.mp.qr);
    // The e-mail is not kept anywhere in the order.
    expect(JSON.stringify((await a.req('/api/admin/orders')).json)).not.toContain('paula@example.com');

    const paymentId = Number(/MOCKPIX(\d+)/.exec(pix.json.mp.qr)![1]);
    const state = async () => (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === order.id);

    // Unsigned, badly signed or stale notices are refused and change nothing.
    expect((await notify(paymentId, {})).status).toBe(401);
    expect((await notify(paymentId, { 'x-signature': 'ts=1,v1=' + '0'.repeat(64), 'x-request-id': 'x' })).status).toBe(401);
    const rid = randomUUID();
    expect((await notify(paymentId, { 'x-signature': sign(String(paymentId), rid, String(Date.now() - 8 * 24 * 3600_000)), 'x-request-id': rid })).status).toBe(401);
    mock.payments.get(paymentId)!.status = 'approved';
    expect((await notify(paymentId, { 'x-signature': sign(String(paymentId + 1), rid), 'x-request-id': rid })).status).toBe(401); // signature of another payment
    // Still pending at Mercado Pago: nothing changes.
    mock.payments.get(paymentId)!.status = 'pending';
    expect((await notify(paymentId)).json.outcome).toBe('pending');
    expect((await state()).status).toBe('confirmado');
    // Exact and approved: paid, once. (Approved payments that do not match are covered below.)
    mock.payments.get(paymentId)!.status = 'approved';
    expect((await notify(paymentId)).json.outcome).toBe('paid');
    const paid = await state();
    expect(paid).toMatchObject({ status: 'pago', charge: { paidBy: 'mercadopago' } });
    expect(paid.history.at(-1).status).toBe('pago');
    expect((await notify(paymentId)).json.outcome).toBe('already');
    expect((await state()).history.length).toBe(paid.history.length);
    expect((await new Client().req(`/api/pay/${token}`)).json.state).toBe('pago');
    expect((await new Client().req(`/api/pay/${token}/pix/check`, { body: {} })).json.state).toBe('pago');
    // Unknown payments and other topics are acknowledged without effect.
    expect((await notify(123)).json.outcome).toBe('ignored');
  });

  it('pays through "Já paguei" when the notice is late, and a new amount needs a new Pix', async () => {
    const a = await admin();
    const order = await chargedOrder(a);
    const token = order.charge.token;
    const pix = await new Client().req(`/api/pay/${token}/pix`, { body: { email: 'cliente@example.com' } });
    const paymentId = Number(/MOCKPIX(\d+)/.exec(pix.json.mp.qr)![1]);
    expect((await new Client().req(`/api/pay/${token}/pix/check`, { body: {} })).json.state).toBe('aguardando');

    // The owner changes the shipping: new charge, new link; the old payment no longer matches.
    const recharged = (await a.req(`/api/admin/orders/${order.id}/charge`, { body: { shippingCents: 2500, discountCents: 0 } })).json.order;
    expect(recharged.charge.token).not.toBe(token);
    expect(recharged.charge.mp).toBeUndefined();
    // The old Pix is cancelled at Mercado Pago so it cannot be paid any more…
    await waitFor(() => (mock.cancels.includes(paymentId) ? true : undefined));
    // …but if the customer had paid it already, the money is kept on the order for the owner to see.
    mock.payments.get(paymentId)!.status = 'approved';
    expect((await notify(paymentId)).json.outcome).toBe('ignored');
    const afterStray = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === order.id);
    expect(afterStray.status).toBe('confirmado');
    expect(afterStray.strayPayments).toEqual([expect.objectContaining({ id: String(paymentId), amountCents: order.charge.amountCents })]);
    expect((await notify(paymentId)).json.outcome).toBe('already');

    const pix2 = await new Client().req(`/api/pay/${recharged.charge.token}/pix`, { body: { email: 'cliente@example.com' } });
    const payment2 = Number(/MOCKPIX(\d+)/.exec(pix2.json.mp.qr)![1]);
    expect(payment2).not.toBe(paymentId);
    mock.payments.get(payment2)!.status = 'approved';
    expect((await new Client().req(`/api/pay/${recharged.charge.token}/pix/check`, { body: {} })).json.state).toBe('pago');
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

describe('stock entries and exits', () => {
  const moveReq = (client: Client, body: unknown, key: string = randomUUID()) => client.req('/api/admin/stock/moves', { body, headers: { 'Idempotency-Key': key } });
  /** A product without stock control whose finishes have no sizes (at least `finishes` of them). */
  async function freeProduct(finishes = 1) {
    const c = await catalog();
    return c.products.find((p: any) => p.variants.length >= finishes && p.variants.every((v: any) => !v.sizes?.length) && !c.stock?.[p.id]);
  }

  it('is admin-only and needs an Idempotency-Key', async () => {
    const product = await freeProduct();
    const body = { kind: 'entrada', motive: 'compra', productId: product.id, variantId: product.variants[0].id, size: '', qty: 1 };
    const anonymous = await moveReq(new Client(), body);
    expect(anonymous.status).toBe(401);
    expect((await new Client().req('/api/admin/stock')).status).toBe(401);
    const a = await admin();
    expect((await a.req('/api/admin/stock/moves', { body })).status).toBe(400);
    expect((await moveReq(a, body, 'short')).status).toBe(400);
    expect((await moveReq(a, body, undefined)).status).toBe(201); // sanity: the admin can
    expect((await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
    expect((await catalog()).stock?.[product.id]).toBeUndefined();
  });

  it('turns stock control on with a first entry, updates the public snapshot and records the motive', async () => {
    const a = await admin();
    const product = await freeProduct(2);
    const [v1, v2] = product.variants;
    const k1 = `${v1.id}|`;
    const versionBefore = (await catalog()).version;

    const first = await moveReq(a, { kind: 'entrada', motive: 'compra', note: '  NF  123 ', productId: product.id, variantId: v1.id, size: '', qty: 3 });
    expect(first.status).toBe(201);
    expect(first.json).toMatchObject({ kind: 'entrada', qty: 3, qtyAfter: 3, trackingStarted: true, note: 'Compra do fornecedor — NF 123' });
    expect(first.json.version).toBeGreaterThan(versionBefore);
    let pub = await catalog();
    expect(pub.version).toBe(first.json.version);
    expect(pub.stock[product.id]).toEqual({ [k1]: 3 }); // the other finish counts as 0 (sold out)

    const second = await moveReq(a, { kind: 'entrada', motive: 'troca', productId: product.id, variantId: v1.id, qty: 2 });
    expect(second.json).toMatchObject({ qtyAfter: 5, trackingStarted: false, note: 'Troca' });
    pub = await catalog();
    expect(pub.stock[product.id][k1]).toBe(5);

    const stock = (await a.req('/api/admin/stock')).json;
    expect(stock.tracked).toContain(product.id);
    expect(stock.levels.filter((l: any) => l.productId === product.id).map((l: any) => [l.variantId, l.qty])).toEqual([[v1.id, 5]]);
    // Newest first; earlier tests may have moved this product before (the history is kept).
    const moves = stock.movements.filter((m: any) => m.productId === product.id).slice(0, 2);
    expect(moves.map((m: any) => [m.reason, m.delta, m.qtyAfter, m.note, m.orderNumber, m.kitId])).toEqual([
      ['entrada', 2, 5, 'Troca', null, null],
      ['entrada', 3, 3, 'Compra do fornecedor — NF 123', null, null],
    ]);
    // No kits yet: nothing with resellers. TODO: cover open kits once the kit API lands.
    expect(stock.inKits).toEqual({});
    expect(stock.kitsByCombo).toEqual({});

    // Wrong finish/size, unknown product, beyond the limit.
    expect((await moveReq(a, { kind: 'entrada', motive: 'compra', productId: product.id, variantId: 'nope', qty: 1 })).status).toBe(400);
    expect((await moveReq(a, { kind: 'entrada', motive: 'compra', productId: product.id, variantId: v2.id, size: '16', qty: 1 })).status).toBe(400);
    expect((await moveReq(a, { kind: 'entrada', motive: 'compra', productId: 'nope', variantId: v1.id, qty: 1 })).status).toBe(404);
    expect((await moveReq(a, { kind: 'entrada', motive: 'perda', productId: product.id, variantId: v1.id, qty: 1 })).status).toBe(400);
    const over = await moveReq(a, { kind: 'entrada', motive: 'compra', productId: product.id, variantId: v1.id, qty: 100_000 });
    expect(over.status).toBe(422);
    expect((await catalog()).stock[product.id][k1]).toBe(5);
    expect((await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
  });

  it('replays a retried move once and refuses the key for another body', async () => {
    const a = await admin();
    const product = await freeProduct();
    const v = product.variants[0];
    const body = { kind: 'entrada', motive: 'outro', productId: product.id, variantId: v.id, qty: 4 };
    const key = randomUUID();
    const lastId = (await a.req('/api/admin/stock')).json.movements[0]?.id ?? 0;
    const first = await moveReq(a, body, key);
    expect(first.status).toBe(201);
    const replay = await moveReq(a, body, key);
    expect(replay.status).toBe(201);
    expect(replay.json).toEqual(first.json);
    expect((await catalog()).stock[product.id][`${v.id}|`]).toBe(4);
    expect((await moveReq(a, { ...body, qty: 5 }, key)).status).toBe(400);
    const moves = (await a.req('/api/admin/stock')).json.movements.filter((m: any) => m.id > lastId);
    expect(moves.map((m: any) => [m.productId, m.reason, m.delta])).toEqual([[product.id, 'entrada', 4]]);
    expect((await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
  });

  it('guards exits: never below zero, never without control, and one winner for the last unit', async () => {
    const a = await admin();
    const product = await freeProduct(2);
    const [v1, v2] = product.variants;
    const exit = (variantId: string, qty: number, key?: string) => moveReq(a, { kind: 'saida', motive: 'perda', productId: product.id, variantId, qty }, key);

    const untracked = await exit(v1.id, 1);
    expect(untracked.status).toBe(409);
    expect(untracked.json.error.message).toMatch(/não tem controle de estoque/);

    expect((await moveReq(a, { kind: 'entrada', motive: 'compra', productId: product.id, variantId: v1.id, qty: 3 })).status).toBe(201);
    const tooMany = await exit(v1.id, 4);
    expect(tooMany.status).toBe(409);
    expect(tooMany.json.error.message).toBe('Só há 3 em estoque.');
    expect(tooMany.json.error.details).toEqual({ available: 3 });
    const none = await exit(v2.id, 1); // tracked product, finish without units
    expect(none.status).toBe(409);
    expect(none.json.error.message).toBe('Não há unidades desta peça em estoque.');

    const gift = await moveReq(a, { kind: 'saida', motive: 'brinde', note: 'sorteio', productId: product.id, variantId: v1.id, qty: 2 });
    expect(gift.status).toBe(201);
    expect(gift.json).toMatchObject({ kind: 'saida', qtyAfter: 1, note: 'Brinde — sorteio', trackingStarted: false });
    expect((await catalog()).stock[product.id][`${v1.id}|`]).toBe(1);

    // Two devices take the last unit at the same time: exactly one wins.
    const both = await Promise.all([exit(v1.id, 1), exit(v1.id, 1)]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(both.find((r) => r.status === 409)!.json.error.message).toBe('Não há unidades desta peça em estoque.');
    expect((await catalog()).stock[product.id][`${v1.id}|`]).toBe(0);

    const stock = (await a.req('/api/admin/stock')).json;
    expect(stock.levels.find((l: any) => l.productId === product.id && l.variantId === v1.id).qty).toBe(0);
    const moves = stock.movements
      .filter((m: any) => m.productId === product.id)
      .slice(0, 3)
      .map((m: any) => [m.reason, m.delta, m.qtyAfter, m.note]);
    expect(moves).toEqual([
      ['saida', -1, 0, 'Perda ou defeito'],
      ['saida', -2, 1, 'Brinde — sorteio'],
      ['entrada', 3, 3, 'Compra do fornecedor'],
    ]);
    expect((await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
  });

  it('saves her own motive with the move, offers it again, and forgets or restores it on request', async () => {
    const a = await admin();
    const product = await freeProduct();
    const v = product.variants[0];
    const motives = async () => (await a.req('/api/admin/stock')).json.motives;
    const setMotive = (client: Client, body: unknown) => client.req('/api/admin/stock-motives', { method: 'PUT', body });
    expect(await motives()).toEqual({ entrada: [], saida: [] });

    const first = await moveReq(a, { kind: 'entrada', motive: 'outro', motiveLabel: '  feira   de artesanato ', note: 'banca 4', productId: product.id, variantId: v.id, qty: 2 });
    expect(first.status).toBe(201);
    expect(first.json.note).toBe('Feira de artesanato — banca 4');
    expect(await motives()).toEqual({ entrada: ['Feira de artesanato'], saida: [] });

    // Same motive in other spelling: kept once with the first spelling; a built-in one typed again is not saved.
    const again = await moveReq(a, { kind: 'entrada', motive: 'outro', motiveLabel: 'FEIRA DE ARTESANATO', productId: product.id, variantId: v.id, qty: 1 });
    expect(again.status).toBe(201);
    const typedBuiltIn = await moveReq(a, { kind: 'entrada', motive: 'outro', motiveLabel: 'troca', productId: product.id, variantId: v.id, qty: 1 });
    expect(typedBuiltIn.json.note).toBe('Troca');
    await moveReq(a, { kind: 'saida', motive: 'outro', motiveLabel: 'Doação', productId: product.id, variantId: v.id, qty: 1 });
    expect(await motives()).toEqual({ entrada: ['Feira de artesanato'], saida: ['Doação'] });

    // A refused move saves nothing; a too-short motive is refused before anything moves.
    expect((await moveReq(a, { kind: 'saida', motive: 'outro', motiveLabel: 'Sumiu na mudança', productId: product.id, variantId: v.id, qty: 999 })).status).toBe(409);
    expect((await moveReq(a, { kind: 'entrada', motive: 'outro', motiveLabel: 'x', productId: product.id, variantId: v.id, qty: 1 })).status).toBe(400);
    expect((await motives()).saida).toEqual(['Doação']);

    // Forget (idempotent), then "Desfazer" brings it back. Admin-only, same-origin.
    expect((await setMotive(new Client(), { kind: 'entrada', label: 'Feira de artesanato', saved: false })).status).toBe(401);
    expect((await a.req('/api/admin/stock-motives', { method: 'PUT', body: { kind: 'entrada', label: 'Feira de artesanato', saved: false }, origin: 'https://evil.example' })).status).toBe(403);
    const forgot = await setMotive(a, { kind: 'entrada', label: 'feira de ARTESANATO', saved: false });
    expect(forgot.status).toBe(200);
    expect(forgot.json.motives).toEqual({ entrada: [], saida: ['Doação'] });
    expect((await setMotive(a, { kind: 'entrada', label: 'Feira de artesanato', saved: false })).json.motives.entrada).toEqual([]);
    expect((await setMotive(a, { kind: 'entrada', label: 'Feira de artesanato', saved: true })).json.motives.entrada).toEqual(['Feira de artesanato']);
    expect((await setMotive(a, { kind: 'entrada', label: 'Compra do fornecedor', saved: true })).status).toBe(400);
    expect((await setMotive(a, { kind: 'ajuste', label: 'Feira', saved: true })).status).toBe(400);
    // The history keeps the text of moves already made.
    expect((await a.req('/api/admin/stock')).json.movements.some((m: any) => m.note === 'Feira de artesanato — banca 4')).toBe(true);

    // At most 12 per kind: the least recently used one leaves.
    for (let i = 1; i <= 12; i++) expect((await setMotive(a, { kind: 'saida', label: `Motivo ${String(i).padStart(2, '0')}`, saved: true })).status).toBe(200);
    const saida = (await motives()).saida;
    expect(saida).toHaveLength(12);
    expect(saida).not.toContain('Doação');
    for (const label of [...saida, 'Feira de artesanato']) await setMotive(a, { kind: label.startsWith('Motivo') ? 'saida' : 'entrada', label, saved: false });
    expect(await motives()).toEqual({ entrada: [], saida: [] });
    expect((await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
  });
});

describe('customers', () => {
  const phone = () => `659${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const create = (client: Client, body: unknown, key = randomUUID()) => client.req('/api/admin/customers', { body, headers: { 'Idempotency-Key': key } });
  async function plain() {
    const c = await catalog();
    return c.products.find((p: any) => p.available && p.variants.length && p.variants.every((v: any) => v.available && !v.sizes?.length) && !c.stock?.[p.id]);
  }
  const price = (p: any) => p.promoPrice ?? p.price;

  it('is admin-only', async () => {
    const anon = new Client();
    expect((await anon.req('/api/admin/customers')).status).toBe(401);
    expect((await create(anon, { name: 'Ana', whatsapp: '' })).status).toBe(401);
    expect((await anon.req('/api/admin/customers/cus_x')).status).toBe(401);
    expect((await anon.req('/api/admin/customers/cus_x', { method: 'PUT', body: { name: 'Ana', whatsapp: '', updatedAt: 'x' } })).status).toBe(401);
    expect((await anon.req('/api/admin/customers/cus_x', { method: 'DELETE' })).status).toBe(401);
    expect((await anon.req('/api/admin/orders/ord_x/customer', { body: { customerId: null } })).status).toBe(401);
  });

  it('creates idempotently, lists newest first and refuses a WhatsApp that is taken', async () => {
    const a = await admin();
    const whatsapp = phone();
    const body = { name: '  Ana   Júlia ', whatsapp: `(${whatsapp.slice(0, 2)}) ${whatsapp.slice(2, 7)}-${whatsapp.slice(7)}`, city: 'Várzea Grande', uf: 'mt', instagram: '@ana.joias', birthday: '25/03', note: 'Gosta de argolas' };
    const key = randomUUID();
    const first = await create(a, body, key);
    expect(first.status).toBe(201);
    expect(first.json.customer).toMatchObject({ name: 'Ana Júlia', whatsapp, city: 'Várzea Grande', uf: 'MT', instagram: 'ana.joias', birthday: '25/03', note: 'Gosta de argolas', stats: { orders: 0, purchases: 0, spentCents: 0, lastPurchaseAt: null } });
    expect(first.json.customer.id).toMatch(/^cus_/);
    // A retry (double tap) answers the same customer; the key cannot carry another body.
    const replay = await create(a, body, key);
    expect(replay.status).toBe(201);
    expect(replay.json.customer.id).toBe(first.json.customer.id);
    expect((await create(a, { ...body, name: 'Outra' }, key)).status).toBe(400);

    const dup = await create(a, { name: 'Ana Outra', whatsapp });
    expect(dup.status).toBe(409);
    expect(dup.json.error.message).toBe('Já existe uma cliente com este WhatsApp: Ana Júlia.');
    expect(dup.json.error.details.customer.id).toBe(first.json.customer.id);

    // Without a WhatsApp, any number of customers.
    const noPhone1 = await create(a, { name: 'Bia Sem Número', whatsapp: '' });
    const noPhone2 = await create(a, { name: 'Bia Sem Número', whatsapp: '' });
    expect([noPhone1.status, noPhone2.status]).toEqual([201, 201]);

    expect((await create(a, { name: 'A', whatsapp: '' })).json.error.message).toBe('Informe o nome da cliente.');
    expect((await create(a, { name: 'Ana', whatsapp: '6599' })).status).toBe(400);
    expect((await create(a, { name: 'Ana', whatsapp: '', birthday: '31/02' })).status).toBe(400);
    expect((await a.req('/api/admin/customers', { body: { name: 'Ana', whatsapp: '' } })).status).toBe(400); // no key

    const list = (await a.req('/api/admin/customers')).json.customers;
    expect(list[0].id).toBe(noPhone2.json.customer.id);
    expect(list.find((c: any) => c.id === first.json.customer.id)).toMatchObject({ name: 'Ana Júlia', stats: { purchases: 0 } });
    // Personal data never reaches the public catalog.
    expect(JSON.stringify(await catalog())).not.toContain(whatsapp);
  });

  it('edits with compare-and-swap and keeps the WhatsApp unique', async () => {
    const a = await admin();
    const one = (await create(a, { name: 'Carla Edição', whatsapp: phone(), city: 'Cuiabá' })).json.customer;
    const other = (await create(a, { name: 'Dora Edição', whatsapp: phone() })).json.customer;
    const put = (body: unknown) => a.req(`/api/admin/customers/${one.id}`, { method: 'PUT', body });

    const edited = await put({ name: 'Carla Souza', whatsapp: one.whatsapp, city: 'Cuiabá', uf: 'MT', updatedAt: one.updatedAt });
    expect(edited.status).toBe(200);
    expect(edited.json.customer).toMatchObject({ name: 'Carla Souza', uf: 'MT', createdAt: one.createdAt });
    expect(edited.json.customer.updatedAt).not.toBe(one.updatedAt);
    // The same save again (its answer was lost) is harmless.
    expect((await put({ name: 'Carla Souza', whatsapp: one.whatsapp, city: 'Cuiabá', uf: 'MT', updatedAt: one.updatedAt })).status).toBe(200);
    // Another change from the old version is refused, with what is stored now.
    const stale = await put({ name: 'Carla Antiga', whatsapp: one.whatsapp, city: 'Cuiabá', updatedAt: one.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.json.error.details.customer).toMatchObject({ name: 'Carla Souza', updatedAt: edited.json.customer.updatedAt });
    // Taking another customer's WhatsApp is refused.
    const taken = await put({ name: 'Carla Souza', whatsapp: other.whatsapp, updatedAt: edited.json.customer.updatedAt });
    expect(taken.status).toBe(409);
    expect(taken.json.error.message).toBe('Já existe uma cliente com este WhatsApp: Dora Edição.');
    expect((await a.req('/api/admin/customers/cus_nao_existe', { method: 'PUT', body: { name: 'X Y', whatsapp: '', updatedAt: 'x' } })).status).toBe(404);
  });

  it('registers a manual order for a customer (name and city from her record) and counts her purchases', async () => {
    const a = await admin();
    const p = await plain();
    const v = p.variants[0];
    const elisa = (await create(a, { name: 'Elisa Compra', whatsapp: phone(), city: 'Chapada dos Guimarães', uf: 'MT' })).json.customer;
    const manual = (body: unknown) => a.req('/api/admin/orders', { body, headers: { 'Idempotency-Key': randomUUID() } });

    const sold = await manual({ items: [{ productId: p.id, variantId: v.id, qty: 2 }], name: 'Outro Nome', city: 'Outra', status: 'confirmado', customerId: elisa.id });
    expect(sold.status).toBe(201);
    expect(sold.json.order).toMatchObject({ customerId: elisa.id, customer: { name: 'Elisa Compra', city: 'Chapada dos Guimarães' }, status: 'confirmado' });
    const negotiating = await manual({ items: [{ productId: p.id, variantId: v.id, qty: 1 }], name: 'Elisa Compra', status: 'enviado', customerId: elisa.id });
    expect(negotiating.status).toBe(201);
    const listed = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === sold.json.order.id);
    expect(listed.customerId).toBe(elisa.id);

    const gone = await manual({ items: [{ productId: p.id, variantId: v.id, qty: 1 }], name: 'Ninguém', status: 'enviado', customerId: 'cus_nao_existe' });
    expect(gone.status).toBe(409);
    expect(gone.json.error.message).toContain('não está mais cadastrada');

    const detail = await a.req(`/api/admin/customers/${elisa.id}`);
    expect(detail.status).toBe(200);
    // Only the confirmed order is a purchase; both are her orders (newest first).
    expect(detail.json.customer.stats).toMatchObject({ orders: 2, purchases: 1, spentCents: price(p) * 2, lastPurchaseAt: sold.json.order.createdAt });
    expect(detail.json.orders.map((o: any) => o.id)).toEqual([negotiating.json.order.id, sold.json.order.id]);
    const inList = (await a.req('/api/admin/customers')).json.customers.find((c: any) => c.id === elisa.id);
    expect(inList.stats).toEqual(detail.json.customer.stats);
  });

  it('links and unlinks a site order (compare-and-swap, idempotent)', async () => {
    const a = await admin();
    const p = await plain();
    const placed = await new Client().req('/api/orders', { body: { items: [{ productId: p.id, variantId: p.variants[0].id, qty: 1 }], name: 'Fabi do Site', city: 'Corumbá' }, headers: { 'Idempotency-Key': randomUUID() } });
    expect(placed.status).toBe(201);
    const id = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.number === placed.json.order.number).id;
    const fabi = (await create(a, { name: 'Fabiana', whatsapp: phone(), city: 'Corumbá' })).json.customer;
    const link = (customerId: string | null) => a.req(`/api/admin/orders/${id}/customer`, { body: { customerId } });

    expect((await link('cus_nao_existe')).status).toBe(404);
    expect((await a.req(`/api/admin/orders/${id}/customer`, { body: { customerId: 'não vale' } })).status).toBe(400);
    const linked = await link(fabi.id);
    expect(linked.status).toBe(200);
    // The order keeps the name and city the customer typed.
    expect(linked.json.order).toMatchObject({ customerId: fabi.id, customer: { name: 'Fabi do Site', city: 'Corumbá' } });
    expect((await link(fabi.id)).json.order.updatedAt).toBe(linked.json.order.updatedAt); // a retry changes nothing
    expect((await a.req(`/api/admin/customers/${fabi.id}`)).json.orders.map((o: any) => o.id)).toEqual([id]);

    // A status change after the link keeps it (the order JSON and the column agree).
    expect((await a.req(`/api/admin/orders/${id}/status`, { body: { from: 'enviado', to: 'confirmado' } })).status).toBe(200);
    expect((await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === id).customerId).toBe(fabi.id);

    const unlinked = await link(null);
    expect(unlinked.status).toBe(200);
    expect(unlinked.json.order).not.toHaveProperty('customerId');
    expect((await a.req(`/api/admin/customers/${fabi.id}`)).json.orders).toEqual([]);
    expect((await a.req('/api/admin/orders/ord_nao_existe/customer', { body: { customerId: null } })).status).toBe(404);
  });

  it('erases a customer and unlinks her orders in the same batch (LGPD), idempotently', async () => {
    const a = await admin();
    const p = await plain();
    const gabi = (await create(a, { name: 'Gabi Apagar', whatsapp: phone(), city: 'Aquidauana' })).json.customer;
    const order = (await a.req('/api/admin/orders', { body: { items: [{ productId: p.id, variantId: p.variants[0].id, qty: 1 }], name: 'Gabi Apagar', status: 'enviado', customerId: gabi.id }, headers: { 'Idempotency-Key': randomUUID() } })).json.order;
    expect(order.customerId).toBe(gabi.id);

    const del = await a.req(`/api/admin/customers/${gabi.id}`, { method: 'DELETE' });
    expect(del.json).toEqual({ deleted: true, unlinked: 1 });
    expect((await a.req(`/api/admin/customers/${gabi.id}`)).status).toBe(404);
    expect((await a.req('/api/admin/customers')).json.customers.some((c: any) => c.id === gabi.id)).toBe(false);
    const kept = (await a.req('/api/admin/orders')).json.orders.find((o: any) => o.id === order.id);
    expect(kept).toMatchObject({ customer: { name: 'Gabi Apagar', city: 'Aquidauana' } });
    expect(kept).not.toHaveProperty('customerId');
    expect(kept.updatedAt).not.toBe(order.updatedAt);
    // Later writes to the order do not bring the link back.
    expect((await a.req(`/api/admin/orders/${order.id}/status`, { body: { from: 'enviado', to: 'cancelado' } })).json.order).not.toHaveProperty('customerId');
    expect((await a.req(`/api/admin/customers/${gabi.id}`, { method: 'DELETE' })).json).toEqual({ deleted: false, unlinked: 0 });
    // Her WhatsApp is free again.
    expect((await create(a, { name: 'Gabi Nova', whatsapp: gabi.whatsapp })).status).toBe(201);
  });
});