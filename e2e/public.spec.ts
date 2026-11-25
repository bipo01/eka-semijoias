import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PUBLIC_ROUTES } from './routes';

const BANNED_EVERYWHERE = ['demonstra', 'demo', 'prévia', 'preview', 'exemplo', 'placeholder', 'ilustrativ', 'não é segur', 'pendente'];
const BANNED_OUTSIDE_ABOUT = ['com a érika', 'da érika', 'fale com a érika'];

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.locator('main').waitFor();
  await page.waitForLoadState('networkidle');
}

for (const route of PUBLIC_ROUTES) {
  test(`copy voice on ${route}`, async ({ page }) => {
    await open(page, route);
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const word of BANNED_EVERYWHERE) expect(text, `"${word}" on ${route}`).not.toMatch(new RegExp(`\\b${word}`));
    if (route !== '/sobre') for (const word of BANNED_OUTSIDE_ABOUT) expect(text, `"${word}" on ${route}`).not.toContain(word);
    // Every image has an alt attribute and no image is broken.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
    });
    await page.waitForLoadState('networkidle');
    const broken = await page.evaluate(() =>
      [...document.images].filter((img) => !img.hasAttribute('alt') || (img.complete && img.naturalWidth === 0 && img.getAttribute('src'))).map((i) => i.src),
    );
    expect(broken).toEqual([]);
  });

  test(`accessibility on ${route}`, async ({ page }) => {
    await open(page, route);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });
}

test('one h1 per page and no horizontal overflow', async ({ page }) => {
  for (const route of PUBLIC_ROUTES) {
    await open(page, route);
    expect(await page.locator('h1').count(), route).toBe(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, route).toBeLessThanOrEqual(0);
  }
});

test('add to bag, register the order and build the WhatsApp message', async ({ page, isMobile, context }) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.201.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  await open(page, '/produto/anel-solitario-delicado');
  const add = page.getByRole('button', { name: 'Adicionar à sacola' }).filter({ visible: true }).first();
  await add.click();
  await expect(page.getByRole('alert').or(page.getByText('Escolha o aro para continuar.'))).toBeVisible();
  await page.getByRole('radio', { name: 'Dourado' }).click();
  await expect(page).toHaveURL(/acabamento=dourado/);
  await expect(page.getByText('Foto no acabamento Rosé')).toBeVisible();
  await page.getByRole('radio', { name: '16' }).click();
  await page.getByRole('button', { name: 'Aumentar quantidade' }).filter({ visible: true }).first().click();
  await add.click();
  await expect(page.getByText(/Adicionado à sacola/)).toBeVisible();
  if (isMobile) {
    const bar = page.locator('div.fixed.bottom-0').filter({ has: page.getByRole('button', { name: 'Adicionar à sacola' }) });
    const box = await bar.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(65);
  }
  await page.getByRole('button', { name: /Sacola, 2 itens/ }).click();
  const dialog = page.getByRole('dialog', { name: /Sua sacola/ });
  await expect(dialog).toBeVisible();
  // Name and city are required to register the order.
  await dialog.getByRole('button', { name: 'Finalizar pedido' }).click();
  await expect(dialog.getByText('Informe seu nome.')).toBeVisible();
  await dialog.getByPlaceholder('Seu nome').fill('Ana');
  await dialog.getByPlaceholder('Cidade').fill('Cuiabá/MT');
  // Remove with undo
  await dialog.getByRole('button', { name: 'Remover Anel Solitário Delicado' }).click();
  await expect(dialog.getByText('Sua sacola está vazia')).toBeVisible();
  await dialog.getByRole('button', { name: 'Desfazer' }).click();
  await expect(dialog.getByText('Anel Solitário Delicado')).toBeVisible();

  // Register the order: the server prices it and gives it a number; the message carries it.
  const created = page.waitForResponse((r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Finalizar pedido' }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const number = ((await response.json()) as { order: { number: number } }).order.number;
  await expect(dialog.getByRole('heading', { name: `Pedido nº ${number} registrado` })).toBeVisible();
  const href = await dialog.getByRole('link', { name: 'Enviar pedido pelo WhatsApp' }).getAttribute('href');
  const text = decodeURIComponent(href!.split('text=')[1]!);
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(text).toBe(
    `Olá! Fiz o pedido nº ${number} pelo site:\n\n1) Anel Solitário Delicado — Dourado — aro 16 — 2 un. — R$ 279,80\n\nTotal: R$ 279,80\nNome: Ana · Cidade: Cuiabá/MT`,
  );
  // "Alterar pedido" goes back to the bag, which is still there.
  await dialog.getByRole('button', { name: 'Alterar pedido' }).click();
  await expect(dialog.getByRole('button', { name: 'Finalizar pedido' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // The cart and customer survive a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: /Sacola, 2 itens/ })).toBeVisible();
});

test('collections are gone: old links land on the catalog', async ({ page }) => {
  await page.goto('/colecao/rose');
  await expect(page).toHaveURL(/\/catalogo$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await open(page, '/');
  const text = (await page.locator('body').innerText()).toLowerCase();
  expect(text).not.toContain('coleção rosé');
  expect(text).not.toContain('explorar coleção');
});

test('catalog filters live in the URL and survive back navigation', async ({ page }) => {
  await open(page, '/catalogo');
  await page.getByRole('button', { name: /^Filtrar/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filtrar' });
  // The panel really shows, with its content (Safari on iOS 26 once drew bottom sheets 0 px tall).
  await expect.poll(async () => (await sheet.boundingBox())?.height ?? 0).toBeGreaterThan(300);
  await sheet.getByRole('button', { name: /Ródio negro/ }).click();
  await sheet.getByRole('button', { name: /^Ver \d+ peças?$/ }).click();
  await expect(page).toHaveURL(/acabamento=rodio-negro/);
  await expect(page.locator('main').getByText('2 peças', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Argola Cravejada Ródio Negro' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Argola Cravejada Ródio Negro' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/acabamento=rodio-negro/);
  await expect(page.getByRole('button', { name: 'Remover filtro Ródio negro' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar peças' }).fill('anel');
  await expect(page).toHaveURL(/q=anel/);
  await expect(page.locator('main').getByText('1 peça', { exact: true })).toBeVisible();
});

test('empty category shows the empty state', async ({ page }) => {
  await open(page, '/catalogo/tornozeleiras');
  await expect(page.getByText('Nenhuma peça encontrada')).toBeVisible();
  await expect(page.locator('main').getByRole('link', { name: /Fale com a gente/ })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
});

test('reseller pre-registration validates and saves the lead', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.200.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  await open(page, '/revendedoras');
  await page.getByRole('button', { name: 'Enviar pré-cadastro' }).click();
  await expect(page.getByText('Digite seu nome completo')).toBeVisible();
  await expect(page.getByText(/WhatsApp com DDD/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Nome completo/ })).toBeFocused();
  await page.getByRole('textbox', { name: /Nome completo/ }).fill('Ana Souza');
  await page.getByRole('textbox', { name: /WhatsApp/ }).fill('65999991234');
  await expect(page.getByRole('textbox', { name: /WhatsApp/ })).toHaveValue('(65) 99999-1234');
  await page.getByRole('textbox', { name: /Cidade/ }).fill('Cuiabá');
  await page.getByRole('combobox', { name: /UF/ }).selectOption('MT');
  await page.getByRole('radio', { name: 'Não' }).click();
  await page.getByRole('checkbox').check();
  const popup = context.waitForEvent('page');
  const stored = page.waitForResponse((r) => r.url().endsWith('/api/leads') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enviar pré-cadastro' }).click();
  expect((await stored).status()).toBe(201);
  const wa = await popup;
  expect(decodeURIComponent(wa.url()).replace(/\+/g, ' ')).toContain('Quero ser revendedora');
  await wa.close();
  await expect(page.getByText('Pré-cadastro enviado!')).toBeVisible();
  await expect(page.getByText(/Não conseguimos registrar/)).toHaveCount(0);
});

test('"Quero ser revendedora" reaches the form on the first tap (regression: it used to need two)', async ({ page }) => {
  await open(page, '/revendedoras');
  const form = page.locator('#pre-cadastro-title');
  await expect(form).not.toBeInViewport();
  await page.waitForLoadState('networkidle'); // the app is fully running, as when a visitor taps
  await page.getByRole('link', { name: /Quero ser revendedora/ }).first().click();
  // The bug scrolled and the router's scroll restoration undid it: check it is still there after that.
  await page.waitForTimeout(1500);
  await expect(form).toBeInViewport({ timeout: 0 });
  await expect(form).toBeFocused(); // screen readers land on the form, the phone keyboard stays closed
  expect(new URL(page.url()).pathname).toBe('/revendedoras');
});

test('"Novidades" arrows never do nothing: off at the start, on after scrolling', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the arrows are a desktop control (phones swipe)');
  await open(page, '/');
  const prev = page.getByRole('button', { name: 'Ver anteriores' });
  const next = page.getByRole('button', { name: 'Ver próximas' });
  await expect(prev).toBeDisabled();
  await next.click();
  await expect(prev).toBeEnabled();
});

test('the bag icon on the bag page goes back to the top instead of doing nothing', async ({ page }) => {
  await open(page, '/sacola');
  const bag = page.getByRole('banner').getByRole('button', { name: /^Sacola/ });
  await expect(bag).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => window.scrollTo(0, 400));
  await bag.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('a shared link to the pre-registration form lands on it', async ({ page }) => {
  await page.goto('/revendedoras#pre-cadastro');
  await page.waitForTimeout(1500); // past the catalog load and the router's scroll restoration
  await expect(page.locator('#pre-cadastro-title')).toBeInViewport({ timeout: 0 });
});

test('menu drawer is keyboard accessible and returns focus', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile drawer');
  await open(page, '/');
  const trigger = page.getByRole('button', { name: 'Abrir menu' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Brincos', exact: true })).toBeVisible();
  // No prices and no collections in the menu.
  await expect(drawer.getByText(/a partir de|R\$/)).toHaveCount(0);
  await expect(drawer.getByText('Coleções')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('product page shows the total for the chosen quantity', async ({ page, isMobile }) => {
  await open(page, '/produto/brinco-gota-cristal');
  await page.getByRole('button', { name: 'Aumentar quantidade' }).filter({ visible: true }).first().click();
  if (isMobile) {
    const bar = page.locator('div.fixed.bottom-0').filter({ has: page.getByRole('button', { name: 'Adicionar à sacola' }) });
    await expect(bar.getByText('2 × R$ 129,90')).toBeVisible();
    await expect(bar.getByText('R$ 259,80')).toBeVisible();
  } else {
    await expect(page.getByText('R$ 259,80').filter({ visible: true })).toBeVisible();
  }
});

test('clean URLs: deep links load directly and old #/ links are redirected', async ({ page }) => {
  await page.goto('/produto/brinco-gota-cristal');
  await expect(page.getByRole('heading', { level: 1, name: 'Brinco Gota Cristal' })).toBeVisible();
  await page.goto('/#/catalogo/brincos?ordem=menor-preco');
  await expect(page).toHaveURL(/\/catalogo\/brincos\?ordem=menor-preco$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.reload(); // the clean path survives a reload (served by the Worker)
  await expect(page).toHaveURL(/\/catalogo\/brincos/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('"Voltar" on inner pages goes back to where the visitor came from, or up from a shared link', async ({ page }) => {
  const back = (name: string) => page.locator('main').getByRole('link', { name: `Voltar para ${name}` });

  // A piece opened from a shared link: nothing behind it, so it goes up to its category.
  await open(page, '/produto/brinco-gota-cristal');
  await expect(back('Brincos')).toHaveAttribute('href', '/catalogo/brincos');
  await back('Brincos').click();
  await expect(page).toHaveURL(/\/catalogo\/brincos$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Brincos' })).toBeVisible();
  // Category pages go up to the catalog.
  await back('Catálogo').click();
  await expect(page).toHaveURL(/\/catalogo$/);

  // From the filtered catalog: back really returns, filters kept, no new history entry.
  await page.getByRole('button', { name: /^Filtrar/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filtrar' });
  await sheet.getByRole('button', { name: /Ródio negro/ }).click();
  await sheet.getByRole('button', { name: /^Ver \d+ peças?$/ }).click();
  await expect(page).toHaveURL(/acabamento=rodio-negro/);
  await page.getByRole('link', { name: 'Argola Cravejada Ródio Negro' }).click();
  const before = await page.evaluate(() => history.length);
  await expect(back('Catálogo')).toHaveAttribute('href', /acabamento=rodio-negro/);
  await back('Catálogo').click();
  await expect(page).toHaveURL(/\/catalogo\?.*acabamento=rodio-negro/);
  await expect(page.getByRole('button', { name: 'Remover filtro Ródio negro' })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(before);

  // Switching categories with the chips never makes "Voltar" lead to the other category.
  await page.locator('nav[aria-label="Categorias"]').getByRole('link', { name: 'Brincos' }).click();
  await page.locator('nav[aria-label="Categorias"]').getByRole('link', { name: 'Anéis' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Anéis' })).toBeVisible();
  await expect(back('Catálogo')).toBeVisible();

  // From the home page, a piece says where "Voltar" goes.
  await open(page, '/');
  await page.locator('main a[href^="/produto/"]').first().click();
  await expect(page).toHaveURL(/\/produto\//);
  await back('Início').click();
  await expect(page).toHaveURL(/\/$/);
});
