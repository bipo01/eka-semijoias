import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './admin-session.setup';

/*
 * Moving around the panel: a detail is a page that keeps its list's place, and another section
 * starts at the top. Uses the run's admin session (no PIN typed: the server caps logins per hour).
 */
test.use({ storageState: ADMIN_STATE });

test('admin: a detail is a page of the panel and "Voltar" brings the list back where it was', async ({ page }) => {
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

test('admin: another section starts at the top, not at the last page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/admin/mais');
  await expect(page.getByRole('heading', { name: 'Mais', level: 1 })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.getByRole('main').getByRole('link', { name: /^Configurações/ }).click();
  await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
