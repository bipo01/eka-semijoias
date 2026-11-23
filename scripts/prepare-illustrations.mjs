// One-off: brand spot illustrations (generated in ChatGPT from the ÉKA palette, transparent PNGs in
// assets/illustrations/) → trimmed, centered squares as WebP with alpha in public/images/illustrations/
// at 320 and 640 px. Outputs are committed; run again only when an illustration changes.
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';

const SRC = 'assets/illustrations';
const OUT = 'public/images/illustrations';
mkdirSync(OUT, { recursive: true });

for (const file of readdirSync(SRC).filter((f) => f.endsWith('.png'))) {
  const name = basename(file, '.png');
  // Trim the empty margin, then center on a square with a small breathing margin.
  const trimmed = await sharp(join(SRC, file)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const side = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 1.08);
  const square = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed.data, left: Math.round((side - trimmed.info.width) / 2), top: Math.round((side - trimmed.info.height) / 2) }])
    .png()
    .toBuffer();
  for (const size of [320, 640]) {
    const info = await sharp(square).resize(size, size).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(join(OUT, `${name}-${size}.webp`));
    console.log(`${name}-${size}.webp`, Math.round(info.size / 1024), 'KB');
  }
}
