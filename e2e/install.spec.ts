import { expect, test, type Page } from '@playwright/test';

/** Installable app (PWA): manifests per app, the service worker and the install guide. */

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.locator('main').waitFor();
}

test('store pages use the store manifest; /admin switches to the "Painel ÉKA" app', async ({ page }) => {
  await open(page, '/catalogo');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'ÉKA');

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Painel ÉKA' })).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/admin.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/admin-apple-touch-icon.png');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Painel ÉKA');
});

test('both manifests and their icons are served', async ({ request }) => {
  const store = await request.get('/manifest.webmanifest');
  expect(store.ok()).toBe(true);
  expect(await store.json()).toMatchObject({ name: 'ÉKA Semijoias', start_url: '/', scope: '/', display: 'standalone' });

  const admin = await request.get('/admin.webmanifest');
  expect(admin.ok()).toBe(true);
  const manifest = (await admin.json()) as { start_url: string; scope: string; name: string; icons: { src: string }[] };
  expect(manifest).toMatchObject({ name: 'Painel ÉKA', start_url: '/admin', scope: '/admin', display: 'standalone' });
  for (const src of [...manifest.icons.map((i) => i.src), '/admin-apple-touch-icon.png', '/admin-badge-96.png']) {
    const icon = await request.get(src);
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()['content-type'], src).toBe('image/png');
  }
});

test('the service worker is served fresh and registers at the root', async ({ page, request, browserName }) => {
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['content-type']).toMatch(/javascript/);
  expect(sw.headers()['cache-control']).toContain('no-cache');
  const body = await sw.text();
  expect(body).toContain("addEventListener('push'");
  expect(body).not.toContain("addEventListener('fetch'");

  test.skip(browserName !== 'chromium', 'registration is checked in Chromium');
  await open(page, '/');
  const registered = await page.evaluate(async () => {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000));
    const registration = await Promise.race([navigator.serviceWorker.ready, timeout]);
    return registration ? { script: registration.active?.scriptURL ?? '', scope: registration.scope } : null;
  });
  expect(registered).not.toBeNull();
  expect(new URL(registered!.script).pathname).toBe('/sw.js');
  expect(new URL(registered!.scope).pathname).toBe('/');
});

test.describe('on iPhone Safari', () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test('"Instalar o app" opens the Safari steps and "Agora não" hides it', async ({ page, isMobile }) => {
    await open(page, '/');
    // Phones reach it from the menu; wide screens (no menu button) from the footer.
    let button = page.locator('footer').getByRole('button', { name: 'Instalar o app' });
    if (isMobile) {
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      button = page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Instalar o app' });
    }
    await button.click();

    const guide = page.getByRole('dialog', { name: 'Instalar o app da ÉKA' });
    await expect(guide).toBeVisible();
    await expect(guide).toContainText('Compartilhar');
    await expect(guide).toContainText('Adicionar à Tela de Início');

    await guide.getByRole('button', { name: 'Agora não' }).click();
    await expect(guide).toBeHidden();
    await expect(page.getByRole('button', { name: 'Instalar o app' })).toHaveCount(0);

    // Remembered across visits.
    await open(page, '/');
    await expect(page.locator('footer')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Instalar o app' })).toHaveCount(0);
  });
});
