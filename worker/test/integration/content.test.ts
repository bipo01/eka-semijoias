/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are asserted field by field in these tests. */
import { randomUUID } from 'node:crypto';
import { defaultSections, type ContentFacts } from '../../../src/content/defaults';

/*
 * Site content sections (docs/conteudo/PLAN.md): saved per section through the
 * catalog change sets, published in the snapshot, conflict-checked per section,
 * untouched by settings saves (an old admin) and by stock writes, restorable to
 * the built-in text, with images checked on the server.
 */

const BASE = () => process.env.INTEGRATION_URL!;
const ip = () => `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

class Client {
  cookies = new Map<string, string>();
  constructor(public addr = ip()) {}
  async req(path: string, init: { method?: string; body?: unknown; raw?: Uint8Array; type?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { 'CF-Connecting-IP': this.addr, ...init.headers };
    const method = init.method ?? (init.body !== undefined || init.raw !== undefined ? 'POST' : 'GET');
    if (method !== 'GET') headers.Origin = BASE();
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.type) headers['Content-Type'] = init.type;
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE() + path, { method, headers, body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined) });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
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
    return { status: res.status, json, text };
  }
}

let device: string | undefined;
async function admin(): Promise<Client> {
  const c = new Client();
  if (device) c.cookies.set('eka_device', device);
  // The PIN may have been changed by api.test.ts (same server): try both.
  for (const pin of ['314159', '58302917']) {
    const r = await c.req('/api/admin/login', { body: { pin } });
    if (r.status === 200) {
      device = c.cookies.get('eka_device') ?? device;
      return c;
    }
  }
  throw new Error('admin login failed');
}

const catalog = async () => (await (await fetch(`${BASE()}/api/catalog`, { headers: { 'Cache-Control': 'no-cache' } })).json()) as any;
const facts: ContentFacts = { warrantyMonths: 6, whatsapp: null, shipsNationwide: true, hypoallergenic: null, installments: null, plating: null, consignment: null, noUpfrontInvestment: null };
const defaults = defaultSections(facts);
const send = (a: Client, baseVersion: number, changes: unknown[]) => a.req('/api/admin/changes', { body: { baseVersion, changes }, headers: { 'Idempotency-Key': randomUUID() } });
const upsert = (id: string, data: unknown) => ({ kind: 'content', op: 'upsert', id, data });
const restore = (id: string) => ({ kind: 'content', op: 'delete', id });

function webpBytes(seed: string): Uint8Array {
  const body = new TextEncoder().encode(`VP8 ${seed}`);
  const out = new Uint8Array(12 + body.length);
  out.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(new TextEncoder().encode('WEBP'), 8);
  out.set(body, 12);
  return out;
}

describe('site content', () => {
  afterAll(async () => {
    // Leave the shared database with the built-in texts.
    const a = await admin();
    const c = await catalog();
    const ids = Object.keys(c.content ?? {});
    if (ids.length) await send(a, c.version, ids.map(restore));
  });

  it('publishes a saved section in the snapshot, trimmed, and restores the built-in text', async () => {
    const a = await admin();
    const before = await catalog();
    expect(before.content ?? {}).not.toHaveProperty('geral');
    const saved = await send(a, before.version, [upsert('geral', { ...defaults.geral, footerTagline: '  Brilho todo dia.  ', updatedAt: new Date().toISOString() })]);
    expect(saved.status).toBe(200);
    const after = await catalog();
    expect(after.version).toBe(saved.json.version);
    expect(after.content.geral.footerTagline).toBe('Brilho todo dia.');

    const back = await send(a, after.version, [restore('geral')]);
    expect(back.status).toBe(200);
    expect((await catalog()).content).not.toHaveProperty('geral');
    // Restoring again changes nothing.
    expect((await send(a, back.json.version, [restore('geral')])).json.applied).toBe(0);
  });

  it('checks conflicts per section: another device editing the same section is caught, a different section is not', async () => {
    const a = await admin();
    const b = await admin();
    const base = (await catalog()).version;
    expect((await send(a, base, [upsert('contato', { ...defaults.contato, quickTitle: 'Escreva aqui' })])).status).toBe(200);
    const stale = await send(b, base, [upsert('contato', { ...defaults.contato, quickTitle: 'Outro título' })]);
    expect(stale.status).toBe(409);
    expect(stale.json.error.message).toContain('Contato');
    // Same data as stored: not a conflict (a retry of the same save).
    expect((await send(b, base, [upsert('contato', { ...defaults.contato, quickTitle: 'Escreva aqui' })])).status).toBe(200);
    // Another section from the same stale base: fine.
    expect((await send(b, base, [upsert('cuidados', defaults.cuidados)])).status).toBe(200);

    // A restore on one device, then a stale save from the other: caught.
    const v = (await catalog()).version;
    expect((await send(a, v, [restore('cuidados')])).status).toBe(200);
    expect((await send(b, v, [upsert('cuidados', { ...defaults.cuidados, why: { title: 'Outro', text: '' } })])).status).toBe(409);
  });

  it('survives an old admin saving the settings and a stock write rewriting the snapshot', async () => {
    const a = await admin();
    let c = await catalog();
    const saved = await send(a, c.version, [upsert('sobre', { ...defaults.sobre, signature: 'Érika, com carinho' })]);
    expect(saved.status).toBe(200);

    // An admin from before this phase sends the whole settings object (no content).
    c = await catalog();
    expect((await send(a, c.version, [{ kind: 'settings', op: 'upsert', data: { ...c.settings, announcement: `Aviso ${randomUUID().slice(0, 4)}` } }])).status).toBe(200);
    expect((await catalog()).content.sobre.signature).toBe('Érika, com carinho');

    // Stock writes rebuild the snapshot from its parsed copy.
    c = await catalog();
    const product = c.products.find((p: any) => !c.stock?.[p.id] && p.variants.every((v: any) => !v.sizes?.length));
    const on = await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: true, levels: [{ variantId: product.variants[0].id, size: '', qty: 2, expected: null }] } });
    expect(on.status).toBe(200);
    expect((await catalog()).content.sobre.signature).toBe('Érika, com carinho');
    expect((await a.req(`/api/admin/stock/${product.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
    expect((await catalog()).content.sobre.signature).toBe('Érika, com carinho');
  });

  it('accepts uploaded photos, refuses missing ones and data URLs', async () => {
    const a = await admin();
    const up = await a.req('/api/admin/media', { raw: webpBytes(`hero-${randomUUID()}`), type: 'image/webp' });
    expect(up.status).toBe(201);
    const hero = (src: string) => upsert('inicio', { ...defaults.inicio, hero: { ...defaults.inicio.hero, slides: [{ id: 's1', alt: 'Colar no colo', image: { src, alt: 'Colar no colo' }, frames: {} }] } });
    let c = await catalog();
    const missing = await send(a, c.version, [hero(`media/${'b'.repeat(64)}.webp`)]);
    expect(missing.status).toBe(422);
    expect(missing.json.error.code).toBe('integrity');
    const dataUrl = await send(a, c.version, [hero('data:image/webp;base64,AAAA')]);
    expect(dataUrl.status).toBe(400);
    const ok = await send(a, c.version, [hero(up.json.key)]);
    expect(ok.status).toBe(200);
    c = await catalog();
    expect(c.content.inicio.hero.slides).toEqual([{ id: 's1', alt: 'Colar no colo', image: { src: up.json.key, alt: 'Colar no colo' }, frames: {} }]);
  });

  it('checks the photo of every hero screen and publishes the framing', async () => {
    const a = await admin();
    const main = await a.req('/api/admin/media', { raw: webpBytes(`hero-main-${randomUUID()}`), type: 'image/webp' });
    const phone = await a.req('/api/admin/media', { raw: webpBytes(`hero-phone-${randomUUID()}`), type: 'image/webp' });
    expect([main.status, phone.status]).toEqual([201, 201]);
    const slides = (phoneSrc: string) => [
      { id: 's1', alt: 'Anel na mão', image: { src: main.json.key, alt: 'Anel na mão' }, frames: { celular: { image: { src: phoneSrc, alt: '' }, x: 35, y: 30, zoom: 1.4 }, amplo: { x: 80, y: 50, zoom: 1 } } },
      ...defaults.inicio.hero.slides.slice(0, 2),
    ];
    const inicio = (phoneSrc: string) => upsert('inicio', { ...defaults.inicio, hero: { ...defaults.inicio.hero, slides: slides(phoneSrc), interval: 8 } });
    let c = await catalog();
    // A photo only for the phone screen is checked like any other.
    const missing = await send(a, c.version, [inicio(`media/${'d'.repeat(64)}.webp`)]);
    expect(missing.status).toBe(422);
    expect(missing.json.error.code).toBe('integrity');
    expect((await send(a, c.version, [inicio('data:image/webp;base64,AAAA')])).status).toBe(400);
    // Out of range framing never reaches the database.
    const bad = upsert('inicio', { ...defaults.inicio, hero: { ...defaults.inicio.hero, slides: [{ ...slides(phone.json.key)[0], frames: { tablet: { x: 120, y: 50, zoom: 1 } } }] } });
    expect((await send(a, c.version, [bad])).status).toBe(400);
    const ok = await send(a, c.version, [inicio(phone.json.key)]);
    expect(ok.status).toBe(200);
    c = await catalog();
    expect(c.content.inicio.hero.interval).toBe(8);
    expect(c.content.inicio.hero.slides[0].frames).toEqual({ celular: { image: { src: phone.json.key, alt: '' }, x: 35, y: 30, zoom: 1.4 }, amplo: { x: 80, y: 50, zoom: 1 } });
    expect(c.content.inicio.hero.slides.map((s: { id: string }) => s.id)).toEqual(['s1', 'colo', 'mao']);
    // The uploaded photos are served.
    for (const key of [main.json.key, phone.json.key]) expect((await fetch(`${BASE()}/${key}`)).status).toBe(200);
  });

  it('refuses unknown sections and invalid fields with the field message', async () => {
    const a = await admin();
    const c = await catalog();
    expect((await send(a, c.version, [upsert('banner', {})])).status).toBe(400);
    const empty = await send(a, c.version, [upsert('geral', { ...defaults.geral, bagEmptyTitle: '   ' })]);
    expect(empty.status).toBe(400);
    expect(empty.json.error.message).toContain('Preencha este campo.');
    const fake = await send(a, c.version, [upsert('depoimentos', { items: [{ id: 't1', text: 'Amei', name: 'Ana', city: '', authorized: false }] })]);
    expect(fake.status).toBe(400);
    // Not signed in: no writes.
    expect((await send(new Client(), c.version, [upsert('geral', defaults.geral)])).status).toBe(401);
  });

  it('an old admin saving settings without the message templates does not erase them; clearing them is explicit', async () => {
    const a = await admin();
    let c = await catalog();
    const messages = { active: { contato: 'contato.curta' }, edited: {}, custom: [] };
    expect((await send(a, c.version, [{ kind: 'settings', op: 'upsert', data: { ...c.settings, messages } }])).status).toBe(200);
    c = await catalog();
    const { messages: _dropped, ...withoutMessages } = c.settings;
    expect((await send(a, c.version, [{ kind: 'settings', op: 'upsert', data: { ...withoutMessages, announcement: `Aviso ${randomUUID().slice(0, 4)}` } }])).status).toBe(200);
    c = await catalog();
    expect(c.settings.messages).toEqual(messages);
    const empty = { active: {}, edited: {}, custom: [] };
    expect((await send(a, c.version, [{ kind: 'settings', op: 'upsert', data: { ...c.settings, messages: empty } }])).status).toBe(200);
    expect((await catalog()).settings.messages).toEqual(empty);
  });
});
