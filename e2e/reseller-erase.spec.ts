import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ADMIN_STATE } from './admin-session.setup';

/*
 * The owner ends a partnership and erases the reseller's data (LGPD) through the panel, as she would
 * on her phone: the block only appears once the partnership ended, the spreadsheet of settlements
 * downloads, the confirmation needs "não dá para desfazer", and afterwards nothing of her is left
 * (list, detail, showcase).
 */

test.use({ storageState: ADMIN_STATE });

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

/** The run's admin session (e2e/admin-session.setup.ts): no PIN typed, so the panel's attempt cap is never hit. */
async function unlock(page: Page) {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /^(Início|Produtos|Pedidos)$/, level: 1 })).toBeVisible();
}

test('admin: ends a partnership and erases the reseller data for good', async ({ page }, testInfo) => {
  await page.goto('/admin');
  await unlock(page);
  // A reseller of her own per browser project (they run in parallel on one server).
  const tag = testInfo.project.name.replace(/\W/g, '').slice(0, 10);
  const name = `Rita Saída ${tag} ${randomUUID().slice(0, 4)}`;
  const whatsapp = `659${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const created = await page.request.post('/api/admin/resellers', {
    data: { name, whatsapp, city: 'Cuiabá', uf: 'MT' },
    headers: { 'Idempotency-Key': randomUUID(), Origin: new URL(page.url()).origin },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { reseller } = await created.json();

  await page.goto('/admin/revendedoras');
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  const detail = page.getByRole('dialog', { name });
  await expect(detail).toBeVisible();
  // While she is active there is nothing to erase.
  await detail.getByRole('tab', { name: 'Dados' }).click();
  await expect(detail.getByRole('heading', { name: 'Dados pessoais' })).toHaveCount(0);

  await detail.getByRole('button', { name: 'Encerrar parceria' }).click();
  await page.getByRole('dialog', { name: 'Encerrar a parceria?' }).getByRole('button', { name: 'Encerrar parceria' }).click();
  await expect(detail.getByRole('heading', { name: 'Dados pessoais' })).toBeVisible();

  await detail.getByRole('button', { name: /^Apagar os dados de Rita/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Apagar os dados de Rita?' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('as vendas dela, com os nomes e telefones das clientes');
  await expect(confirm).toContainText(`/r/${reseller.slug}`);
  await page.waitForTimeout(400); // the dialog fades in: measure contrast once it is fully opaque
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);

  const forever = confirm.getByRole('button', { name: 'Apagar para sempre' });
  await expect(forever).toBeDisabled();
  await confirm.getByRole('checkbox', { name: 'Entendo que não dá para desfazer.' }).check();
  await forever.click();
  await expect(page.getByText('Dados de Rita apagados.')).toBeVisible();

  // Gone from the list and from the server; her showcase is gone too.
  await expect(page.getByRole('button', { name: new RegExp(name) })).toHaveCount(0);
  expect((await page.request.get(`/api/admin/resellers/${reseller.id}`)).status()).toBe(404);
  await page.goto(`/r/${reseller.slug}`);
  await expect(page.getByRole('heading', { name: 'Mostruário não encontrado' })).toBeVisible();
});

test('admin: the settlements spreadsheet downloads before erasing', async ({ page }, testInfo) => {
  await page.goto('/admin');
  await unlock(page);
  const origin = new URL(page.url()).origin;
  const name = `Teca Acertos ${randomUUID().slice(0, 4)}`;
  const created = await page.request.post('/api/admin/resellers', {
    data: { name, whatsapp: `659${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, city: 'Cuiabá', uf: 'MT' },
    headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { reseller } = await created.json();
  // One closed cycle: a one-piece kit settled at once with the piece back (nothing sold, nothing owed).
  // Each browser project takes its own plain product (they run in parallel on one server).
  const catalog = await (await page.request.get('/api/catalog')).json();
  type P = { id: string; available: boolean; variants: { id: string; available: boolean; sizes?: string[] }[] };
  const plain = (catalog.products as P[]).filter((x) => x.available && x.variants.every((v) => v.available && !v.sizes?.length) && !catalog.stock?.[x.id]);
  const p = plain[(testInfo.parallelIndex + 3) % plain.length]!;
  const opened = await page.request.post(`/api/admin/resellers/${reseller.id}/kits`, { data: { items: [{ productId: p.id, variantId: p.variants[0]!.id, qty: 1 }] }, headers: { Origin: origin } });
  expect(opened.status(), await opened.text()).toBe(201);
  const { kit } = await opened.json();
  expect((await page.request.post(`/api/admin/kits/${kit.id}/settle`, { data: { updatedAt: kit.updatedAt, returned: [{ productId: p.id, variantId: p.variants[0]!.id, size: '', qty: 1 }] }, headers: { Origin: origin } })).status()).toBe(200);
  const fresh = await (await page.request.get(`/api/admin/resellers/${reseller.id}`)).json();
  expect((await page.request.patch(`/api/admin/resellers/${reseller.id}`, { data: { updatedAt: fresh.reseller.updatedAt, status: 'encerrada' }, headers: { Origin: origin } })).status()).toBe(200);

  await page.goto('/admin/revendedoras');
  // Ended partnerships sit under their own fold.
  await page.getByText(/Parcerias encerradas/).click();
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByRole('tab', { name: 'Dados' }).click();
  await page.getByRole('button', { name: /^Apagar os dados de Teca/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Apagar os dados de Teca?' });
  const download = page.waitForEvent('download');
  await confirm.getByRole('button', { name: 'Baixar os acertos (planilha)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(new RegExp(`^eka-acertos-${reseller.slug}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
  const csv = readFileSync((await file.path())!, 'utf8');
  expect(csv).toContain('Revendedora;Maleta aberta em;Acerto em;Vendido');
  expect(csv).toContain(name);
  await expect(confirm.getByRole('button', { name: 'Baixar de novo' })).toBeVisible();
  // Leaving without confirming keeps everything.
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  expect((await page.request.get(`/api/admin/resellers/${reseller.id}`)).status()).toBe(200);
});
