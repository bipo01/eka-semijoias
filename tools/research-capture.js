// Usage: node capture.js <outDir>
const { chromium, devices } = require('playwright');
const out = process.argv[2];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pages = [
  ['linktree', 'https://linktr.ee/athamasemijoia'],
  ['catalog-home', 'https://athama.semijoias.net/'],
  ['reseller-form', 'https://athama.semijoias.net/querorevender'],
];
const viewports = {
  mobile: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const metrics = [];
  for (const [vpName, opts] of Object.entries(viewports)) {
    const ctx = await browser.newContext({ ...opts, locale: 'pt-BR' });
    for (const [name, url] of pages) {
      const page = await ctx.newPage();
      let bytes = 0, imgBytes = 0, reqs = 0;
      page.on('response', async (r) => {
        reqs++;
        const len = Number(r.headers()['content-length'] || 0);
        bytes += len;
        if ((r.headers()['content-type'] || '').startsWith('image/')) imgBytes += len;
      });
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log(name, e.message));
      const loadMs = Date.now() - t0;
      // dismiss cookie banners with the privacy-preserving choice when present
      for (const label of ['Rejeitar tudo', 'Reject all']) {
        const b = page.getByRole('button', { name: label });
        if (await b.count()) await b.first().click().catch(() => {});
      }
      await page.waitForTimeout(1000);
      const lcp = await page.evaluate(() => new Promise(res => {
        let v = 0;
        new PerformanceObserver(l => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => res(Math.round(v)), 300);
      }));
      const imgs = await page.evaluate(() => [...document.images].slice(0, 6).map(i => `${i.naturalWidth}x${i.naturalHeight} shown ${i.clientWidth}x${i.clientHeight} alt="${(i.alt || '').slice(0, 30)}" ${i.currentSrc.split('?')[0].split('.').pop()}`));
      await page.screenshot({ path: `${out}/${name}-${vpName}.png` });
      await page.screenshot({ path: `${out}/${name}-${vpName}-full.png`, fullPage: true });
      metrics.push({ vp: vpName, name, loadMs, lcp, reqs, kb: Math.round(bytes / 1024), imgKb: Math.round(imgBytes / 1024), imgs });
      await page.close();
    }
    await ctx.close();
  }
  console.log(JSON.stringify(metrics, null, 1));
  await browser.close();
})();
