// One-off asset preparation: converts the stand-in JPEG sources and brand files
// into the web-ready set under public/. Outputs are committed; the deploy does not run this.
import sharp from 'sharp';
import { mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'assets/images/source');
const out = path.join(root, 'public');
const QUALITY = 78;

async function ensure(dir) {
  await mkdir(dir, { recursive: true });
}

/** Writes `<name>-<w>.webp` for each width from an extracted region with a fixed aspect. */
async function emit(file, name, dir, { region, widths, aspect }) {
  for (const w of widths) {
    let img = sharp(file);
    if (region) img = img.extract(region);
    const h = aspect ? Math.round(w / aspect) : undefined;
    const target = path.join(dir, `${name}-${w}.webp`);
    await img.resize(w, h, { fit: 'cover', position: 'centre' }).webp({ quality: QUALITY }).toFile(target);
    const { size } = await stat(target);
    console.log(`${path.relative(root, target)}  ${(size / 1024).toFixed(1)} KB`);
  }
}

/** Center-weighted 4:5 crop of a portrait source. */
async function crop45(file) {
  const { width, height } = await sharp(file).metadata();
  const h = Math.min(height, Math.round((width * 5) / 4));
  const w = Math.round((h * 4) / 5);
  return { left: Math.round((width - w) / 2), top: Math.round((height - h) / 2), width: w, height: h };
}

async function products() {
  const dir = path.join(out, 'images/products');
  await ensure(dir);
  for (const f of (await readdir(src)).filter((n) => n.startsWith('p'))) {
    const file = path.join(src, f);
    await emit(file, f.replace(/\.jpg$/, ''), dir, { region: await crop45(file), widths: [480, 960], aspect: 4 / 5 });
  }
  // Necklace-only crop of the set photo (the earrings sit below this region).
  await emit(path.join(src, 'p12-conjunto-gota.jpg'), 'p12-colar-gota', dir, {
    region: { left: 167, top: 30, width: 752, height: 940 },
    widths: [480, 960],
    aspect: 4 / 5,
  });
}

async function lifestyle() {
  const dir = path.join(out, 'images/lifestyle');
  await ensure(dir);
  const l01 = path.join(src, 'l01-hero-pescoco.jpg'); // 1024x1536
  await emit(l01, 'l01-hero-pescoco', dir, { widths: [480, 720, 960], aspect: 2 / 3 });
  // On-skin crops used as PDP second images (4:5, like the product grid).
  await emit(l01, 'l01-orelha', dir, { region: { left: 544, top: 40, width: 480, height: 600 }, widths: [480, 960], aspect: 4 / 5 });
  await emit(l01, 'l01-colo', dir, { region: { left: 152, top: 620, width: 640, height: 800 }, widths: [480, 960], aspect: 4 / 5 });
  const l04 = path.join(src, 'l04-mao-aneis.jpg');
  await emit(l04, 'l04-mao-aneis', dir, { region: await crop45(l04), widths: [480, 960], aspect: 4 / 5 });
  for (const n of ['l02-mostruario-revendedora', 'l03-editorial-colecao-rose']) {
    await emit(path.join(src, `${n}.jpg`), n, dir, { widths: [480, 960, 1440], aspect: 3 / 2 });
  }
  // Social preview image (Open Graph prefers JPEG at 1200x630).
  await sharp(path.join(src, 'l03-editorial-colecao-rose.jpg'))
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(out, 'og-image.jpg'));
}

async function brand() {
  const b = path.join(root, 'assets/brand');
  const dir = path.join(out, 'brand');
  await ensure(dir);
  for (const n of ['eka-lockup-copper.svg', 'eka-lockup-white.svg', 'eka-emblem-white.svg', 'eka-monogram-copper.svg', 'eka-emblem-copper.svg']) {
    await copyFile(path.join(b, 'svg', n), path.join(dir, n));
  }
  for (const size of [240, 600]) {
    await sharp(path.join(b, 'eka-emblem-rosegold-transparent.png'))
      .resize(size, size)
      .webp({ quality: 82 })
      .toFile(path.join(dir, `eka-emblem-rosegold-${size}.webp`));
  }
  await copyFile(path.join(b, 'svg/favicon.svg'), path.join(out, 'favicon.svg'));
  for (const n of ['favicon-32.png', 'apple-touch-icon.png', 'favicon-192.png', 'favicon-512.png', 'icon-maskable-512.png']) {
    await copyFile(path.join(b, 'icons', n), path.join(out, n));
  }
}

await products();
await lifestyle();
await brand();
