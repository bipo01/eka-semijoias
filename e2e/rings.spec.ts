import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE } from './admin-session.setup';
import { PUBLIC_ROUTES } from './routes';

/*
 * A selection ring (a copper outline drawn with box-shadow) must never be cut by the strip or box
 * that scrolls or clips around it. It happened in "Fotos deste acabamento": the first photo's ring
 * lost its left side because the strip had no side padding. Checked on every page at several
 * scroll positions, phone width.
 */

test.use({ storageState: ADMIN_STATE });

// eslint-disable-next-line no-empty-pattern -- Playwright needs the fixtures object pattern before testInfo
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'layout check at phone width, one browser is enough');
});

/** Rings (box-shadow with no blur) cut by an ancestor that scrolls or clips; the element itself fully inside it. */
function clippedRings(): string[] {
  const px = (v: string) => parseFloat(v) || 0;
  const ringOf = (shadow: string) => {
    if (!shadow || shadow === 'none') return 0;
    let ring = 0;
    for (const part of shadow.split(/,(?![^(]*\))/)) {
      if (/inset/.test(part)) continue;
      const [x = 0, y = 0, blur = 0, spread = 0] = part
        .replace(/(rgba?|oklch|oklab|color|hsla?)\([^)]*\)/g, '')
        .trim()
        .split(/\s+/)
        .map(px);
      if (blur === 0 && spread > 0) ring = Math.max(ring, spread + Math.max(Math.abs(x), Math.abs(y)));
    }
    return ring;
  };
  const found: string[] = [];
  for (const box of document.querySelectorAll<HTMLElement>('body *')) {
    const style = getComputedStyle(box);
    const clipX = style.overflowX !== 'visible';
    const clipY = style.overflowY !== 'visible';
    if ((!clipX && !clipY) || !box.clientWidth) continue;
    const rect = box.getBoundingClientRect();
    const left = rect.left + box.clientLeft;
    const top = rect.top + box.clientTop;
    const right = left + box.clientWidth;
    const bottom = top + box.clientHeight;
    for (const el of box.querySelectorAll<HTMLElement>('*')) {
      const ring = ringOf(getComputedStyle(el).boxShadow);
      if (ring < 1) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // Scrolled out of view, or as big as the box itself (a focus frame around a whole screen): not a cut ring.
      if (r.left < left - 0.5 || r.right > right + 0.5 || r.top < top - 0.5 || r.bottom > bottom + 0.5) continue;
      if (r.width >= box.clientWidth - 1 && r.height >= box.clientHeight - 1) continue;
      const cut =
        (clipX && (r.left - ring < left - 0.5 || r.right + ring > right + 0.5)) || (clipY && (r.top - ring < top - 0.5 || r.bottom + ring > bottom + 0.5));
      if (cut) found.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 50)} — inside ${box.tagName.toLowerCase()}.${String(box.className).split(' ').slice(0, 4).join('.')}`);
    }
  }
  return found;
}

async function ringsAcross(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const found = new Set<string>();
  for (const at of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate((p) => {
      for (const el of [document.scrollingElement!, ...document.querySelectorAll<HTMLElement>('dialog[open] .overflow-y-auto')]) el.scrollTop = (el.scrollHeight - el.clientHeight) * p;
    }, at);
    await page.waitForTimeout(120);
    for (const f of await page.evaluate(clippedRings)) found.add(`${path}: ${f}`);
  }
  return [...found];
}

test('no selection ring is cut by a scrolling strip (store pages)', async ({ page }) => {
  const problems: string[] = [];
  for (const path of PUBLIC_ROUTES) problems.push(...(await ringsAcross(page, path)));
  expect(problems).toEqual([]);
});

test('no selection ring is cut by a scrolling strip (panel, incl. the piece editor)', async ({ page }) => {
  test.setTimeout(120_000);
  const catalog = await (await page.request.get('/api/catalog')).json();
  const withVariants = (catalog.products as { id: string; variants: unknown[] }[]).filter((p) => p.variants.length > 1).slice(0, 3);
  const paths = [
    ...['pedidos', 'clientes', 'revendedoras', 'produtos', 'estoque', 'relatorio', 'mensagens', 'site', 'categorias', 'configuracoes', 'backup'].map((t) => `/admin/${t}`),
    ...withVariants.map((p) => `/admin/produtos/${p.id}`),
    '/admin/produtos/nova',
  ];
  const problems: string[] = [];
  for (const path of paths) problems.push(...(await ringsAcross(page, path)));
  expect(problems).toEqual([]);
});
