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
  // Any page of the panel: Início, a section, or a detail page (its h1 is the item's name).
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Teclado do PIN' })).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();
  // Início: what needs her and the shortcuts; the bottom bar (phone) or the sidebar (desktop) leads on.
  await expect(page.getByRole('heading', { name: 'Precisa de você' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nova peça' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Produtos', exact: true }).click();
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
  for (const section of ['pedidos', 'clientes', 'produtos', 'estoque', 'relatorio', 'mensagens', 'site', 'site?secao=inicio', 'site?secao=depoimentos', 'categorias', 'revendedoras', 'configuracoes', 'backup', 'produtos/prod-p01']) {
    await page.goto(`/admin/${section}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, section).toBeLessThanOrEqual(0);
  }
  await context.close();
});

test('admin: no serious accessibility violations', async ({ page }) => {
  test.setTimeout(120_000); // 11 axe scans; under the full parallel suite WebKit needs more than the default 45 s
  await page.goto('/admin');
  await page.getByRole('group', { name: 'Teclado do PIN' }).waitFor();
  expect(await axe(page)).toEqual([]);
  await unlock(page);
  for (const section of ['pedidos', 'clientes', 'produtos', 'estoque', 'relatorio', 'mensagens', 'site', 'site?secao=inicio', 'site?secao=depoimentos', 'categorias', 'revendedoras', 'configuracoes', 'backup', 'produtos/prod-p01']) {
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
  // Count only once the photos are on screen: counting an empty list made the "new" photo the
  // first one (already the main one, so no "Tornar principal"), a flaky failure on slow machines.
  await expect(photos.first()).toBeVisible();
  const before = await photos.count();
  await page.getByRole('region', { name: 'Editar peça' }).locator('input[type="file"]').first().setInputFiles('public/images/products/p02-argola-cravejada-960.webp');
  await expect(photos).toHaveCount(before + 1, { timeout: 15_000 });
  // A tap on the photo near its remove button (but outside it) picks the photo: it must never remove
  // it (the remove target once covered half the tile and deleted photos on the phone).
  const tile = (await photos.last().boundingBox())!;
  const removeBox = (await page.getByRole('button', { name: `Remover foto ${before + 1}` }).boundingBox())!;
  expect(removeBox.width).toBeLessThanOrEqual(36);
  expect(removeBox.height).toBeLessThanOrEqual(36);
  await page.mouse.click(removeBox.x - 6, removeBox.y + removeBox.height + 6);
  await expect(photos).toHaveCount(before + 1);
  await expect(photos.last()).toHaveAttribute('aria-pressed', 'true');
  expect(tile.width).toBeGreaterThan(80);
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

const STOCK_PRODUCT: Record<string, { id: string; slug: string; name: string }> = {
  'mobile-chromium': { id: 'prod-p15', slug: 'kit-riviera', name: 'Kit Riviera' },
  'desktop-chromium': { id: 'prod-p19', slug: 'colar-medalha-sol-prateado', name: 'Colar Medalha Sol Prateado' },
  'mobile-webkit': { id: 'prod-p22', slug: 'ear-cuff-folhagem-dourado', name: 'Ear Cuff Folhagem Dourado' },
  'desktop-webkit': { id: 'prod-p18', slug: 'argola-cravejada-rodio-negro', name: 'Argola Cravejada Ródio Negro' },
};

test('admin: stock, order and confirmation; the visitor page sells out live', async ({ page, browser }, testInfo) => {
  const product = STOCK_PRODUCT[testInfo.project.name] ?? STOCK_PRODUCT['desktop-chromium']!;
  // 1. Stock control on, one unit.
  await page.goto('/admin');
  await unlock(page);
  await page.goto('/admin/estoque');
  await page.getByRole('button', { name: new RegExp(product.name) }).first().click();
  const editor = page.getByRole('region', { name: product.name });
  await editor.getByRole('switch', { name: 'Controlar estoque desta peça' }).click();
  await editor.getByRole('textbox', { name: 'Unidades' }).fill('1');
  await editor.getByRole('button', { name: 'Salvar estoque' }).click();
  await expect(page.getByText('Estoque salvo.')).toBeVisible();

  // 2. A visitor sees "Últimas unidades", orders it and gets a number.
  const visitorContext = await browser.newContext();
  await visitorContext.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.202.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/produto/${product.slug}`);
  await expect(visitor.getByText('Últimas unidades')).toBeVisible();
  await visitor.getByRole('button', { name: 'Pedir agora' }).filter({ visible: true }).first().click();
  const bag = visitor.getByRole('dialog', { name: /Sua sacola/ });
  await bag.getByPlaceholder('Seu nome').fill('Bia Teste');
  await bag.getByPlaceholder('Cidade').fill('Várzea Grande');
  await bag.getByRole('button', { name: 'Finalizar pedido' }).click();
  const heading = bag.getByRole('heading', { name: /Pedido nº \d+ registrado/ });
  await expect(heading).toBeVisible();
  const number = (await heading.innerText()).match(/\d+/)![0];
  await bag.getByRole('button', { name: 'Alterar pedido' }).click(); // keep the bag; back to the product
  await visitor.keyboard.press('Escape');

  // 3. The order is in the admin (live); confirming takes the unit out of stock.
  await page.getByRole('link', { name: /^Pedidos/ }).click();
  const card = page.getByRole('button', { name: new RegExp(`Bia Teste.*nº ${number}`) });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.click();
  const detail = page.getByRole('region', { name: `Pedido nº ${number}` });
  await detail.getByRole('button', { name: /Só confirmar/ }).click();
  await expect(page.getByText('Pedido confirmado.')).toBeVisible();

  // 4. The open visitor page shows it sold out, without reload.
  await expect(visitor.getByText('Esgotado').first()).toBeVisible({ timeout: 8000 });
  await expect(visitor.getByRole('button', { name: 'Adicionar à sacola' })).toHaveCount(0);

  // 5. Cancelling gives the unit back.
  await detail.getByRole('button', { name: 'Cancelar pedido' }).click();
  await page.getByRole('dialog', { name: `Cancelar o pedido nº ${number}?` }).getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.getByText('Pedido cancelado.')).toBeVisible();
  await expect(visitor.getByText('Últimas unidades')).toBeVisible({ timeout: 8000 });
  await visitorContext.close();
});

const PAY_PRODUCT: Record<string, { slug: string }> = {
  'mobile-chromium': { slug: 'brinco-perola-mini' },
  'desktop-chromium': { slug: 'conjunto-gota-e-ponto-de-luz' },
  'mobile-webkit': { slug: 'colar-gota-cristal' },
  'desktop-webkit': { slug: 'choker-riviera' },
};

test('payment: charge by Pix, customer pays through the link and sends the receipt, admin accepts it', async ({ page, browser }, testInfo) => {
  const product = PAY_PRODUCT[testInfo.project.name] ?? PAY_PRODUCT['desktop-chromium']!;
  // 1. A customer registers an order (no Pix at checkout).
  const customerContext = await browser.newContext();
  await customerContext.setExtraHTTPHeaders({ 'CF-Connecting-IP': `10.203.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  const customer = await customerContext.newPage();
  await customer.goto(`/produto/${product.slug}`);
  await customer.getByRole('button', { name: 'Pedir agora' }).filter({ visible: true }).first().click();
  const bag = customer.getByRole('dialog', { name: /Sua sacola/ });
  await bag.getByPlaceholder('Seu nome').fill('Carla Pagadora');
  await bag.getByPlaceholder('Cidade').fill('Várzea Grande');
  await bag.getByRole('button', { name: 'Finalizar pedido' }).click();
  const heading = bag.getByRole('heading', { name: /Pedido nº \d+ registrado/ });
  await expect(heading).toBeVisible();
  await expect(bag.getByText('Pague com Pix')).toHaveCount(0);
  const number = (await heading.innerText()).match(/\d+/)![0];

  // 2. The owner sets the Pix key (shared by the parallel projects: same value) and charges with shipping.
  await page.goto('/admin');
  await unlock(page);
  await page.goto('/admin/configuracoes');
  await page.getByRole('tab', { name: 'Pix', exact: true }).click();
  await page.getByRole('combobox', { name: 'Tipo de chave' }).selectOption('phone');
  await page.getByRole('textbox', { name: 'Chave Pix' }).fill('(65) 99999-8888');
  await page.getByRole('textbox', { name: 'Nome do recebedor' }).fill('ÉKA Semijoias');
  await page.getByRole('textbox', { name: 'Cidade da conta' }).fill('Cuiabá');
  await page.getByRole('button', { name: 'Salvar Pix' }).click();
  await expect(page.getByText(/Pix salvo/)).toBeVisible();
  await page.getByRole('link', { name: /^Pedidos/ }).click();
  await page.getByRole('button', { name: new RegExp(`Carla Pagadora.*nº ${number}`) }).click();
  const detail = page.getByRole('region', { name: `Pedido nº ${number}` });
  await detail.getByRole('button', { name: 'Cobrar por Pix' }).click();
  const sheet = page.getByRole('dialog', { name: `Cobrar pedido nº ${number} por Pix` });
  await sheet.getByRole('textbox', { name: /Frete/ }).fill('20,00');
  await sheet.getByRole('button', { name: 'Confirmar e gerar cobrança' }).click();
  const ready = page.getByRole('dialog', { name: 'Cobrança pronta' });
  const message = await ready.getByRole('textbox', { name: 'Mensagem para a cliente' }).inputValue();
  expect(message).toContain(`Seu pedido nº ${number} está confirmado.`);
  expect(message).toContain('Frete: R$ 20,00');
  const link = message.match(/https?:\/\/\S+\/pagamento\/[A-Za-z0-9_-]+/)![0];
  await page.keyboard.press('Escape');

  // 3. The customer opens the link, sees the exact amount and the Pix, and sends a receipt.
  await customer.goto(link);
  await expect(customer.getByRole('heading', { level: 1, name: new RegExp(`Pagamento do pedido nº ${number}`) })).toBeVisible();
  await expect(customer.getByText('Oi, Carla! Falta pouco')).toBeVisible();
  await expect(customer.getByText('R$ 20,00')).toBeVisible();
  await expect(customer.getByRole('button', { name: 'Copiar código Pix' })).toBeVisible();
  await expect(customer.getByRole('img', { name: /QR Code Pix/ })).toBeVisible();
  await customer.locator('input[type="file"]').setInputFiles('public/favicon-512.png');
  await customer.getByRole('button', { name: 'Enviar comprovante' }).click();
  await expect(customer.getByRole('heading', { name: 'Comprovante recebido!' })).toBeVisible({ timeout: 15_000 });

  // 4. The owner sees it live, checks it and accepts the payment.
  await expect(detail.getByText(/Comprovante recebido: confira/)).toBeVisible({ timeout: 10_000 });
  await expect(detail.getByRole('button', { name: /Ver Comprovante 1/ }).locator('img')).toBeVisible();
  await detail.getByRole('button', { name: 'Pagamento conferido' }).click();
  await expect(page.getByText('Pagamento registrado.')).toBeVisible();

  // 5. The link now says it is paid.
  await customer.reload();
  await expect(customer.getByRole('heading', { name: 'Pagamento confirmado' })).toBeVisible();

  // 6. A ready "pagamento confirmado" message for the customer (default template).
  await detail.getByRole('button', { name: 'Enviar mensagem' }).click();
  const composer = page.getByRole('dialog', { name: `Mensagem · pedido nº ${number}` });
  await expect(composer.getByRole('textbox', { name: 'Mensagem para a cliente' })).toHaveValue(new RegExp(`Recebemos o pagamento do pedido nº ${number}`));
  await composer.getByRole('button', { name: 'Carinhosa' }).click();
  await expect(composer.getByRole('textbox', { name: 'Mensagem para a cliente' })).toHaveValue(/Pagamento recebido!/);
  await customerContext.close();
});

test('messages: the owner creates her own variation and the site uses it', async ({ page }, testInfo) => {
  // Settings are shared by the parallel projects: one project edits them.
  test.skip(testInfo.project.name !== 'desktop-chromium', 'edits shared settings');
  await page.goto('/admin');
  await unlock(page);
  await page.goto('/admin/mensagens');
  await expect(page.getByRole('heading', { name: 'Mensagens das clientes' })).toBeVisible();
  const card = page.locator('li').filter({ has: page.getByRole('heading', { name: 'Dúvida sobre uma peça' }) });
  await card.getByRole('button', { name: /Personalizar/ }).click();
  const editor = page.getByRole('region', { name: 'Dúvida sobre uma peça' });
  await editor.getByRole('button', { name: /Nova variação/ }).click();
  await editor.getByRole('textbox', { name: 'Nome da variação' }).fill('Minha teste');
  const text = editor.getByRole('textbox', { name: 'Texto' });
  await text.fill('Oi! Vi no site: ');
  await editor.getByRole('button', { name: '+ Peça', exact: true }).click();
  await expect(text).toHaveValue('Oi! Vi no site: {peca}');
  await expect(editor.getByText('Oi! Vi no site: Anel Solitário Delicado')).toBeVisible(); // live preview
  await editor.getByRole('button', { name: 'Usar esta variação' }).click();
  await editor.getByRole('button', { name: 'Salvar mensagens' }).click();
  await expect(page.getByText(/Mensagens salvas/)).toBeVisible();
  await expect(card.getByText('Minha teste')).toBeVisible();

  await page.goto('/produto/brinco-gota-cristal');
  const href = await page.getByRole('link', { name: /Fale com a gente/ }).first().getAttribute('href');
  expect(decodeURIComponent(href!.split('text=')[1]!)).toBe('Oi! Vi no site: Brinco Gota Cristal');

  // Back to the built-in default (deleting her variation).
  await page.goto('/admin/mensagens');
  await page.locator('li').filter({ has: page.getByRole('heading', { name: 'Dúvida sobre uma peça' }) }).getByRole('button', { name: /Personalizar/ }).click();
  const again = page.getByRole('region', { name: 'Dúvida sobre uma peça' });
  await again.getByRole('button', { name: /Minha teste/ }).click();
  await again.getByRole('button', { name: 'Excluir variação' }).click();
  await page.getByRole('dialog', { name: /Excluir “Minha teste”/ }).getByRole('button', { name: 'Excluir' }).click();
  await again.getByRole('button', { name: 'Salvar mensagens' }).click();
  await expect(page.getByText(/Mensagens salvas/)).toBeVisible();
});

test('admin: a detail is a page of the panel and "Voltar" brings the list back where it was', async ({ page }) => {
  await page.goto('/admin');
  await unlock(page);
  await page.goto('/admin/estoque');
  const rows = page.locator('main ul > li > button');
  await expect(rows.first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(200);
  // Tap a row already on screen, without letting the test runner scroll to it first.
  const box = await page.evaluate(() => {
    const r = [...document.querySelectorAll('main ul > li > button')].map((b) => b.getBoundingClientRect()).find((r) => r.top > 120 && r.bottom < innerHeight - 120)!;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await expect(page).toHaveURL(/\/admin\/estoque\/[^/]+$/);
  await expect(page.getByRole('link', { name: 'Voltar para Estoque' })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('link', { name: 'Voltar para Estoque' }).click();
  await expect(page).toHaveURL(/\/admin\/estoque$/);
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(Math.round(before));
});
