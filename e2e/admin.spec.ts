import { expect, test } from '@playwright/test';

test('admin: PIN gate, edit a price and see it on the public site', async ({ page }) => {
  await page.goto('#/admin');
  await expect(page.getByRole('heading', { name: 'Painel ÉKA' })).toBeVisible();
  const text = (await page.locator('body').innerText()).toLowerCase();
  for (const word of ['demonstra', 'não é segur', 'área da érika']) expect(text).not.toContain(word);

  for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/PIN/);
  for (const d of '2580') await page.keyboard.press(d);
  await expect(page.getByText(/Espaço usado/)).toBeVisible();

  await page.getByRole('link', { name: 'Brinco Pérola Clássico' }).click();
  const price = page.getByRole('textbox', { name: /^Preço/ }).first();
  await price.fill('74,90');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText(/salv/i).first()).toBeVisible();

  await page.goto('#/produto/brinco-perola-classico');
  await expect(page.getByRole('heading', { level: 1, name: 'Brinco Pérola Clássico' })).toBeVisible();
  await expect(page.locator('main').getByText('R$ 74,90').first()).toBeVisible();
});

test('admin: usable at 360px without horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('./#/admin');
  for (const d of '2580') await page.getByRole('button', { name: d, exact: true }).click();
  for (const section of ['produtos', 'categorias', 'colecoes', 'revendedoras', 'configuracoes', 'backup', 'produtos/prod-p01']) {
    await page.goto(`./#/admin/${section}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, section).toBeLessThanOrEqual(0);
  }
  await context.close();
});
