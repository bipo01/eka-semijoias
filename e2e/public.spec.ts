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

test('add to bag and build the WhatsApp order', async ({ page, isMobile }) => {
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
  await dialog.getByPlaceholder('Seu nome').fill('Ana');
  await dialog.getByPlaceholder('Cidade').fill('Campo Grande/MS');
  const href = await dialog.getByRole('link', { name: 'Enviar pedido pelo WhatsApp' }).getAttribute('href');
  const text = decodeURIComponent(href!.split('text=')[1]!);
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(text).toBe(
    'Olá! Gostaria de fazer este pedido:\n\n1) Anel Solitário Delicado — Dourado — aro 16 — 2 un. — R$ 279,80\n\nTotal: R$ 279,80\nNome: Ana · Cidade: Campo Grande/MS',
  );
  // Remove with undo
  await dialog.getByRole('button', { name: 'Remover Anel Solitário Delicado' }).click();
  await expect(dialog.getByText('Sua sacola está vazia')).toBeVisible();
  await dialog.getByRole('button', { name: 'Desfazer' }).click();
  await expect(dialog.getByText('Anel Solitário Delicado')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // The cart and customer survive a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: /Sacola, 2 itens/ })).toBeVisible();
});

test('catalog filters live in the URL and survive back navigation', async ({ page }) => {
  await open(page, '/catalogo');
  await page.getByRole('button', { name: /^Filtrar/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filtrar' });
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
  await page.getByRole('textbox', { name: /WhatsApp/ }).fill('67999991234');
  await expect(page.getByRole('textbox', { name: /WhatsApp/ })).toHaveValue('(67) 99999-1234');
  await page.getByRole('textbox', { name: /Cidade/ }).fill('Campo Grande');
  await page.getByRole('combobox', { name: /UF/ }).selectOption('MS');
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

test('menu drawer is keyboard accessible and returns focus', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile drawer');
  await open(page, '/');
  const trigger = page.getByRole('button', { name: 'Abrir menu' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Brincos a partir de R\$ 49,90/ })).toBeVisible();
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
