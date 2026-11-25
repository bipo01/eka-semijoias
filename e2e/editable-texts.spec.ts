import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { ADMIN_STATE } from './admin-session.setup';

/*
 * Painel → Site → "Pagamento e revenda": the owner changes the texts of the payment page and of the
 * reseller panel, saves, and the customer / reseller sees them (a variable like {total} is filled in);
 * "Restaurar o texto original" brings the built-in text back. The two sections are shared by every
 * browser project of this run, so the whole file runs one test at a time.
 */

test.describe.configure({ mode: 'serial' });

test.use({ storageState: ADMIN_STATE });

test.beforeEach(async ({ context }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'edits shared site sections: one browser project only (her phone)');
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

/** The run's admin session (e2e/admin-session.setup.ts): no PIN typed, so the panel's attempt cap is never hit. */
async function unlock(page: Page) {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /^(Início|Produtos|Pedidos)$/, level: 1 })).toBeVisible();
}

/** A confirmed order with a Pix charge; returns the payment link token and the amount. */
async function chargedOrder(api: APIRequestContext, origin: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API payloads, checked field by field
  const ok = async (r: Awaited<ReturnType<APIRequestContext['get']>>): Promise<any> => {
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const cat = await ok(await api.get('/api/catalog'));
  if (!cat.settings.pix) {
    await ok(await api.post('/api/admin/changes', { data: { baseVersion: cat.version, changes: [{ kind: 'settings', op: 'upsert', data: { ...cat.settings, pix: { key: '+5565999998888', name: 'EKA SEMIJOIAS', city: 'CUIABA' } } }] }, headers: { Origin: origin } }));
  }
  type P = { id: string; available: boolean; variants: { id: string; available: boolean; sizes?: string[] }[] };
  const p = (cat.products as P[]).find((x) => x.available && x.variants.every((v) => v.available && !v.sizes?.length) && !cat.stock?.[x.id])!;
  const placed = await ok(await api.post('/api/orders', { data: { items: [{ productId: p.id, variantId: p.variants[0]!.id, qty: 1 }], name: 'Bia Lima', city: 'Cuiabá' }, headers: { Origin: origin, 'Idempotency-Key': randomUUID() } }));
  const order = (await ok(await api.get('/api/admin/orders'))).orders.find((o: { number: number }) => o.number === placed.order.number);
  await ok(await api.post(`/api/admin/orders/${order.id}/status`, { data: { from: 'enviado', to: 'confirmado' }, headers: { Origin: origin } }));
  const charged = await ok(await api.post(`/api/admin/orders/${order.id}/charge`, { data: { shippingCents: 1000, discountCents: 0 }, headers: { Origin: origin } }));
  return { token: charged.order.charge.token as string, amountCents: charged.order.charge.amountCents as number };
}

const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100).replace(/\s/g, ' ');

async function editSection(page: Page, id: 'pagamento' | 'revenda', fields: { group: string; label: string; value: string }[]) {
  await page.goto(`/admin/site?secao=${id}`);
  const editor = page.getByRole('dialog');
  for (const f of fields) {
    const input = editor.getByRole('region', { name: f.group, exact: true }).getByRole('textbox', { name: new RegExp(`^${f.label}`) });
    await input.fill(f.value);
  }
  await editor.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/salv/i).first()).toBeVisible();
}

async function restore(page: Page, id: 'pagamento' | 'revenda') {
  await page.goto(`/admin/site?secao=${id}`);
  await page.getByRole('dialog').getByRole('button', { name: /Restaurar o texto original/ }).click();
  await page.getByRole('dialog', { name: 'Restaurar o texto original?' }).getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Restaurar o texto original/ })).toHaveCount(0);
}

test('payment page: her texts replace the built-in ones, with the amount filled in', async ({ page }) => {
  await unlock(page);
  const origin = new URL(page.url()).origin;
  const { token, amountCents } = await chargedOrder(page.request, origin);

  await page.goto(`/pagamento/${token}`);
  await expect(page.getByRole('heading', { name: 'Pague com Pix' })).toBeVisible();

  await editSection(page, 'pagamento', [
    { group: 'Pix', label: 'Título', value: 'Pagamento rapidinho no Pix' },
    { group: 'Pix', label: 'Passo 2', value: 'Confira se o valor é {total} antes de pagar.' },
  ]);
  await page.goto(`/pagamento/${token}`);
  await expect(page.getByRole('heading', { name: 'Pagamento rapidinho no Pix' })).toBeVisible();
  await expect(page.getByText(`Confira se o valor é ${brl(amountCents)} antes de pagar.`)).toBeVisible();
  await expect(page.getByText('Pague com Pix')).toHaveCount(0);

  await restore(page, 'pagamento');
  await page.goto(`/pagamento/${token}`);
  await expect(page.getByRole('heading', { name: 'Pague com Pix' })).toBeVisible();
});

test('reseller panel: her texts show on the login screen', async ({ page, browser }) => {
  await unlock(page);
  const before = await browser.newPage();
  await before.goto('/revenda');
  const builtIn = (await before.getByRole('heading', { level: 1 }).first().innerText()).trim();
  await before.close();

  await editSection(page, 'revenda', [{ group: 'Entrar', label: 'Título', value: 'Bem-vinda de volta, revendedora' }]);
  const reseller = await browser.newPage();
  await reseller.goto('/revenda');
  await expect(reseller.getByRole('heading', { name: 'Bem-vinda de volta, revendedora' })).toBeVisible();
  await reseller.close();

  await restore(page, 'revenda');
  const after = await browser.newPage();
  await after.goto('/revenda');
  await expect(after.getByRole('heading', { level: 1 }).first()).toHaveText(builtIn);
  await after.close();
});
