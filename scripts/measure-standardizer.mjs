// Measures the admin photo standardizer on test photos and saves the outputs for visual review.
//
//   node scripts/measure-standardizer.mjs [--photos <dir>] [--models isnet,birefnet-lite] [--devices wasm,webgpu] [--out docs/qa/standardizer]
//
// Builds scripts/standardizer/harness.html with Vite (the real engine and compositing modules), serves it
// on 127.0.0.1:4310 under the same CSPs as production (the Worker's /admin policy on the page, public/_headers
// on static files), and drives it with headless Chromium.
// Models are cached in a persistent browser profile under node_modules/.cache, so only the first run downloads.
import { chromium } from '@playwright/test';
import { build } from 'vite';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const photosDir = resolve(args.photos ?? join(root, 'public/images/products'));
const models = (args.models ?? 'isnet,birefnet-lite').split(',');
const devices = (args.devices ?? 'wasm').split(',');
const outDir = resolve(args.out ?? join(root, 'docs/qa/standardizer'));
const port = Number(args.port ?? 4310);
const buildDir = join(root, 'node_modules/.cache/standardizer-harness');
const profileDir = join(root, 'node_modules/.cache/standardizer-profile');

// Mirrors documentCsp() in worker/index.ts for /admin pages (served over http locally).
const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ws://127.0.0.1:${port} https://huggingface.co https://*.huggingface.co https://*.hf.co`,
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const workerSrc = await readFile(join(root, 'worker/index.ts'), 'utf8');
if (!workerSrc.includes(`"script-src 'self' 'wasm-unsafe-eval'"`) || !workerSrc.includes("'https://*.hf.co'")) {
  throw new Error('worker/index.ts documentCsp changed: update ADMIN_CSP in this script');
}

// Static files get the CSP public/_headers sets on /* (it applies to /assets/*.js, worker scripts included).
const staticCsp = /^\/\*\n(?:[ \t]+.*\n)*?[ \t]+Content-Security-Policy:\s*(.+)$/m.exec(await readFile(join(root, 'public/_headers'), 'utf8'))?.[1];
if (!staticCsp) throw new Error('public/_headers has no Content-Security-Policy for /*');

// Peak resident memory of this profile's renderer (page + worker) and GPU processes, sampled with ps.
// Rough, desktop-only, but shows the order of magnitude a phone must hold.
async function rssMb() {
  try {
    const { stdout } = await promisify(execFile)('ps', ['-A', '-o', 'pid=,ppid=,rss=,command='], { maxBuffer: 1 << 24 });
    const procs = stdout.split('\n').filter(Boolean).map((line) => {
      const [pid, ppid, rss, ...cmd] = line.trim().split(/\s+/);
      return { pid, ppid, kb: Number(rss), cmd: cmd.join(' ') };
    });
    // Only this script's browser: the process started with our profile, and its descendants.
    const ours = new Set(procs.filter((p) => p.cmd.includes(`--user-data-dir=${profileDir}`)).map((p) => p.pid));
    let added = true;
    while (added) {
      added = false;
      for (const p of procs) {
        if (ours.has(p.ppid) && !ours.has(p.pid)) {
          ours.add(p.pid);
          added = true;
        }
      }
    }
    const peak = { renderer: 0, gpu: 0 };
    for (const p of procs) {
      if (!ours.has(p.pid)) continue;
      if (p.cmd.includes('--type=renderer')) peak.renderer = Math.max(peak.renderer, p.kb / 1024);
      else if (p.cmd.includes('--type=gpu-process')) peak.gpu = Math.max(peak.gpu, p.kb / 1024);
    }
    return peak;
  } catch {
    return { renderer: 0, gpu: 0 };
  }
}
function sampler() {
  const peak = { renderer: 0, gpu: 0 };
  const timer = setInterval(async () => {
    const now = await rssMb();
    peak.renderer = Math.max(peak.renderer, now.renderer);
    peak.gpu = Math.max(peak.gpu, now.gpu);
  }, 150);
  return () => (clearInterval(timer), { rendererMb: Math.round(peak.renderer), gpuMb: Math.round(peak.gpu) });
}

const isPhoto = (f) => /\.(jpe?g|png|webp|heic)$/i.test(f) && !/-480\.webp$/.test(f);
const photos = (await readdir(photosDir)).filter(isPhoto).sort();
if (!photos.length) throw new Error(`no photos in ${photosDir}`);

console.log(`building harness → ${buildDir}`);
await rm(buildDir, { recursive: true, force: true });
await build({
  root,
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'warn',
  build: { outDir: buildDir, emptyOutDir: true, rolldownOptions: { input: join(root, 'scripts/standardizer/harness.html') } },
});

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.gz': 'application/gzip' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const file = url.pathname.startsWith('/photos/') ? join(photosDir, decodeURIComponent(url.pathname.slice(8))) : join(buildDir, decodeURIComponent(url.pathname));
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': type === 'text/html' ? ADMIN_CSP : staticCsp });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));

await mkdir(outDir, { recursive: true });
const context = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=metal'],
});
const cspViolations = [];
const report = { at: new Date().toISOString(), userAgent: '', photosDir, runs: [] };
try {
  for (const modelKey of models) {
    for (const device of devices) {
      const page = await context.newPage();
      page.on('console', (m) => {
        const t = m.text();
        if (/Content Security Policy|Refused to/i.test(t)) cspViolations.push(t);
        if (m.type() === 'error') console.log(`  [page] ${t.slice(0, 300)}`);
      });
      page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
      await page.goto(`http://127.0.0.1:${port}/scripts/standardizer/harness.html`);
      await page.waitForFunction(() => document.getElementById('status')?.textContent === 'pronto');
      report.userAgent ||= await page.evaluate(() => navigator.userAgent);
      console.log(`${modelKey} / ${device}: loading`);
      const run = { model: modelKey, requestedDevice: device, init: null, photos: [] };
      const stopSampling = sampler();
      try {
        run.init = await page.evaluate(([m, d]) => window.standardizer.init(m, d), [modelKey, device]);
        console.log(`  ready on ${run.init.device} in ${Math.round(run.init.ms)} ms (downloaded ${(run.init.downloaded / 1e6).toFixed(1)} MB)`);
        for (const photo of photos) {
          const r = await page.evaluate(([u, n]) => window.standardizer.run(u, n), [`/photos/${encodeURIComponent(photo)}`, photo]);
          const stem = photo.replace(/\.[^.]+$/, '');
          const tag = `${modelKey}-${r.device}`;
          // JPEG/grey PNG keep the folder small enough to commit (the app itself re-encodes to WebP within its budget).
          const decode = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
          if (r.composite) await sharp(decode(r.composite)).jpeg({ quality: 86, mozjpeg: true }).toFile(join(outDir, `${stem}__${tag}.jpg`));
          await sharp(decode(r.mask)).extractChannel('alpha').resize(800, 800, { fit: 'inside' }).png({ compressionLevel: 9 }).toFile(join(outDir, `${stem}__${tag}__mask.png`));
          run.photos.push({ name: photo, device: r.device, ms: Object.fromEntries(Object.entries(r.ms).map(([k, v]) => [k, Math.round(v)])), bounds: r.bounds });
          console.log(`  ${photo}: segment ${Math.round(r.ms.segment)} ms, compose ${Math.round(r.ms.compose)} ms`);
        }
      } catch (err) {
        run.error = String(err?.message ?? err).slice(0, 500);
        console.log(`  failed: ${run.error}`);
      }
      run.peakRss = stopSampling();
      console.log(`  peak RSS: renderer ${run.peakRss.rendererMb} MB, GPU process ${run.peakRss.gpuMb} MB`);
      await page.evaluate(() => window.standardizer.dispose()).catch(() => undefined);
      await page.close();
      report.runs.push(run);
    }
  }
} finally {
  await context.close();
  server.close();
}
report.cspViolations = cspViolations;
await writeFile(join(outDir, 'timings.json'), JSON.stringify(report, null, 2) + '\n');

// Contact sheets: original | each model's result, one row per photo.
const tags = report.runs.filter((r) => !r.error).map((r) => `${r.model}-${r.init.device}`);
const cell = { w: 320, h: 400 };
for (const photo of photos) {
  const stem = photo.replace(/\.[^.]+$/, '');
  const tiles = [await sharp(join(photosDir, photo)).rotate().resize(cell.w, cell.h, { fit: 'contain', background: '#ffffff' }).png().toBuffer()];
  // Columns: original, then each run in order (model-device).
  for (const tag of [...new Set(tags)]) {
    const file = join(outDir, `${stem}__${tag}.jpg`);
    tiles.push(await sharp(file).resize(cell.w, cell.h).png().toBuffer().catch(() => sharp({ create: { width: cell.w, height: cell.h, channels: 3, background: '#cccccc' } }).png().toBuffer()));
  }
  await sharp({ create: { width: cell.w * tiles.length, height: cell.h, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((input, i) => ({ input, left: i * cell.w, top: 0 })))
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(join(outDir, `${stem}__compare.jpg`));
}
console.log(`outputs in ${outDir}${cspViolations.length ? `\nCSP violations:\n${cspViolations.join('\n')}` : '\nno CSP violations'}`);
