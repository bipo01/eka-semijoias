import { expect, test, type Page } from '@playwright/test';

/*
 * Estoque: register an entry (which turns stock control on) and an exit through the
 * "Registrar entrada / saída" sheet, then see the numbers, the public stock and the history.
 */

const PIN = '314159'; // ADMIN_INITIAL_PIN of the local E2E server (playwright.config.ts)

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

async function unlock(page: Page) {
  await page.getByRole('group', { name: 'Teclado do PIN' }).waitFor();
  for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: /^(Início|Produtos|Pedidos)$/, level: 1 })).toBeVisible();
}

// Parallel browser projects share one server: each project moves its own product (none of them is
// used by the other specs). `size` is the chip to pick when the piece has sizes.
const MOVE_PRODUCT: Record<string, { id: string; name: string; size?: { group: string; chip: string; value: string } }> = {
  'mobile-chromium': { id: 'prod-p20', name: 'Anel Aparador Ródio Negro', size: { group: 'Aro', chip: 'aro 16', value: '16' } },
  'desktop-chromium': { id: 'prod-p23', name: 'Choker Riviera Prateada' },
  'mobile-webkit': { id: 'prod-p21', name: 'Pulseira Elos Rosé' },
  'desktop-webkit': { id: 'prod-p24', name: 'Pulseira Riviera Prateada', size: { group: 'Tamanho', chip: 'tam. M', value: 'M' } },
};

async function fillMove(page: Page, kind: 'entrada' | 'saida', product: (typeof MOVE_PRODUCT)[string], qty: number, motive: string, note?: string) {
  await page.getByRole('button', { name: kind === 'entrada' ? 'Registrar entrada' : 'Registrar saída', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: kind === 'entrada' ? 'Registrar entrada' : 'Registrar saída' });
  await sheet.getByRole('searchbox', { name: 'Buscar peça' }).fill(product.name);
  await sheet.getByRole('button', { name: new RegExp(`^${product.name}`) }).click();
  if (product.size) await sheet.getByRole('group', { name: product.size.group }).getByRole('button', { name: product.size.chip, exact: true }).click();
  await sheet.getByRole('textbox', { name: 'Quantidade' }).fill(String(qty));
  await sheet.getByRole('group', { name: 'Motivo' }).getByRole('button', { name: motive, exact: true }).click();
  if (note) await sheet.getByRole('textbox', { name: /Observação/ }).fill(note);
  return sheet;
}

test('stock: register an entry and an exit, see the numbers, the public stock and the history', async ({ page }, testInfo) => {
  const product = MOVE_PRODUCT[testInfo.project.name] ?? MOVE_PRODUCT['desktop-chromium']!;
  await page.goto('/admin');
  await unlock(page);
  await page.goto('/admin/estoque');
  await expect(page.getByRole('region', { name: 'Resumo do estoque' })).toContainText('Valor em estoque');
  const row = page.getByRole('button', { name: new RegExp(product.name) }).first();
  await expect(row).toContainText('Sem controle de estoque');

  // 1. An entry on a piece without stock control turns control on.
  let sheet = await fillMove(page, 'entrada', product, 5, 'Compra do fornecedor', 'NF 123');
  await expect(sheet.getByText(/o controle liga/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Registrar entrada de 5' }).click();
  await expect(page.getByText(/Entrada registrada: .+, fica 5\. Controle de estoque ligado\./)).toBeVisible();
  await expect(row).toContainText('5 em casa');

  // 2. An exit larger than the stock is refused; a smaller one goes through.
  sheet = await fillMove(page, 'saida', product, 9, 'Brinde', 'sorteio');
  await expect(sheet.getByText('Em casa agora: 5')).toBeVisible();
  await sheet.getByRole('button', { name: 'Registrar saída de 9' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Só há 5 em estoque.');
  await sheet.getByRole('textbox', { name: 'Quantidade' }).fill('2');
  await sheet.getByRole('button', { name: 'Registrar saída de 2' }).click();
  await expect(page.getByText(/Saída registrada: .+, fica 3\./)).toBeVisible();
  await expect(row).toContainText('3 em casa');

  // 3. The public catalog carries the new stock.
  const pub = (await (await page.request.get('/api/catalog')).json()) as { stock?: Record<string, Record<string, number>> };
  const variantKey = Object.keys(pub.stock?.[product.id] ?? {}).find((k) => k.endsWith(`|${product.size?.value ?? ''}`));
  expect(variantKey && pub.stock![product.id]![variantKey]).toBe(3);

  // 4. The history shows both, with the motive and the note; the reason filter narrows it.
  const history = page.getByRole('region', { name: 'Histórico' });
  const mine = history.getByRole('listitem').filter({ hasText: product.name });
  await expect(mine.filter({ hasText: 'Compra do fornecedor — NF 123' })).toContainText('+5');
  await expect(mine.filter({ hasText: 'Brinde — sorteio' })).toContainText('-2');
  await history.getByRole('group', { name: 'Filtrar histórico por motivo' }).getByRole('button', { name: /^Saída/ }).click();
  await expect(mine.filter({ hasText: 'Brinde — sorteio' })).toBeVisible();
  await expect(mine.filter({ hasText: 'Compra do fornecedor' })).toHaveCount(0);

  // 5. The piece's own sheet shows where the units are; turning control off cleans up.
  await row.click();
  const panel = page.getByRole('region', { name: product.name });
  await expect(panel.getByRole('region', { name: 'Onde estão as peças' })).toContainText('3 em casa');
  await panel.getByRole('switch', { name: 'Controlar estoque desta peça' }).click();
  await panel.getByRole('button', { name: 'Salvar estoque' }).click();
  await page.getByRole('dialog', { name: 'Desligar o controle de estoque?' }).getByRole('button', { name: 'Desligar' }).click();
  await expect(page.getByText('Controle de estoque desligado.')).toBeVisible();
  await expect(row).toContainText('Sem controle de estoque');
});
