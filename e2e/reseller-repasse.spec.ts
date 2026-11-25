import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { ADMIN_STATE } from './admin-session.setup';

/*
 * Repasse (the owner's choice: the customer pays the reseller). After the settlement the reseller
 * sees what she owes with the store's Pix carrying the exact amount, says she paid, and the owner
 * sees it and confirms it — two browsers, as on two phones.
 */

test.use({ storageState: ADMIN_STATE });

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
// The page's currency text uses a no-break space; match either.
const money = (cents: number) => new RegExp(brl(cents).replace(/\s/g, '\\s').replace('$', '\\$'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API payloads, checked field by field
async function ok(r: Awaited<ReturnType<APIRequestContext['get']>>): Promise<any> {
  expect(r.ok(), `${r.url()} → ${r.status()} ${await r.text()}`).toBe(true);
  return r.json();
}

/** The store's static Pix (other specs may set it too; a conflict means someone else just saved). */
async function ensureStorePix(api: APIRequestContext, origin: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cat = await ok(await api.get('/api/catalog'));
    if (cat.settings.pix) return cat.settings.pix as { key: string; name: string };
    const r = await api.post('/api/admin/changes', { data: { baseVersion: cat.version, changes: [{ kind: 'settings', op: 'upsert', data: { ...cat.settings, pix: { key: '+5565999998888', name: 'EKA SEMIJOIAS', city: 'CUIABA' } } }] }, headers: { Origin: origin } });
    if (r.status() !== 409) await ok(r);
  }
  throw new Error('could not set the store Pix');
}

async function unlock(page: Page) {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /^(Início|Produtos|Pedidos)$/, level: 1 })).toBeVisible();
}

test('repasse: she sees the amount and the store Pix, says she paid, the owner confirms', async ({ page, browser }, testInfo) => {
  await page.context().setExtraHTTPHeaders({ 'CF-Connecting-IP': ip() });
  await unlock(page);
  const origin = new URL(page.url()).origin;
  const api = page.request;
  const pix = await ensureStorePix(api, origin);

  // A reseller of her own per browser project (they run in parallel on one server), with a one-piece kit.
  const name = `Lara Repasse ${testInfo.project.name.replace(/\W/g, '').slice(0, 8)} ${randomUUID().slice(0, 4)}`;
  const whatsapp = `659${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const { reseller, invite } = await ok(await api.post('/api/admin/resellers', { data: { name, whatsapp, city: 'Cuiabá', uf: 'MT' }, headers: { 'Idempotency-Key': randomUUID(), Origin: origin } }));
  const catalog = await ok(await api.get('/api/catalog'));
  type P = { id: string; price: number; promoPrice?: number; available: boolean; variants: { id: string; available: boolean; sizes?: string[] }[] };
  const plain = (catalog.products as P[]).filter((x) => x.available && x.variants.every((v) => v.available && !v.sizes?.length) && !catalog.stock?.[x.id]);
  const p = plain[(testInfo.parallelIndex + 7) % plain.length]!;
  const price = p.promoPrice ?? p.price;
  const { kit } = await ok(await api.post(`/api/admin/resellers/${reseller.id}/kits`, { data: { items: [{ productId: p.id, variantId: p.variants[0]!.id, qty: 1 }] }, headers: { Origin: origin } }));

  // Her phone: first access, then one sale at the kit price.
  const herContext = await browser.newContext({ ...testInfo.project.use, storageState: undefined, extraHTTPHeaders: { 'CF-Connecting-IP': ip() } });
  const her = await herContext.newPage();
  await her.goto('/revenda');
  const view = await ok(await her.request.get(`/api/revenda/invite/${invite.token}`));
  await ok(await her.request.post(`/api/revenda/invite/${invite.token}`, { data: { pin: '402817', contract: { version: view.contract.version, typedName: view.name } }, headers: { Origin: origin } }));
  await ok(await her.request.post('/api/revenda/sales', { data: { lines: [{ productId: p.id, variantId: p.variants[0]!.id, size: '', qty: 1, unitCents: price }], payment: 'pix' }, headers: { Origin: origin, 'Idempotency-Key': randomUUID() } }));

  // During the cycle, her summary says how much goes to the store.
  await her.goto('/revenda/painel');
  await expect(her.getByText('Para a ÉKA no acerto')).toBeVisible();

  // The owner settles; the kit comes back empty.
  const fresh = await ok(await api.get(`/api/admin/resellers/${reseller.id}`));
  const { kit: closed } = await ok(await api.post(`/api/admin/kits/${kit.id}/settle`, { data: { updatedAt: fresh.kits[0].updatedAt, returned: [] }, headers: { Origin: origin } }));
  const due = closed.settlement.dueCents as number;
  expect(due).toBe(price - closed.settlement.commissionCents);

  // Her panel: the repasse card with the exact amount in the Pix code.
  await her.reload();
  const card = her.getByRole('region', { name: 'Repasse do acerto' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(money(due));
  const code = await card.getByRole('textbox').inputValue();
  expect(code).toContain(`54${String((due / 100).toFixed(2).length).padStart(2, '0')}${(due / 100).toFixed(2)}`);
  expect(code).toContain(pix.key);
  await expect(card.getByRole('img', { name: /QR Code Pix de/ })).toBeVisible();
  const receipt = card.getByRole('link', { name: 'Enviar comprovante no WhatsApp' });
  expect(decodeURIComponent((await receipt.getAttribute('href'))!).replace(/\s/g, ' ')).toContain(`Fiz o repasse de ${brl(due).replace(/\s/g, ' ')}`);
  const violations = (await new AxeBuilder({ page: her }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);

  await card.getByRole('button', { name: 'Já fiz o repasse' }).click();
  await expect(her.getByText('Pronto! A ÉKA recebeu o seu aviso.')).toBeVisible();
  await expect(card).toContainText('Você avisou que pagou');
  await expect(card.getByRole('button', { name: 'Já fiz o repasse' })).toHaveCount(0);
  await her.reload();
  await expect(her.getByRole('region', { name: 'Repasse do acerto' })).toContainText('Você avisou que pagou');

  // The owner sees it in the list and in her sheet, clears it once (money not there yet)…
  await page.goto('/admin/revendedoras');
  const row = page.getByRole('button', { name: new RegExp(name) }).first();
  await expect(row).toContainText('Avisou que fez o repasse');
  await row.click();
  const detail = page.getByRole('dialog', { name });
  await expect(detail.getByText(/Ela avisou que pagou em/)).toBeVisible();
  await detail.getByRole('button', { name: 'Desfazer aviso' }).click();
  await expect(page.getByText('Aviso desfeito.', { exact: false })).toBeVisible();
  await her.reload();
  await expect(her.getByRole('region', { name: 'Repasse do acerto' }).getByRole('button', { name: 'Já fiz o repasse' })).toBeVisible();

  // …she reports again, and the owner confirms the money.
  await her.getByRole('region', { name: 'Repasse do acerto' }).getByRole('button', { name: 'Já fiz o repasse' }).click();
  await expect(her.getByRole('region', { name: 'Repasse do acerto' })).toContainText('Você avisou que pagou');
  await page.reload();
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  const sheet = page.getByRole('dialog', { name });
  await expect(sheet.getByText(/Ela avisou que pagou em/)).toBeVisible();
  await sheet.getByRole('switch', { name: 'Repasse recebido' }).click();
  await expect(sheet.getByText(/ela avisou em/)).toBeVisible();

  // Her panel: the card is gone; the history says received.
  await her.reload();
  await expect(her.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(her.getByRole('region', { name: 'Repasse do acerto' })).toHaveCount(0);
  await her.getByRole('button', { name: 'Acertos' }).click();
  await expect(her.getByText(/recebido em \d{2}\/\d{2}/)).toBeVisible();
  await herContext.close();
});
