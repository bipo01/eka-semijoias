// Full-page screenshots of routes at given widths: node scripts/shots.mjs <baseUrl> <outDir> <widths> <routes...>
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const [base, out, widthsArg, ...routes] = process.argv.slice(2);
const widths = widthsArg.split(',').map(Number);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
  const page = await ctx.newPage();
  for (const route of routes) {
    await page.goto(`${base}#${route}`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    const name = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';
    await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
