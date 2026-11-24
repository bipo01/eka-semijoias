import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { warrantyUntil } from '../src/data/customers';

const PIN = '314159'; // ADMIN_INITIAL_PIN of the local E2E server (playwright.config.ts)

// Each test logs in from its own network, so parallel runs never trip the per-IP login throttle.
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

async function unlock(page: Page) {
  await page.getByRole('group', { name: 'Teclado do PIN' }).waitFor();
  for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pedidos', level: 1 })).toBeVisible();
}

// A piece no other spec renames, reprices or puts under stock control (no sizes: one tap to add).
const PIECE = 'Brinco Pérola Mini';

test('customers: register a customer, sell to her and open "Compra registrada" with the warranty date', async ({ page }, testInfo) => {
  const tag = `${testInfo.project.name.replace(/[^a-z]/gi, '')}${Date.now().toString(36)}`;
  const name = `Cliente ${tag}`;
  const digits = `679${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

  await page.goto('/admin');
  await unlock(page);
  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();

  // Nova cliente
  await page.getByRole('button', { name: 'Nova cliente' }).click();
  const form = page.getByRole('dialog', { name: 'Nova cliente' });
  await form.getByRole('textbox', { name: /^Nome da cliente/ }).fill(name);
  await form.getByRole('textbox', { name: /^WhatsApp/ }).fill(digits);
  await expect(form.getByRole('textbox', { name: /^WhatsApp/ })).toHaveValue(`(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`);
  await form.getByRole('textbox', { name: /^Cidade/ }).fill('Dourados');
  await form.getByRole('textbox', { name: /^UF/ }).fill('ms');
  await form.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await expect(page.getByText('Cliente cadastrada.', { exact: true })).toBeVisible();

  // Her record opens; the search finds her without accents or by number.
  const record = page.getByRole('dialog', { name });
  await expect(record.getByText('Dourados/MS')).toBeVisible();
  await expect(record.getByRole('link', { name: 'Conversar no WhatsApp' })).toHaveAttribute('href', new RegExp(`^https://wa\\.me/55${digits}`));
  await record.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar cliente' }).fill(digits.slice(-6));
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();

  // Novo pedido for her, confirmed
  await page.getByRole('link', { name: /^Pedidos/ }).click();
  await page.getByRole('button', { name: 'Novo pedido' }).click();
  const order = page.getByRole('dialog', { name: 'Novo pedido' });
  await order.getByRole('searchbox', { name: 'Buscar peça' }).fill('Pérola Mini'); // the piece picker starts open
  await order.getByRole('list', { name: 'Peças do catálogo' }).getByRole('button', { name: new RegExp(PIECE) }).first().click();
  await order.getByRole('button', { name: 'Adicionar ao pedido' }).click();
  await order.getByRole('searchbox', { name: 'Buscar cliente cadastrada' }).fill(tag);
  await order.getByRole('list', { name: 'Clientes encontradas' }).getByRole('button', { name: new RegExp(name) }).click();
  await expect(order.getByText(name)).toBeVisible();
  await order.getByRole('button', { name: 'Registrar pedido' }).click();
  const done = page.getByText(/Pedido nº \d+ registrado e confirmado\./);
  await expect(done).toBeVisible();
  const number = /nº (\d+)/.exec(await done.innerText())![1]!;

  // "Compra registrada" opens by itself, addressed to her chat, with the warranty end date.
  const purchase = page.getByRole('dialog', { name: 'Compra registrada' });
  await expect(purchase).toBeVisible();
  await expect(purchase.getByText(/o envio é com você/)).toBeVisible();
  const message = purchase.getByRole('textbox', { name: 'Mensagem para a cliente' });
  await expect(message).toHaveValue(new RegExp(`• ${PIECE}`));
  await expect(message).toHaveValue(new RegExp(`Garantia: 6 meses, até ${warrantyUntil(Date.now(), 6).replace(/\//g, '\\/')}\\.`));
  await expect(purchase.getByRole('link', { name: 'Enviar no WhatsApp' })).toHaveAttribute('href', new RegExp(`^https://wa\\.me/55${digits}\\?text=`));
  await purchase.getByRole('button', { name: 'Fechar', exact: true }).click();

  // The order shows her record (the message is in "Enviar mensagem" too); her record lists the purchase.
  const detail = page.getByRole('dialog', { name: `Pedido nº ${number}` });
  await expect(detail.getByText(name).first()).toBeVisible();
  await detail.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();
  const herRecord = page.getByRole('dialog', { name });
  await expect(herRecord.getByRole('link', { name: new RegExp(`nº ${number}`) })).toBeVisible();
  await expect(herRecord.getByRole('definition').filter({ hasText: /^1$/ })).toBeVisible(); // Compras: 1
});

test('customers: accessible and without horizontal overflow at 360px (list, record, new customer)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.251.${Math.floor(Math.random() * 250)}.1` });
  const page = await context.newPage();
  const check = async (what: string) => {
    await page.waitForTimeout(300); // let transitions settle before measuring contrast
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, what).toBeLessThanOrEqual(0);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`), what).toEqual([]);
  };
  await page.goto('/admin');
  await unlock(page);
  await page.goto('/admin/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await check('list');
  await page.getByRole('button', { name: 'Nova cliente' }).click();
  const form = page.getByRole('dialog', { name: 'Nova cliente' });
  await form.getByRole('textbox', { name: /^Nome da cliente/ }).fill('Helena Acessível de Sobrenome Comprido');
  await form.getByRole('textbox', { name: /^Cidade/ }).fill('São Gabriel do Oeste');
  await form.getByRole('textbox', { name: /^Instagram/ }).fill('helena.acessivel');
  await check('new customer');
  await form.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await expect(page.getByRole('dialog', { name: 'Helena Acessível de Sobrenome Comprido' }).getByRole('button', { name: 'Editar dados' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await check('record');
  await context.close();
});
