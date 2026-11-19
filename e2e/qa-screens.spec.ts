import { test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * QA capture (not part of the regular run): QA_SCREENS=1 npx playwright test e2e/qa-screens.spec.ts --project=desktop-chromium
 * Saves full-page screenshots of every route at each breakpoint to docs/qa/.
 */
const WIDTHS = [360, 390, 768, 1280, 1440];
const ROUTES: [string, string][] = [
  ['home', '/'],
  ['catalogo', '/catalogo'],
  ['produto', '/produto/brinco-gota-cristal'],
  ['colecao', '/colecao/rose'],
  ['sacola', '/sacola'],
  ['favoritos', '/favoritos'],
  ['revendedoras', '/revendedoras'],
  ['como-cuidar', '/como-cuidar'],
  ['garantia', '/garantia'],
  ['sobre', '/sobre'],
  ['contato', '/contato'],
  ['404', '/nao-existe'],
  ['admin', '/admin'],
];

test.skip(!process.env.QA_SCREENS, 'QA capture runs on demand');

for (const width of WIDTHS) {
  test(`screens at ${width}px`, async ({ browser }) => {
    test.setTimeout(180_000);
    await mkdir('docs/qa', { recursive: true });
    const mobile = width < 768;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const page = await context.newPage();
    // A bag with two pieces so the Sacola screen shows real content.
    await page.goto('./');
    await page.evaluate(() => {
      localStorage.setItem('eka:cart:v1', JSON.stringify({ items: [
        { productId: 'prod-p01', variantId: 'var-p01-rose', qty: 1 },
        { productId: 'prod-p08', variantId: 'var-p08-dourado', size: '16', qty: 2 },
      ] }));
    });
    for (const [name, route] of ROUTES) {
      await page.goto(`#${route}`);
      await page.locator('main, body').first().waitFor();
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 30));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `docs/qa/${name}-${width}.png`, fullPage: true });
    }
    await context.close();
  });
}
