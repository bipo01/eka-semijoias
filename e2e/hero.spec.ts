import { expect, test, type Page } from '@playwright/test';

/*
 * The home hero slider with the built-in slides (src/content/defaults.ts):
 * controls, autoplay and pause, the photo of each screen shape
 * (src/data/heroFrames.ts) and where the controls sit. Read-only: it never
 * saves the section, so every project can run it.
 */

// Chromium phone and desktop (mobile-chromium and desktop-chromium).
test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium phone and desktop');

const slides = (page: Page) => page.locator('[aria-roledescription="slide"]');
const shown = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[aria-roledescription="slide"]')].findIndex((s) => s.getAttribute('aria-hidden') !== 'true'));
const allSettled = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('[aria-roledescription="slide"] img')].map((i) => i.complete && i.naturalWidth > 0));

test('three slides with controls; they change on their own and the pause button stops them', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const region = page.getByRole('region', { name: 'Fotos em destaque' });
  await expect(region).toBeVisible();
  await expect(slides(page)).toHaveCount(3);
  await expect.poll(() => allSettled(page)).toEqual([true, true, true]);
  // Only one set of controls is on screen (under the buttons on phones, on the photo from tablets up).
  await expect(page.getByRole('button', { name: /^Mostrar foto \d de 3/ })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Mostrar foto 1 de 3' })).toHaveAttribute('aria-current', 'true');
  expect(await shown(page)).toBe(0);

  await page.clock.runFor(6_500);
  await expect.poll(() => shown(page)).toBe(1);
  await expect(page.getByRole('button', { name: 'Mostrar foto 2 de 3' })).toHaveAttribute('aria-current', 'true');

  await page.getByRole('button', { name: 'Pausar a troca de fotos' }).click();
  await page.getByRole('heading', { level: 1 }).hover(); // the pointer leaves the photos
  await page.clock.runFor(20_000);
  expect(await shown(page)).toBe(1);

  await page.getByRole('button', { name: 'Continuar a troca de fotos' }).click();
  await page.getByRole('heading', { level: 1 }).hover();
  await page.clock.runFor(6_500);
  await expect.poll(() => shown(page)).toBe(2);

  // A dot shows its photo.
  await page.getByRole('button', { name: 'Mostrar foto 1 de 3' }).click();
  await expect.poll(() => shown(page)).toBe(0);
});

test('the controls never sit on the headline: under the buttons on phones, on the photo from tablets up', async ({ page }, testInfo) => {
  await page.goto('/');
  const pause = page.getByRole('button', { name: 'Pausar a troca de fotos' });
  await expect(pause).toBeVisible();
  const box = (await page.getByRole('region', { name: 'Fotos em destaque' }).boundingBox())!;
  const control = (await pause.boundingBox())!;
  const cta = (await page.getByRole('link', { name: /Ver catálogo/ }).boundingBox())!;
  expect(control.width).toBeGreaterThanOrEqual(44);
  expect(control.height).toBeGreaterThanOrEqual(44);
  if (testInfo.project.name === 'mobile-chromium') {
    expect(control.y).toBeGreaterThanOrEqual(cta.y + cta.height);
  } else {
    expect(control.y + control.height).toBeLessThanOrEqual(box.y + box.height);
    expect(control.x).toBeGreaterThanOrEqual(box.x);
    expect(control.x + control.width).toBeLessThan(box.x + box.width / 2); // left: clear of the floating WhatsApp button
    expect(control.y).toBeGreaterThan(box.y + box.height / 2);
  }
});

test('nothing covers the controls, even on a short screen', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop-chromium') await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  for (const name of ['Pausar a troca de fotos', 'Mostrar foto 1 de 3', 'Mostrar foto 3 de 3']) {
    const button = page.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded();
    const onTop = await button.evaluate((b) => {
      const r = b.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === b;
    });
    expect(onTop, name).toBe(true);
  }
});

const SCREENS = [
  { width: 390, height: 844, frame: 'celular', ratio: 4 / 5 },
  { width: 768, height: 1024, frame: 'tablet', ratio: 2 / 3 },
  { width: 1024, height: 768, frame: 'quadrado', ratio: 1 },
  { width: 1440, height: 900, frame: 'computador', ratio: 4 / 3 },
  { width: 1920, height: 1080, frame: 'amplo', ratio: 16 / 9 },
];

for (const s of SCREENS) {
  test(`at ${s.width} px the first slide shows its "${s.frame}" photo`, async ({ page }) => {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.goto('/');
    const img = slides(page).first().locator('img');
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.currentSrc)).toMatch(new RegExp(`/images/hero/colo-${s.frame}-(640|1024|1600)\\.webp$`));
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    const natural = await img.evaluate((i: HTMLImageElement) => i.naturalWidth / i.naturalHeight);
    expect(Math.abs(natural - s.ratio)).toBeLessThan(0.01);
    // The photo fills its box without sideways scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
