// node render2.js <svg> <outPng> <width> [bg]  -> height from viewBox
const { chromium } = require('playwright');
const fs = require('fs');
const [svg, out, width, bg] = process.argv.slice(2);
(async () => {
  const txt = fs.readFileSync(svg, 'utf8');
  const vb = txt.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const w = +width, h = Math.round(w * vb[3] / vb[2]);
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<body style="margin:0;background:${bg || 'transparent'}"><img src="data:image/svg+xml;base64,${Buffer.from(txt).toString('base64')}" style="width:${w}px;height:${h}px;display:block">`);
  await p.waitForTimeout(400);
  await p.screenshot({ path: out, omitBackground: !bg });
  await b.close();
})();
