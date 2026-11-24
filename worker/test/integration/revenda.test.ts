/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are asserted field by field in these tests. */
import { randomUUID } from 'node:crypto';

/*
 * Reseller program end to end (docs/revenda/PLAN.md): application review,
 * effectivation, invite (contract + PIN), login, kit with stock, sales
 * (incl. the last unit raced), settlement, showcase, and isolation between
 * resellers. Runs against the same local Worker as api.test.ts.
 */

const BASE = () => process.env.INTEGRATION_URL!;
const ip = () => `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

class Client {
  cookies = new Map<string, string>();
  constructor(public addr = ip()) {}
  async req(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { 'CF-Connecting-IP': this.addr, ...init.headers };
    const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
    if (method !== 'GET') headers.Origin = BASE();
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE() + path, { method, headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
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
    return { status: res.status, json, headers: res.headers };
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

async function catalog() {
  return (await (await fetch(`${BASE()}/api/catalog`)).json()) as any;
}

const phoneOf = () => `659${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

async function newReseller(a: Client, name = `Ana Teste ${randomUUID().slice(0, 4)}`) {
  const whatsapp = phoneOf();
  const created = await a.req('/api/admin/resellers', { body: { name, whatsapp, city: 'Várzea Grande', uf: 'MT' }, headers: { 'Idempotency-Key': randomUUID() } });
  expect(created.status).toBe(201);
  return { reseller: created.json.reseller, token: created.json.invite.token as string, whatsapp };
}

async function activate(token: string, pin = '402817') {
  const r = new Client();
  const view = await r.req(`/api/revenda/invite/${token}`);
  expect(view.status).toBe(200);
  const accept = await r.req(`/api/revenda/invite/${token}`, { body: { pin, contract: { version: view.json.contract.version, typedName: view.json.name } } });
  expect(accept.status).toBe(200);
  return r;
}

async function plainProducts(n: number) {
  const c = await catalog();
  return c.products.filter((p: any) => p.available && p.variants.every((v: any) => v.available && !v.sizes?.length) && !c.stock?.[p.id]).slice(0, n);
}

describe('reseller program', () => {
  it('reviews an application, effectivates it, and the reseller accepts the contract and sets her PIN once', async () => {
    const a = await admin();
    const lead = await new Client().req('/api/leads', {
      body: { name: 'Bruna Revenda Silva', whatsapp: '(65) 98888-7766', city: 'Cuiabá', uf: 'MT', instagram: '', alreadySells: true, source: '', consent: true },
    });
    expect(lead.status).toBe(201);
    expect((await a.req(`/api/admin/leads/${lead.json.id}`, { method: 'PATCH', body: { status: 'aprovada', note: 'ótimo perfil' } })).json.lead).toMatchObject({ status: 'aprovada', note: 'ótimo perfil' });
    const listed = (await a.req('/api/admin/leads')).json.leads.find((l: any) => l.id === lead.json.id);
    expect(listed.status).toBe('aprovada');

    const whatsapp = phoneOf();
    const body = { leadId: lead.json.id, name: 'Bruna Revenda Silva', whatsapp, city: 'Cuiabá', uf: 'MT' };
    const key = randomUUID();
    const created = await a.req('/api/admin/resellers', { body, headers: { 'Idempotency-Key': key } });
    expect(created.status).toBe(201);
    expect(created.json.reseller).toMatchObject({ status: 'ativa', hasPin: false, slug: expect.stringMatching(/^bruna/) });
    expect(created.json.invite.token).toMatch(/^[\w-]{43}$/);
    // A retry returns the same reseller (without the access link, which is never stored); the application cannot be effectivated twice.
    const replay = await a.req('/api/admin/resellers', { body, headers: { 'Idempotency-Key': key } });
    expect(replay.json.reseller.id).toBe(created.json.reseller.id);
    expect(replay.json.invite).toBeNull();
    expect((await a.req('/api/admin/resellers', { body: { ...body, whatsapp: phoneOf() }, headers: { 'Idempotency-Key': randomUUID() } })).status).toBe(409);
    expect((await a.req('/api/admin/resellers', { body: { ...body, leadId: undefined }, headers: { 'Idempotency-Key': randomUUID() } })).json.error.message).toContain('Já existe uma revendedora com este WhatsApp');
    expect((await a.req('/api/admin/leads')).json.leads.find((l: any) => l.id === lead.json.id).status).toBe('efetivada');

    const token = created.json.invite.token;
    const r = new Client();
    const view = await r.req(`/api/revenda/invite/${token}`);
    expect(view.json).toMatchObject({ firstName: 'Bruna', hasPin: false, contract: { mode: 'aceite', version: 1 } });
    expect(view.json.contract.text).toContain('CONSIGNAÇÃO');
    // Weak PIN, wrong name and outdated version are refused.
    expect((await r.req(`/api/revenda/invite/${token}`, { body: { pin: '123456', contract: { version: 1, typedName: 'Bruna Revenda Silva' } } })).status).toBe(400);
    expect((await r.req(`/api/revenda/invite/${token}`, { body: { pin: '402817', contract: { version: 1, typedName: 'Outra' } } })).status).toBe(400);
    expect((await r.req(`/api/revenda/invite/${token}`, { body: { pin: '402817', contract: { version: 9, typedName: 'Bruna Revenda Silva' } } })).status).toBe(409);
    // Two submissions at once: exactly one sets the PIN.
    const both = await Promise.all([r, new Client()].map((c) => c.req(`/api/revenda/invite/${token}`, { body: { pin: '402817', contract: { version: 1, typedName: 'Bruna Revenda Silva' } } })));
    expect(both.map((x) => x.status).sort()).toEqual([200, 404]);
    const ok = both.find((x) => x.status === 200)!;
    expect(ok.status).toBe(200);
    if (!r.cookies.size) {
      // The other client won the race: log in to continue as her.
      expect((await r.req('/api/revenda/login', { body: { whatsapp, pin: '402817' } })).status).toBe(200);
    }
    expect((await r.req('/api/revenda/me')).json.reseller).toMatchObject({ firstName: 'Bruna', contract: { version: 1, mode: 'aceite' } });
    // The link works once.
    expect((await new Client().req(`/api/revenda/invite/${token}`)).status).toBe(404);

    const detail = (await a.req(`/api/admin/resellers/${created.json.reseller.id}`)).json;
    expect(detail.reseller.hasPin).toBe(true);
    expect(detail.acceptances[0]).toMatchObject({ version: 1, typedName: 'Bruna Revenda Silva', mode: 'aceite' });
    expect(detail.acceptances[0].textSha256).toMatch(/^[0-9a-f]{64}$/);

    // Login: right PIN works, wrong PIN is refused and throttled per network.
    const login = new Client();
    expect((await login.req('/api/revenda/login', { body: { whatsapp: `(${whatsapp.slice(0, 2)}) ${whatsapp.slice(2)}`, pin: '402817' } })).status).toBe(200);
    expect((await login.req('/api/revenda/me')).status).toBe(200);
    const bad = new Client();
    for (let i = 0; i < 5; i++) expect((await bad.req('/api/revenda/login', { body: { whatsapp, pin: '999999' } })).status).toBe(401);
    expect((await bad.req('/api/revenda/login', { body: { whatsapp, pin: '402817' } })).status).toBe(429);

    // Pausing ends her sessions.
    const pause = await a.req(`/api/admin/resellers/${created.json.reseller.id}`, { method: 'PATCH', body: { updatedAt: detail.reseller.updatedAt, status: 'pausada' } });
    expect(pause.status).toBe(200);
    expect((await login.req('/api/revenda/me')).status).toBe(401);
    expect((await new Client().req('/api/revenda/login', { body: { whatsapp, pin: '402817' } })).status).toBe(401);
  });

  it('opens a kit that takes stock, sells from it without overselling, settles and gives the rest back', async () => {
    const a = await admin();
    const [p1, p2] = await plainProducts(2);
    const v1 = p1.variants[0];
    const v2 = p2.variants[0];
    expect((await a.req(`/api/admin/stock/${p1.id}`, { method: 'PUT', body: { tracked: true, levels: [{ variantId: v1.id, size: '', qty: 3, expected: null }] } })).status).toBe(200);
    const { reseller, token } = await newReseller(a, 'Carla Maleta Souza');
    const r = await activate(token);

    // More than the stock: refused, nothing moves.
    expect((await a.req(`/api/admin/resellers/${reseller.id}/kits`, { body: { items: [{ productId: p1.id, variantId: v1.id, qty: 4 }] } })).status).toBe(409);
    const opened = await a.req(`/api/admin/resellers/${reseller.id}/kits`, { body: { items: [{ productId: p1.id, variantId: v1.id, qty: 2 }, { productId: p2.id, variantId: v2.id, qty: 1 }] } });
    expect(opened.status).toBe(201);
    expect(opened.json.kit).toMatchObject({ status: 'aberta', stockMoves: [{ productId: p1.id, qty: 2 }], tiers: [{ percent: 25 }, { percent: 30 }, { percent: 35 }] });
    expect((await catalog()).stock[p1.id][`${v1.id}|`]).toBe(1);
    expect((await a.req(`/api/admin/resellers/${reseller.id}/kits`, { body: { items: [{ productId: p2.id, variantId: v2.id, qty: 1 }] } })).status).toBe(409); // one open kit

    const me = (await r.req('/api/revenda/me')).json;
    expect(me.kit.valueCents).toBe(2 * (p1.promoPrice ?? p1.price) + (p2.promoPrice ?? p2.price));
    expect(me.kit.lines.map((l: any) => [l.productId, l.available])).toEqual([
      [p1.id, 2],
      [p2.id, 1],
    ]);

    // Showcase: public, available pieces, first name + WhatsApp only.
    const show = await new Client().req(`/api/r/${reseller.slug}`);
    expect(show.json).toMatchObject({ firstName: 'Carla', active: true });
    expect(show.json.items).toHaveLength(2);
    expect(JSON.stringify(show.json)).not.toContain('Souza');

    const sell = (lines: any[], key = randomUUID()) => r.req('/api/revenda/sales', { body: { lines, payment: 'pix', customer: { name: 'Cliente da Carla', whatsapp: '(65) 97777-1111' } }, headers: { 'Idempotency-Key': key } });
    const line1 = (qty: number, unit = p1.promoPrice ?? p1.price) => ({ productId: p1.id, variantId: v1.id, size: '', qty, unitCents: unit });
    // The last unit of p2 raced by two sales: exactly one wins.
    const race = await Promise.all([1, 2].map(() => sell([{ productId: p2.id, variantId: v2.id, size: '', qty: 1, unitCents: p2.promoPrice ?? p2.price }])));
    expect(race.map((x) => x.status).sort()).toEqual([201, 409]);
    const s1 = await sell([line1(1, (p1.promoPrice ?? p1.price) - 1000)]); // with a discount
    expect(s1.status).toBe(201);
    expect((await sell([line1(2)])).json.error.message).toContain('resta 1 unidade');
    // The sale does not touch the central stock (the pieces left it with the kit).
    expect((await catalog()).stock[p1.id][`${v1.id}|`]).toBe(1);
    // Undo within 24 h.
    expect((await r.req(`/api/revenda/sales/${s1.json.sale.id}/cancel`, { body: {} })).json.sale.status).toBe('cancelada');
    const s2 = await sell([line1(1)]);
    expect(s2.status).toBe(201);

    // The stock page counts the pieces with her: 2 in the kit, 1 sold → 1 of p1; p2 sold out.
    const stockView = (await a.req('/api/admin/stock')).json;
    expect(stockView.inKits[`${p1.id}|${v1.id}|`]).toBe(1);
    expect(stockView.inKits[`${p2.id}|${v2.id}|`] ?? 0).toBe(0);
    expect(stockView.kitsByCombo[`${p1.id}|${v1.id}|`]).toEqual([expect.objectContaining({ resellerName: 'Carla', qty: 1 })]);
    const me2 = (await r.req('/api/revenda/me')).json;
    const sold = (p2.promoPrice ?? p2.price) + (p1.promoPrice ?? p1.price);
    expect(me2.soldCents).toBe(sold);
    expect(me2.commission.percent).toBe(sold >= 100_000 ? 30 : 25);

    // Admin cannot shrink the kit below what was sold.
    const detail = (await a.req(`/api/admin/resellers/${reseller.id}`)).json;
    const kit = detail.kits[0];
    expect((await a.req(`/api/admin/kits/${kit.id}/items`, { method: 'PUT', body: { updatedAt: kit.updatedAt, items: [{ productId: p1.id, variantId: v1.id, qty: 2 }] } })).json.error.message).toContain('já foram vendidas 1');

    // Settlement: 1 × p1 left; it does not come back → owed at full price.
    const stale = await a.req(`/api/admin/kits/${kit.id}/settle`, { body: { updatedAt: 'x', returned: [] } });
    expect(stale.status).toBe(409);
    const settled = await a.req(`/api/admin/kits/${kit.id}/settle`, { body: { updatedAt: kit.updatedAt, returned: [{ productId: p1.id, variantId: v1.id, size: '', qty: 0 }] } });
    expect(settled.status).toBe(200);
    const st = settled.json.kit.settlement;
    expect(st).toMatchObject({ soldCents: sold, missingCents: p1.promoPrice ?? p1.price });
    expect(st.dueCents).toBe(st.soldCents - st.commissionCents + st.missingCents);
    expect((await catalog()).stock[p1.id][`${v1.id}|`]).toBe(1); // nothing returned

    // Next cycle: the history and the earnings show the closed one.
    const me3 = (await r.req('/api/revenda/me')).json;
    expect(me3.kit).toBeNull();
    expect(me3.history[0].settlement.commissionCents).toBe(st.commissionCents);
    expect(me3.earnings.receivedCents).toBe(st.commissionCents);
    expect((await a.req(`/api/admin/kits/${kit.id}/paid`, { body: { paid: true } })).json.kit.settlement.paidAt).toBeTruthy();

    // A kit whose unsold pieces come back gives them back to stock.
    const k2 = (await a.req(`/api/admin/resellers/${reseller.id}/kits`, { body: { items: [{ productId: p1.id, variantId: v1.id, qty: 1 }] } })).json.kit;
    expect((await catalog()).stock[p1.id][`${v1.id}|`]).toBe(0);
    await a.req(`/api/admin/kits/${k2.id}/settle`, { body: { updatedAt: k2.updatedAt, returned: [] } });
    expect((await catalog()).stock[p1.id][`${v1.id}|`]).toBe(1);
    const moves = (await a.req('/api/admin/stock')).json.movements.filter((m: any) => m.productId === p1.id).map((m: any) => m.reason);
    expect(moves.slice(0, 3)).toEqual(['retorno_maleta', 'maleta', 'maleta']);

    expect((await a.req(`/api/admin/stock/${p1.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
  });

  it('keeps every reseller inside her own data', async () => {
    const a = await admin();
    const [p] = await plainProducts(1);
    const one = await newReseller(a, 'Dora Primeira Lima');
    const two = await newReseller(a, 'Elsa Segunda Lima');
    const r1 = await activate(one.token, '402817');
    const r2 = await activate(two.token, '583920');
    await a.req(`/api/admin/resellers/${one.reseller.id}/kits`, { body: { items: [{ productId: p.id, variantId: p.variants[0].id, qty: 2 }] } });
    const sale = await r1.req('/api/revenda/sales', { body: { lines: [{ productId: p.id, variantId: p.variants[0].id, size: '', qty: 1, unitCents: 100 }], payment: 'dinheiro' }, headers: { 'Idempotency-Key': randomUUID() } });
    expect(sale.status).toBe(201);
    // Reseller 2 sees nothing of reseller 1, cannot cancel her sale, cannot sell from her kit, cannot reach admin routes.
    const me2 = (await r2.req('/api/revenda/me')).json;
    expect(me2.kit).toBeNull();
    expect(me2.sales).toEqual([]);
    expect((await r2.req(`/api/revenda/sales/${sale.json.sale.id}/cancel`, { body: {} })).status).toBe(404);
    expect((await r2.req('/api/revenda/sales', { body: { lines: [{ productId: p.id, variantId: p.variants[0].id, size: '', qty: 1, unitCents: 1 }], payment: 'pix' }, headers: { 'Idempotency-Key': randomUUID() } })).status).toBe(409);
    for (const path of ['/api/admin/resellers', `/api/admin/resellers/${one.reseller.id}`, '/api/admin/orders', '/api/admin/leads', '/api/admin/reseller-program']) {
      expect((await r2.req(path)).status).toBe(401);
    }
    expect((await new Client().req('/api/revenda/me')).status).toBe(401);
    // The invite token of one reseller cannot be replayed by anyone.
    expect((await r2.req(`/api/revenda/invite/${one.token}`)).status).toBe(404);
    // Settle to leave no open kit behind.
    const kit = (await a.req(`/api/admin/resellers/${one.reseller.id}`)).json.kits[0];
    await a.req(`/api/admin/kits/${kit.id}/settle`, { body: { updatedAt: kit.updatedAt, returned: [] } });
  });

  it('versions the contract: a changed text asks for a new acceptance at the next access', async () => {
    const a = await admin();
    const current = (await a.req('/api/admin/reseller-program')).json.program;
    // A reseller already working when the text changes.
    const [p] = await plainProducts(1);
    const working = await newReseller(a, 'Gabi Contrato Antiga');
    const r = await activate(working.token, '730418');
    expect((await a.req(`/api/admin/resellers/${working.reseller.id}/kits`, { body: { items: [{ productId: p.id, variantId: p.variants[0].id, qty: 1 }] } })).status).toBe(201);
    expect((await r.req('/api/revenda/me')).json.contractDue).toBeNull();
    const bad = await a.req('/api/admin/reseller-program', { method: 'PUT', body: { program: { ...current, tiers: [{ fromCents: 500, percent: 20 }] } } });
    expect(bad.status).toBe(400);
    const saved = await a.req('/api/admin/reseller-program', { method: 'PUT', body: { program: { ...current, contract: { ...current.contract, text: `${current.contract.text}\n10. Cláusula nova de teste.` } } } });
    expect(saved.json.program.contract.version).toBe(current.contract.version + 1);
    const same = await a.req('/api/admin/reseller-program', { method: 'PUT', body: { program: saved.json.program } });
    expect(same.json.program.contract.version).toBe(saved.json.program.contract.version);
    const { token } = await newReseller(a, 'Fabi Contrato Nova');
    expect((await new Client().req(`/api/revenda/invite/${token}`)).json.contract.version).toBe(current.contract.version + 1);

    // She sees the new version in her panel; sales wait for the acceptance.
    const me = (await r.req('/api/revenda/me')).json;
    expect(me.contractDue).toMatchObject({ mode: 'aceite', version: current.contract.version + 1 });
    expect(me.contractDue.text).toContain('Cláusula nova de teste');
    const sell = () =>
      r.req('/api/revenda/sales', { body: { lines: [{ productId: p.id, variantId: p.variants[0].id, size: '', qty: 1, unitCents: p.promoPrice ?? p.price }], payment: 'pix', customer: { name: 'Cliente', whatsapp: '' } }, headers: { 'Idempotency-Key': randomUUID() } });
    const blocked = await sell();
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.message).toContain('contrato');
    // Old version or a name that is not hers: refused.
    expect((await r.req('/api/revenda/contract', { body: { version: current.contract.version, typedName: 'Gabi Contrato Antiga' } })).status).toBe(409);
    expect((await r.req('/api/revenda/contract', { body: { version: me.contractDue.version, typedName: 'Outra Pessoa' } })).status).toBe(400);
    expect((await new Client().req('/api/revenda/contract', { body: { version: me.contractDue.version, typedName: 'Gabi Contrato Antiga' } })).status).toBe(401);
    expect((await r.req('/api/revenda/contract', { body: { version: me.contractDue.version, typedName: 'Gabi Contrato Antiga' } })).status).toBe(200);
    // A repeated tap is harmless.
    expect((await r.req('/api/revenda/contract', { body: { version: me.contractDue.version, typedName: 'Gabi Contrato Antiga' } })).status).toBe(200);
    expect((await r.req('/api/revenda/me')).json.contractDue).toBeNull();
    expect((await sell()).status).toBe(201);
    const detail = (await a.req(`/api/admin/resellers/${working.reseller.id}`)).json;
    expect(detail.acceptances.map((x: any) => x.version)).toEqual(expect.arrayContaining([current.contract.version, current.contract.version + 1]));
    expect(detail.reseller.contract.version).toBe(current.contract.version + 1);
    // Restore the default text for the other tests.
    await a.req('/api/admin/reseller-program', { method: 'PUT', body: { program: current } });
  });

  it('nets a kit line that was only partly counted, and refuses a second settlement with other numbers', async () => {
    const a = await admin();
    const [p] = await plainProducts(1);
    const v = p.variants[0];
    const key = `${v.id}|`;
    const { reseller, token } = await newReseller(a, 'Gina Parcial Rocha');
    await activate(token, '583920');
    // Opened while the piece had no stock control: 3 units, none counted.
    let kit = (await a.req(`/api/admin/resellers/${reseller.id}/kits`, { body: { items: [{ productId: p.id, variantId: v.id, qty: 3 }] } })).json.kit;
    expect(kit.stockMoves).toEqual([]);
    expect((await a.req(`/api/admin/stock/${p.id}`, { method: 'PUT', body: { tracked: true, levels: [{ variantId: v.id, size: '', qty: 10, expected: null }] } })).status).toBe(200);
    const edit = async (qty: number) => {
      const r = await a.req(`/api/admin/kits/${kit.id}/items`, { method: 'PUT', body: { updatedAt: kit.updatedAt, items: [{ productId: p.id, variantId: v.id, qty }] } });
      expect(r.status).toBe(200);
      kit = r.json.kit;
      return (await catalog()).stock[p.id][key];
    };
    expect(await edit(5)).toBe(8); // only the 2 extra units are taken
    expect(await edit(6)).toBe(7); // one more
    expect(await edit(4)).toBe(9); // two come back
    expect(kit.stockMoves).toEqual([{ productId: p.id, variantId: v.id, size: '', qty: 1 }]);
    // Settlement: retrying the same count is harmless; another count is refused.
    const all = [{ productId: p.id, variantId: v.id, size: '', qty: 4 }];
    expect((await a.req(`/api/admin/kits/${kit.id}/settle`, { body: { updatedAt: kit.updatedAt, returned: all } })).status).toBe(200);
    expect((await a.req(`/api/admin/kits/${kit.id}/settle`, { body: { updatedAt: kit.updatedAt, returned: all } })).status).toBe(200);
    expect((await a.req(`/api/admin/kits/${kit.id}/settle`, { body: { updatedAt: kit.updatedAt, returned: [{ ...all[0], qty: 2 }] } })).status).toBe(409);
    expect((await catalog()).stock[p.id][key]).toBe(10);
    expect((await a.req(`/api/admin/stock/${p.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
  });
  it('picks the next free showcase address when two resellers with the same first name are created at once', async () => {
    const a = await admin();
    const first = `Zuleica${randomUUID().slice(0, 4).replace(/\d/g, 'x')}`;
    const made = await Promise.all(
      [1, 2, 3].map((n) => a.req('/api/admin/resellers', { body: { name: `${first} Silva ${n}`, whatsapp: phoneOf(), city: 'Cuiabá', uf: 'MT' }, headers: { 'Idempotency-Key': randomUUID() } })),
    );
    expect(made.map((m) => m.status)).toEqual([201, 201, 201]);
    expect(new Set(made.map((m) => m.json.reseller.slug)).size).toBe(3);
    // An address she typed herself is never swapped silently.
    const typed = await a.req('/api/admin/resellers', { body: { name: 'Outra Pessoa', whatsapp: phoneOf(), city: 'Cuiabá', uf: 'MT', slug: made[0]!.json.reseller.slug }, headers: { 'Idempotency-Key': randomUUID() } });
    expect(typed.status).toBe(409);
  });

  it('erases a reseller who left: everything about her and her customers, only once the settlements are received', async () => {
    const a = await admin();
    // The last plain product: api.test.ts runs in parallel on the same server and uses the first ones.
    const p = (await plainProducts(100)).at(-1);
    const v = p.variants[0];
    const key = `${v.id}|`;
    expect((await a.req(`/api/admin/stock/${p.id}`, { method: 'PUT', body: { tracked: true, levels: [{ variantId: v.id, size: '', qty: 4, expected: null }] } })).status).toBe(200);

    // Her whole path: application, effectivation, access (contract + PIN), kit, a sale with a customer, settlement.
    const whatsapp = phoneOf();
    const masked = `(${whatsapp.slice(0, 2)}) ${whatsapp.slice(2, 7)}-${whatsapp.slice(7)}`;
    const lead = await new Client().req('/api/leads', { body: { name: 'Lia Saída Moraes', whatsapp: masked, city: 'Cuiabá', uf: 'MT', instagram: 'lia.moraes', alreadySells: false, source: '', consent: true } });
    expect(lead.status).toBe(201);
    const second = await new Client().req('/api/leads', { body: { name: 'Lia S. Moraes', whatsapp: masked, city: 'Cuiabá', uf: 'MT', instagram: '', alreadySells: false, source: '', consent: true } });
    expect(second.status).toBe(201);
    const created = await a.req('/api/admin/resellers', { body: { leadId: lead.json.id, name: 'Lia Saída Moraes', whatsapp, city: 'Cuiabá', uf: 'MT', instagram: 'lia.moraes' }, headers: { 'Idempotency-Key': randomUUID() } });
    expect(created.status).toBe(201);
    const reseller = created.json.reseller;
    const r = await activate(created.json.invite.token, '736251');
    const kit = (await a.req(`/api/admin/resellers/${reseller.id}/kits`, { body: { items: [{ productId: p.id, variantId: v.id, qty: 1 }] } })).json.kit;
    expect((await catalog()).stock[p.id][key]).toBe(3);
    const sale = await r.req('/api/revenda/sales', {
      body: { lines: [{ productId: p.id, variantId: v.id, size: '', qty: 1, unitCents: p.promoPrice ?? p.price }], payment: 'pix', customer: { name: 'Cliente Sigilosa', whatsapp: '(65) 96666-2222' } },
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(sale.status).toBe(201);
    const fresh = async () => (await a.req(`/api/admin/resellers/${reseller.id}`)).json;
    const erase = async (updatedAt?: string) => a.req(`/api/admin/resellers/${reseller.id}/erase`, { body: { updatedAt: updatedAt ?? (await fresh()).reseller.updatedAt } });

    // Not while she is active, nor with a kit open.
    expect((await erase()).json.error.message).toContain('Encerre a parceria');
    const openKit = (await fresh()).kits[0]; // the sale moved the kit's stamp
    expect((await a.req(`/api/admin/kits/${kit.id}/settle`, { body: { updatedAt: openKit.updatedAt, returned: [] } })).status).toBe(200);
    const ended = await a.req(`/api/admin/resellers/${reseller.id}`, { method: 'PATCH', body: { updatedAt: (await fresh()).reseller.updatedAt, status: 'encerrada' } });
    expect(ended.status).toBe(200);
    // Not while the store has not received the settlement.
    const unpaid = await erase();
    expect(unpaid.status).toBe(409);
    expect(unpaid.json.error.message).toContain('falta receber');
    expect((await a.req(`/api/admin/kits/${kit.id}/paid`, { body: { paid: true } })).status).toBe(200);
    // A stale screen is refused.
    expect((await erase('2020-01-01T00:00:00.000Z')).status).toBe(409);

    const done = await erase();
    expect(done.status).toBe(200);
    expect(done.json.erased).toEqual({ kits: 1, sales: 1, leads: 2 });

    // Nothing about her (or her customer) is left anywhere the panel or the public can reach.
    expect((await a.req(`/api/admin/resellers/${reseller.id}`)).status).toBe(404);
    const everything = JSON.stringify([(await a.req('/api/admin/resellers')).json, (await a.req('/api/admin/leads')).json, (await a.req('/api/admin/stock')).json]);
    for (const trace of ['Lia', 'Moraes', 'lia.moraes', whatsapp, 'Cliente Sigilosa', '966662222', reseller.id]) expect(everything).not.toContain(trace);
    expect((await new Client().req(`/api/r/${reseller.slug}`)).status).toBe(404);
    expect((await r.req('/api/revenda/me')).status).toBe(401);
    expect((await new Client().req('/api/revenda/login', { body: { whatsapp, pin: '736251' } })).status).not.toBe(200);
    // Erasing twice is a clean 404; her number is free for a new partnership.
    expect((await erase('x')).status).toBe(404);
    expect((await a.req('/api/admin/resellers', { body: { name: 'Lia Moraes Volta', whatsapp, city: 'Cuiabá', uf: 'MT' }, headers: { 'Idempotency-Key': randomUUID() } })).status).toBe(201);

    // Stock stays consistent: the kit movement remains, without her name.
    const moves = (await a.req('/api/admin/stock')).json.movements.filter((m: any) => m.productId === p.id && m.kitId === kit.id);
    expect(moves.map((m: any) => m.reason)).toEqual(['maleta']);
    expect(moves[0].resellerName ?? '').toBe('');
    expect((await catalog()).stock[p.id][key]).toBe(3);
    expect((await a.req(`/api/admin/stock/${p.id}`, { method: 'PUT', body: { tracked: false, levels: [] } })).status).toBe(200);
  });
});
