#!/usr/bin/env node
/**
 * Panel (admin) pictures, generated in ChatGPT from the panel's design direction (docs/admin/REDESIGN.md).
 * Sources: assets/images/source/admin/<name>.jpg (ChatGPT originals, re-saved as JPEG q92). Output: public/images/admin/<name>-<width>.webp
 * (committed). Each source lists the widths the panel's srcset asks for.
 *
 *   node scripts/admin-images.mjs
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets/images/source/admin');
const OUT = join(ROOT, 'public/images/admin');

/** name → [output stem, widths, exact ratio (trimmed from the center) or null] */
const JOBS = [
  ['home-hero', 'home-hero', [640, 1024], 2],
  ['home-hero-wide', 'home-hero-wide', [960, 1600], 3],
  ['maleta', 'maleta', [320], 1],
  ['vitrine', 'vitrine', [320], 1],
  ['tudo-em-dia', 'tudo-em-dia', [320], 1],
  ['revenda-hero', 'revenda-hero', [640, 1280], 5 / 2],
];

mkdirSync(OUT, { recursive: true });
for (const [name, stem, widths, ratio] of JOBS) {
  const file = join(SRC, `${name}.jpg`);
  if (!existsSync(file)) {
    console.log(`skip ${name} (no source)`);
    continue;
  }
  const meta = await sharp(file).metadata();
  let { width, height } = meta;
  let left = 0;
  let top = 0;
  if (ratio) {
    if (width / height > ratio) {
      const w = Math.round(height * ratio);
      left = Math.round((width - w) / 2);
      width = w;
    } else {
      const h = Math.round(width / ratio);
      top = Math.round((height - h) / 2);
      height = h;
    }
  }
  for (const w of widths) {
    const out = join(OUT, `${stem}-${w}.webp`);
    await sharp(file).extract({ left, top, width, height }).resize(w).webp({ quality: 80, effort: 6 }).toFile(out);
    console.log(out.replace(ROOT + '/', ''));
  }
}
