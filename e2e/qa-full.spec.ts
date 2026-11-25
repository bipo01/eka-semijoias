/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads of the local QA seed. */
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { PUBLIC_ROUTES } from './routes';

/**
 * Full visual QA capture (not part of the regular run):
 *   QA_FULL=1 npx playwright test e2e/qa-full.spec.ts --project=desktop-chromium
 * Seeds a local database with realistic data (orders, a Pix charge, a reseller with a kit, an
 * application, a customer), then saves screenshots of every public page, every admin tab and
 * editor, the reseller panel and the payment page at phone, tablet and desktop widths into
 * docs/qa/full/, plus layout-problems.json (horizontal overflow, clipped text, off-screen controls).
 */
test.skip(!process.env.QA_FULL, 'QA capture runs on demand');
test.describe.configure({ mode: 'serial' });

const OUT = 'docs/qa/full';
const PIN = '314159';
const PUBLIC_WIDTHS = [360, 390, 768, 1280, 1440];
const ADMIN_WIDTHS = [360, 768, 1440];
const SECTIONS = ['inicio', 'depoimentos', 'perguntas', 'sobre', 'cuidados', 'garantia', 'revendedoras', 'contato', 'geral', 'privacidade', 'compartilhar'];
const ADMIN_TABS = ['pedidos', 'clientes', 'revendedoras', 'produtos', 'estoque', 'relatorio', 'mensagens', 'site', 'categorias', 'configuracoes', 'backup'];

const problems: Record<string, string[]> = {};
const seed: { payToken?: string; slug?: string; resellerWhatsapp?: string; resellerId?: string; orderNumber?: number } = {};
const ip = () => `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function api(request: APIRequestContext, base: string, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await request.fetch(base + path, {
    method,
    headers: { Origin: base.replace(/\/$/, ''), 'CF-Connecting-IP': extra['ip'] ?? ip(), 'Idempotency-Key': crypto.randomUUID(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { data: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status(), json };
}

/** Layout problems a person would notice: page wider than the screen, cut text, controls off-screen. */
async function audit(page: Page, name: string) {
  const found = await page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px > ${vw}px`);
    const label = (el: Element) => {
      const t = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 50);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${t}"`;
    };
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Inside a horizontal scroller (rails) things may sit off-screen on purpose.
      let scroller = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (['auto', 'scroll'].includes(ps.overflowX) && p.scrollWidth > p.clientWidth) {
          scroller = true;
          break;
        }
      }
      if (scroller) continue;
      if ((r.right > vw + 1 || r.left < -1) && s.position !== 'fixed' && !el.closest('[aria-hidden="true"], .sr-only')) {
        if (['button', 'a', 'input', 'select', 'textarea', 'h1', 'h2', 'h3', 'p', 'img'].includes(el.tagName.toLowerCase())) out.push(`off-screen ${label(el)} (${Math.round(r.left)}..${Math.round(r.right)})`);
      }
      const clips = ['hidden', 'clip'].includes(s.overflowX) && s.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 && (el.textContent ?? '').trim().length > 0;
      if (clips && !el.closest('.sr-only')) out.push(`text cut ${label(el)} (${el.scrollWidth} > ${el.clientWidth})`);
    }
    return Array.from(new Set(out)).slice(0, 25);
  });
  if (found.length) problems[name] = found;
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 25));
    }
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });
  await page.waitForTimeout(250);
}

async function shot(page: Page, name: string, fullPage = true) {
  await settle(page);
  await audit(page, name);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, fullPage, type: 'jpeg', quality: 70 });
}

/** A dialog shows whole on a tall viewport (sheets scroll inside themselves). */
async function shotDialog(page: Page, name: string, width: number) {
  const dialog = page.locator('dialog[open]').last();
  await dialog.waitFor();
  await page.waitForTimeout(300);
  const inner = await dialog.evaluate((d) => {
    let max = d.scrollHeight;
    for (const el of Array.from(d.querySelectorAll('*'))) if (el.scrollHeight > el.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) max = Math.max(max, el.scrollHeight + 200);
    return max;
  });
  await page.setViewportSize({ width, height: Math.min(Math.max(inner + 120, 800), 6000) });
  await page.waitForTimeout(300);
  await audit(page, name);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 70 });
}

async function adminPage(browser: Browser, width: number) {
  const mobile = width < 768;
  const context = await browser.newContext({ viewport: { width, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': ip() });
  const page = await context.newPage();
  await page.goto('/admin');
  await page.getByRole('group', { name: 'Teclado do PIN' }).waitFor();
  for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeAttached();
  return { context, page };
}

test('seed realistic local data', async ({ playwright, baseURL }) => {
  await mkdir(OUT, { recursive: true });
  const base = baseURL!.replace(/\/$/, '');
  const admin = await playwright.request.newContext();
  expect((await api(admin, base, 'POST', '/api/admin/login', { pin: PIN })).status).toBe(200);
  const catalog = (await api(admin, base, 'GET', '/api/catalog')).json;
  const plain = catalog.products.filter((p: any) => p.available && p.variants.every((v: any) => v.available && !v.sizes?.length));

  // Pix key (static), so charges and the payment page work.
  const pix = { key: '+5565999998888', name: 'EKA Semijoias', city: 'Cuiaba' };
  const settings = await api(admin, base, 'POST', '/api/admin/changes', { baseVersion: catalog.version, changes: [{ kind: 'settings', op: 'upsert', data: { ...catalog.settings, pix } }] });
  expect(settings.status, JSON.stringify(settings.json)).toBe(200);

  // Site orders from three customers.
  const people = [
    ['Mariana Albuquerque', 'Cuiabá'],
    ['Carla Pagadora', 'Várzea Grande'],
    ['Joana Ribeiro', 'Rondonópolis'],
  ];
  for (const [i, [name, city]] of people.entries()) {
    const items = [{ productId: plain[i].id, variantId: plain[i].variants[0].id, qty: 1 }, { productId: plain[i + 3].id, variantId: plain[i + 3].variants[0].id, qty: 2 }];
    const r = await api(admin, base, 'POST', '/api/orders', { items, name, city, note: i === 0 ? 'Pode embrulhar para presente?' : undefined });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
  }
  const orders = (await api(admin, base, 'GET', '/api/admin/orders')).json.orders;
  const carla = orders.find((o: any) => o.customer.name === 'Carla Pagadora');
  seed.orderNumber = carla.number;
  expect((await api(admin, base, 'POST', `/api/admin/orders/${carla.id}/status`, { from: 'enviado', to: 'confirmado' })).status).toBe(200);
  const charge = await api(admin, base, 'POST', `/api/admin/orders/${carla.id}/charge`, { shippingCents: 2000, discountCents: 0 });
  expect(charge.status, JSON.stringify(charge.json)).toBe(200);
  seed.payToken = charge.json.order.charge.token;

  // A customer, an application and a reseller with a kit.
  await api(admin, base, 'POST', '/api/admin/customers', { name: 'Fernanda Costa', whatsapp: '(65) 99812-3456', city: 'Cuiabá', uf: 'MT', instagram: '@fecosta', note: '' });
  await api(admin, base, 'POST', '/api/leads', { name: 'Patrícia Moraes', whatsapp: '(65) 98877-1122', city: 'Chapada dos Guimarães', uf: 'MT', instagram: '@patimoraes', alreadySells: true, source: 'Instagram', consent: true });
  seed.resellerWhatsapp = '65991234567';
  const reseller = await api(admin, base, 'POST', '/api/admin/resellers', { name: 'Bruna Revenda Silva', whatsapp: seed.resellerWhatsapp, city: 'Cuiabá', uf: 'MT' });
  expect(reseller.status, JSON.stringify(reseller.json)).toBe(201);
  seed.slug = reseller.json.reseller.slug;
  seed.resellerId = reseller.json.reseller.id;
  const token = reseller.json.invite.token;
  const invite = await api(admin, base, 'GET', `/api/revenda/invite/${token}`);
  const activated = await api(admin, base, 'POST', `/api/revenda/invite/${token}`, { pin: '402817', contract: { version: invite.json.contract.version, typedName: invite.json.name } });
  expect(activated.status, JSON.stringify(activated.json)).toBe(200);
  const kit = await api(admin, base, 'POST', `/api/admin/resellers/${seed.resellerId}/kits`, { items: plain.slice(6, 10).map((p: any) => ({ productId: p.id, variantId: p.variants[0].id, qty: 2 })) });
  if (kit.status !== 201 && kit.status !== 200) console.log('kit not created', kit.status, JSON.stringify(kit.json));
  await admin.dispose();
});

for (const width of PUBLIC_WIDTHS) {
  test(`public pages at ${width}px`, async ({ browser }) => {
    test.setTimeout(240_000);
    const mobile = width < 768;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto('/');
    const catalog = await (await page.request.get('/api/catalog')).json();
    const plain = catalog.products.filter((p: any) => p.available && p.variants.every((v: any) => !v.sizes?.length));
    await page.evaluate((items) => localStorage.setItem('eka:cart:v1', JSON.stringify({ items })), [
      { productId: plain[0].id, variantId: plain[0].variants[0].id, qty: 1 },
      { productId: plain[1].id, variantId: plain[1].variants[0].id, qty: 2 },
    ]);
    await page.evaluate((id) => localStorage.setItem('eka:favorites:v1', JSON.stringify({ ids: [id] })), plain[2].id);
    await page.reload();
    const routes = [...PUBLIC_ROUTES, `/pagamento/${seed.payToken}`, `/r/${seed.slug}`, '/revenda'];
    for (const route of routes) {
      await page.goto(route);
      await page.locator('main, body').first().waitFor();
      const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[/?=&]+/g, '_').slice(0, 60);
      await shot(page, `pub-${name}-${width}`);
    }
    // Drawers: menu and bag.
    await page.goto('/');
    await settle(page);
    const menu = page.getByRole('button', { name: /Abrir menu|Menu/ }).first();
    if (await menu.isVisible()) {
      await menu.click();
      await shotDialog(page, `pub-drawer-menu-${width}`, width);
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width, height: mobile ? 800 : 900 });
    }
    await page.getByRole('button', { name: /Sacola/ }).first().click();
    await shotDialog(page, `pub-drawer-sacola-${width}`, width);
    await context.close();
  });
}

test('reseller panel', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const width of ADMIN_WIDTHS) {
    const mobile = width < 768;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': ip() });
    const page = await context.newPage();
    await page.goto('/revenda');
    const base = new URL(page.url()).origin;
    const login = await api(context.request, base, 'POST', '/api/revenda/login', { whatsapp: seed.resellerWhatsapp, pin: '402817' });
    expect(login.status, JSON.stringify(login.json)).toBe(200);
    await page.reload();
    await shot(page, `rev-painel-${width}`);
    await context.close();
  }
});

for (const width of ADMIN_WIDTHS) {
  test(`admin at ${width}px`, async ({ browser }) => {
    test.setTimeout(900_000);
    const { context, page } = await adminPage(browser, width);
    const tall = { width, height: width < 768 ? 800 : 900 };
    for (const tab of ADMIN_TABS) {
      await page.goto(`/admin/${tab}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await shot(page, `adm-${tab}-${width}`);
    }
    // Order detail and new-order sheet.
    await page.goto('/admin/pedidos');
    await page.getByRole('button', { name: new RegExp(`nº ${seed.orderNumber}`) }).first().click();
    await shotDialog(page, `adm-pedido-detalhe-${width}`, width);
    await page.keyboard.press('Escape');
    await page.setViewportSize(tall);
    await page.getByRole('button', { name: 'Novo pedido' }).first().click();
    await shotDialog(page, `adm-pedido-novo-${width}`, width);
    await page.keyboard.press('Escape');
    await page.setViewportSize(tall);
    // Reseller detail.
    await page.goto('/admin/revendedoras');
    await page.getByText('Bruna Revenda Silva').first().click();
    await page.waitForTimeout(500);
    if (await page.locator('dialog[open]').count()) {
      await shotDialog(page, `adm-revendedora-detalhe-${width}`, width);
      await page.keyboard.press('Escape');
      await page.setViewportSize(tall);
    } else await shot(page, `adm-revendedora-detalhe-${width}`);
    // Product form: new and existing.
    await page.goto('/admin/produtos/nova');
    await page.getByRole('heading', { level: 1 }).first().waitFor().catch(() => {});
    if (await page.locator('dialog[open]').count()) await shotDialog(page, `adm-produto-novo-${width}`, width);
    else await shot(page, `adm-produto-novo-${width}`);
    await page.setViewportSize(tall);
    await page.goto('/admin/produtos');
    await page.getByRole('link', { name: /Editar|Brinco/ }).first().click().catch(() => {});
    await page.waitForTimeout(600);
    if (await page.locator('dialog[open]').count()) await shotDialog(page, `adm-produto-editar-${width}`, width);
    else await shot(page, `adm-produto-editar-${width}`);
    await page.setViewportSize(tall);
    // "O que a loja oferece" lives in Configurações.
    await page.goto('/admin/configuracoes');
    await shot(page, `adm-configuracoes-full-${width}`);
    // Every site editor.
    for (const id of SECTIONS) {
      await page.goto(`/admin/site?secao=${id}`);
      await page.locator('dialog[open]').last().waitFor();
      await shotDialog(page, `adm-site-${id}-${width}`, width);
      await page.setViewportSize(tall);
    }
    await context.close();
  });
}

// Written after every test, so a failure later in the run keeps what was found so far.
test.afterEach(async () => {
  await writeFile(`${OUT}/layout-problems.json`, JSON.stringify(problems, null, 2));
});
