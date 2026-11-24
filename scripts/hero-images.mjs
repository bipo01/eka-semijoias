#!/usr/bin/env node
/**
 * Home slider pictures. Each slide was generated in ChatGPT once per screen ratio (art-directed, not
 * cropped by CSS) from the same scene, so the jewelry is never cut on any screen:
 *   celular 4:5 · tablet 2:3 · quadrado 1:1 · computador 4:3 · amplo 16:9  (see src/data/heroFrames.ts)
 * Sources: assets/images/source/hero/<slide>-<frame>.jpg (ChatGPT originals, re-saved as JPEG q92).
 * Output:  public/images/hero/<slide>-<frame>-<640|1024|1600>.webp (committed; the site's srcset).
 *
 *   node scripts/hero-images.mjs            → every source found
 *   node scripts/hero-images.mjs colo       → one slide
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets/images/source/hero');
const OUT = join(ROOT, 'public/images/hero');
const WIDTHS = [640, 1024, 1600];
/** Exact ratio of each frame: a ChatGPT output a few pixels off is trimmed to it (centered). */
const RATIO = { celular: 4 / 5, tablet: 2 / 3, quadrado: 1, computador: 4 / 3, amplo: 16 / 9 };

mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
for (const file of readdirSync(SRC).filter((f) => f.endsWith('.jpg')).sort()) {
  const name = file.replace(/\.jpg$/, '');
  const [slide, frame] = name.split('-');
  if (only && slide !== only) continue;
  const ratio = RATIO[frame];
  if (!ratio) throw new Error(`unknown frame in ${file}`);
  const meta = await sharp(join(SRC, file)).metadata();
  // Trim to the exact ratio around the center (generated sizes are within a few pixels of it).
  let w = meta.width, h = Math.round(meta.width / ratio);
  if (h > meta.height) { h = meta.height; w = Math.round(h * ratio); }
  const left = Math.floor((meta.width - w) / 2), top = Math.floor((meta.height - h) / 2);
  for (const width of WIDTHS) {
    const info = await sharp(join(SRC, file))
      .extract({ left, top, width: w, height: h })
      .resize({ width, height: Math.round(width / ratio), kernel: 'lanczos3' })
      .webp({ quality: width >= 1600 ? 80 : 82, effort: 6 })
      .toFile(join(OUT, `${name}-${width}.webp`));
    console.log(`${name}-${width}.webp  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB${width > w ? '  (upscaled from ' + w + ')' : ''}`);
  }
}
