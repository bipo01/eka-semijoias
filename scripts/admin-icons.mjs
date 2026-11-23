// One-off: generate the "Painel ÉKA" app icons (admin PWA) from the brand monogram.
// The store icon is a copper monogram on ivory; the panel inverts it (ivory on copper) and frames it
// with a thin rose-gold ring and the brand's triple dots, so the two icons are easy to tell apart.
// Outputs are committed: public/admin-icon-{192,512}.png, admin-icon-maskable-512.png, admin-apple-touch-icon.png
// and admin-badge-96.png (Android shows a notification badge as a white silhouette of its alpha channel).
// Run: node scripts/admin-icons.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public');

const COPPER = '#8A5A45';
const IVORY = '#FBF8F5';
const ROSE_LIGHT = '#E6BEA4';
const SIZE = 3762; // the monogram's own viewBox

const source = await readFile(path.join(root, 'assets/brand/svg/eka-monogram-solid-currentcolor.svg'), 'utf8');
const glyph = source.slice(source.indexOf('<g'), source.lastIndexOf('</svg>')).replaceAll('currentColor', IVORY);

/**
 * @param {{ rounded: boolean, content: number }} opts
 *   rounded: rounded-square tile (launchers that do not mask); false = full bleed (maskable, iOS).
 *   content: scale of the artwork around the center (maskable keeps it inside the 80% safe zone).
 */
function iconSvg({ rounded, content }) {
  const c = SIZE / 2;
  const ring = 1480;
  const dots = [-150, 0, 150].map((dx) => `<circle cx="${c + dx}" cy="${c + ring}" r="${dx === 0 ? 62 : 46}" fill="${ROSE_LIGHT}"/>`).join('');
  const art = [
    // Thin rose-gold ring, interrupted at the bottom where the triple dots sit.
    `<circle cx="${c}" cy="${c}" r="${ring}" fill="none" stroke="${ROSE_LIGHT}" stroke-width="44" stroke-dasharray="${2 * Math.PI * ring - 520} 520" stroke-dashoffset="${-(Math.PI * ring / 2 + 260)}"/>`,
    dots,
    `<g transform="translate(${c * (1 - 0.62)} ${c * (1 - 0.62) - 40}) scale(0.62)">${glyph}</g>`,
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
<rect width="${SIZE}" height="${SIZE}" ${rounded ? 'rx="828"' : ''} fill="${COPPER}"/>
<g transform="translate(${c * (1 - content)} ${c * (1 - content)}) scale(${content})">${art}</g>
</svg>`;
}

async function png(svg, size, file) {
  // Render at 4x and downscale for crisp edges.
  await sharp(Buffer.from(svg), { density: 72 * (size / SIZE) * 4 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(out, file));
  console.log('wrote', file);
}

const any = iconSvg({ rounded: true, content: 0.9 });
const fullBleed = iconSvg({ rounded: false, content: 0.9 });
const maskable = iconSvg({ rounded: false, content: 0.78 });

await png(any, 192, 'admin-icon-192.png');
await png(any, 512, 'admin-icon-512.png');
await png(maskable, 512, 'admin-icon-maskable-512.png');
await png(fullBleed, 180, 'admin-apple-touch-icon.png');

// Badge: the bare monogram in white on transparent, filling most of the square.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"><g transform="translate(-150 -150) scale(1.08)">${glyph.replaceAll(IVORY, '#FFFFFF')}</g></svg>`;
await png(badge, 96, 'admin-badge-96.png');
