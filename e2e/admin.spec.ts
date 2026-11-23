import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PIN = '314159'; // ADMIN_INITIAL_PIN of the local E2E server (playwright.config.ts)

// Each test logs in from its own network, so parallel runs never trip the per-IP login throttle.
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

async function unlock(page: Page) {
  await page.getByRole('group', { name: 'Teclado do PIN' }).waitFor();
  for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Produtos', level: 1 })).toBeVisible();
}

async function axe(page: Page) {
  await page.waitForTimeout(300); // let color transitions settle before measuring contrast
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

// Parallel browser projects share one server: each project edits its own products.
const PRICE_PRODUCT: Record<string, { id: string; name: string; slug: string }> = {
  'mobile-chromium': { id: 'prod-p04', name: 'Brinco Pérola Clássico', slug: 'brinco-perola-classico' },
  'desktop-chromium': { id: 'prod-p02', name: 'Argola Cravejada', slug: 'argola-cravejada' },
  'mobile-webkit': { id: 'prod-p03', name: 'Ear Cuff Folhagem', slug: 'ear-cuff-folhagem' },
  'desktop-webkit': { id: 'prod-p01', name: 'Brinco Gota Cristal', slug: 'brinco-gota-cristal' },
};

test('admin: PIN gate, edit a price and see it on the public site', async ({ page }, testInfo) => {
  const product = PRICE_PRODUCT[testInfo.project.name] ?? PRICE_PRODUCT['desktop-chromium']!;
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Painel ÉKA' })).toBeVisible();
  const text = (await page.locator('body').innerText()).toLowerCase();
  for (const word of ['demonstra', 'não é segur', 'área da érika']) expect(text).not.toContain(word);

  for (const d of '000001') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/PIN/);
  for (const d of PIN) await page.keyboard.press(d);
  await expect(page.getByRole('heading', { name: 'Produtos', level: 1 })).toBeVisible();

  await page.locator(`a[href="/admin/produtos/${product.id}"]`).first().click();
  const price = page.getByRole('textbox', { name: /^Preço/ }).first();
  await price.fill('274,90');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Alterações salvas.')).toBeVisible();

  await page.goto(`/produto/${product.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible();
  await expect(page.locator('main').getByText('R$ 274,90').first()).toBeVisible();
});

test('admin: usable at 360px without horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.250.${Math.floor(Math.random() * 250)}.1` });
  await page.goto('/admin');
  await unlock(page);
  for (const section of ['produtos', 'categorias', 'colecoes', 'revendedoras', 'configuracoes', 'backup', 'produtos/prod-p01']) {
    await page.goto(`/admin/${section}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, section).toBeLessThanOrEqual(0);
  }
  await context.close();
});

test('admin: no serious accessibility violations', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('group', { name: 'Teclado do PIN' }).waitFor();
  expect(await axe(page)).toEqual([]);
  await unlock(page);
  for (const section of ['produtos', 'categorias', 'colecoes', 'revendedoras', 'configuracoes', 'backup', 'produtos/prod-p01']) {
    await page.goto(`/admin/${section}`);
    await page.waitForLoadState('networkidle');
    expect(await axe(page), section).toEqual([]);
  }
});

const LIVE_PRODUCT: Record<string, { id: string; slug: string; name: string }> = {
  'mobile-chromium': { id: 'prod-p05', slug: 'colar-ponto-de-luz', name: 'Colar Ponto de Luz' },
  'desktop-chromium': { id: 'prod-p06', slug: 'choker-riviera', name: 'Choker Riviera' },
  'mobile-webkit': { id: 'prod-p07', slug: 'colar-medalha-sol', name: 'Colar Medalha Sol' },
  'desktop-webkit': { id: 'prod-p09', slug: 'anel-aparador-cravejado', name: 'Anel Aparador Cravejado' },
};

test('admin: an edit reaches an open visitor page live, without reload', async ({ page, browser }, testInfo) => {
  const product = LIVE_PRODUCT[testInfo.project.name] ?? LIVE_PRODUCT['desktop-chromium']!;
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/produto/${product.slug}`);
  await expect(visitor.getByRole('heading', { level: 1, name: product.name })).toBeVisible();
  const navigations: string[] = [];
  visitor.on('framenavigated', (f) => f === visitor.mainFrame() && navigations.push(f.url()));

  await page.goto(`/admin/produtos/${product.id}`);
  await unlock(page);
  const name = page.getByRole('textbox', { name: 'Nome da peça' });
  await name.fill(`${product.name} Especial`);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Alterações salvas.')).toBeVisible();

  await expect(visitor.getByRole('heading', { level: 1, name: `${product.name} Especial` })).toBeVisible({ timeout: 5000 });
  expect(navigations).toEqual([]); // updated in place, no reload
  await visitorContext.close();
});

const PHOTO_PRODUCT: Record<string, { id: string; slug: string }> = {
  'mobile-chromium': { id: 'prod-p10', slug: 'pulseira-riviera' },
  'desktop-chromium': { id: 'prod-p11', slug: 'pulseira-elos' },
  'mobile-webkit': { id: 'prod-p12', slug: 'conjunto-gota' },
  'desktop-webkit': { id: 'prod-p13', slug: 'colar-gota-cristal' },
};

test('admin: a new photo is uploaded on save and becomes the cover on the public site', async ({ page }, testInfo) => {
  const product = PHOTO_PRODUCT[testInfo.project.name] ?? PHOTO_PRODUCT['desktop-chromium']!;
  await page.goto(`/admin/produtos/${product.id}`);
  await unlock(page);
  const uploads: string[] = [];
  page.on('response', (r) => r.url().endsWith('/api/admin/media') && uploads.push(String(r.status())));
  const photos = page.getByRole('list', { name: 'Fotos da peça' }).getByRole('button', { name: /^(Principal, foto 1|Foto \d+):/ });
  const before = await photos.count();
  await page.locator('dialog input[type="file"]').first().setInputFiles('public/images/products/p02-argola-cravejada-960.webp');
  await expect(photos).toHaveCount(before + 1, { timeout: 15_000 });
  await photos.last().click();
  await page.getByRole('button', { name: 'Tornar principal' }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Alterações salvas.')).toBeVisible({ timeout: 15_000 });
  expect(uploads.length).toBeGreaterThanOrEqual(1);
  expect(uploads.every((s) => s === '200' || s === '201')).toBe(true);

  // The new main photo is the product's cover in listings (each finish's gallery shows the photos linked to it).
  await page.goto('/catalogo');
  const cover = page.locator(`main article:has(a[href="/produto/${product.slug}"]) img`).first();
  await expect(cover).toHaveAttribute('src', /^\/media\/[a-f0-9]{64}\.(webp|jpg)$/);
  await cover.scrollIntoViewIfNeeded();
  await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});
