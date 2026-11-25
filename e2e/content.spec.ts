import { expect, test, type Page } from '@playwright/test';

/*
 * Site content edited in Painel → Site (docs/conteudo/PLAN.md): a testimonial
 * added in the admin reaches an open visitor page live, deleting it removes the
 * section (and its data from the public catalog), and "Restaurar o texto original" brings the built-in state back.
 * The writes run in one project only: the four projects share one database and
 * the same section edited in parallel would (correctly) conflict.
 */

const PIN = '314159'; // ADMIN_INITIAL_PIN of the local E2E server (playwright.config.ts)

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

async function unlock(page: Page) {
  await page.getByRole('group', { name: 'Teclado do PIN' }).waitFor();
  for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();
}

test('site content: a testimonial added in the admin shows live, is deleted and the section restored', async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'writes run in one project (shared database)');
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto('/');
  await expect(visitor.getByRole('heading', { name: 'Brilho que acompanha você', level: 1 })).toBeVisible();
  // The built-in site has no testimonials at all.
  await expect(visitor.getByRole('heading', { name: 'Quem usa, recomenda' })).toHaveCount(0);

  await page.goto('/admin');
  await unlock(page);
  await page.goto('/admin/site');
  await page.getByRole('button', { name: 'Editar depoimentos' }).click();
  const editor = page.getByRole('dialog', { name: 'Depoimentos' });
  await editor.getByRole('button', { name: 'Novo depoimento' }).click();
  await editor.getByRole('textbox', { name: /O que a cliente disse/ }).fill('Uso a argola todos os dias e continua linda.');
  await editor.getByRole('textbox', { name: /^Nome/ }).fill('Bruna S.');
  await editor.getByRole('textbox', { name: /^Cidade/ }).fill('Cuiabá/MT');

  // Without the customer's authorization it is not saved.
  await editor.getByRole('button', { name: 'Salvar' }).click();
  await expect(editor.getByText('Confirme que a cliente autorizou publicar.')).toBeVisible();
  await editor.getByRole('checkbox', { name: /A cliente autorizou publicar este depoimento/ }).check();
  await editor.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Depoimentos: alterações salvas/)).toBeVisible();

  // Live on the open visitor page, without reload.
  const section = visitor.getByRole('region', { name: 'Quem usa, recomenda' });
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(section.getByText('Uso a argola todos os dias e continua linda.')).toBeVisible();
  await expect(section.getByText(/Bruna S\..*Cuiabá\/MT/)).toBeVisible();
  // A lone testimonial sits centered (not on the left, as if waiting for the next one), on a computer and on a phone.
  const gaps = () =>
    section.getByRole('listitem').evaluate((li) => {
      const r = li.getBoundingClientRect();
      return { left: r.left, right: document.documentElement.clientWidth - r.right };
    });
  for (const size of [null, { width: 390, height: 844 }]) {
    if (size) await visitor.setViewportSize(size);
    const g = await gaps();
    expect(Math.abs(g.left - g.right), JSON.stringify(g)).toBeLessThan(2);
  }

  // Deleted (there is no "hidden" state: the public catalog would still carry it): gone from the site.
  await editor.getByRole('button', { name: /Apagar Bruna S\.|Apagar depoimento 1/ }).click();
  await page.getByRole('dialog', { name: /Apagar/ }).getByRole('button', { name: /Apagar/ }).click();
  await editor.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Depoimentos: alterações salvas/).last()).toBeVisible();
  await expect(visitor.getByRole('heading', { name: 'Quem usa, recomenda' })).toHaveCount(0, { timeout: 15_000 });
  const published = await (await page.request.get('/api/catalog')).json();
  expect(JSON.stringify(published)).not.toContain('Bruna S.');

  // Back to the built-in state.
  await editor.getByRole('button', { name: /Restaurar o texto original/ }).click();
  await page.getByRole('dialog', { name: 'Restaurar o texto original?' }).getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText(/Depoimentos: o site voltou ao texto original/)).toBeVisible();
  await expect(editor.getByText('Nenhum depoimento ainda.', { exact: false })).toBeVisible();
  await visitorContext.close();
});

test('site content: the privacy policy is one tap away from every page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacidade' }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Política de\s*privacidade/);
  await expect(page.getByRole('heading', { name: 'Seus direitos', level: 2 })).toBeVisible();
  await expect(page.getByText(/Atualizada em \d{1,2} de [a-zç]+ de \d{4}/)).toBeVisible();
});
