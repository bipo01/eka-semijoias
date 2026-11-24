#!/usr/bin/env node
/**
 * Step pictures for "Instalar o app" (src/components/install/InstallGuide.tsx).
 *
 * Sources: real screenshots of the live site, taken on the iOS Simulator (iPhone 17, iOS 26, Safari)
 * and on the Android Emulator (Pixel 7, Android 16, Chrome), saved in assets/install-guide/. Each step
 * is cropped to the part of the screen that matters and gets a copper ring around what to tap.
 * Output: public/images/install/<platform>-<step>.webp (640 px wide, committed).
 *
 * Re-run after new screenshots: node scripts/install-guide-images.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets/install-guide');
const OUT = join(ROOT, 'public/images/install');
const WIDTH = 640;
const COPPER = '#8A5A45';

/**
 * crop: region of the source screenshot (source pixels). mark: what to tap, in source pixels:
 * { circle: [cx, cy, r] } or { rect: [x, y, w, h, radius] }.
 */
const STEPS = [
  // iPhone · Safari (iOS 26): ••• → Compartilhar → Ver mais → Adicionar à Tela de Início → Adicionar
  { out: 'ios-1', src: 'ios/store-1-bar.jpg', crop: [0, 2120, 1206, 502], mark: { circle: [1033, 2452, 92] } },
  { out: 'ios-2', src: 'ios/store-2-menu.jpg', crop: [300, 1380, 860, 640], mark: { rect: [400, 1440, 700, 140, 70] } },
  { out: 'ios-3', src: 'ios/store-3-share.jpg', crop: [0, 1700, 1206, 860], mark: { circle: [1002, 2289, 112] } },
  { out: 'ios-4', src: 'ios/store-4-more.jpg', crop: [0, 1420, 1206, 680], mark: { rect: [64, 1893, 1078, 152, 40] } },
  { out: 'ios-5-store', src: 'ios/store-5-add.jpg', crop: [0, 190, 1206, 600], mark: { rect: [830, 258, 336, 146, 73] } },
  { out: 'ios-5-admin', src: 'ios/admin-5-add.jpg', crop: [0, 190, 1206, 600], mark: { rect: [830, 258, 336, 146, 73] } },
  { out: 'ios-5-reseller', src: 'ios/revenda-5-add.jpg', crop: [0, 190, 1206, 600], mark: { rect: [830, 258, 336, 146, 73] } },
  { out: 'ios-6-store', src: 'ios/store-6-home.jpg', crop: [0, 530, 1206, 330], mark: { rect: [628, 556, 234, 290, 56] } },
  { out: 'ios-6-admin', src: 'ios/admin-6-home.jpg', crop: [0, 530, 1206, 330], mark: { rect: [900, 556, 234, 290, 56] } },
  { out: 'ios-6-reseller', src: 'ios/revenda-6-home.jpg', crop: [0, 830, 1206, 330], mark: { rect: [68, 856, 234, 290, 56] } },
  // Android · Chrome: ⋮ → Adicionar à tela inicial → Instalar
  { out: 'android-1', src: 'android/store-1-page.jpg', crop: [0, 136, 1080, 236], mark: { circle: [1017, 210, 50] } },
  { out: 'android-2', src: 'android/store-2-menu.jpg', crop: [388, 1236, 692, 640], mark: { rect: [404, 1628, 660, 118, 30] } },
  { out: 'android-3-store', src: 'android/store-3-dialog.jpg', crop: [27, 1011, 1026, 556], mark: { rect: [790, 1412, 210, 98, 49] } },
  { out: 'android-3-admin', src: 'android/admin-4-dialog.jpg', crop: [27, 1011, 1026, 556], mark: { rect: [790, 1412, 210, 98, 49] } },
  { out: 'android-3-reseller', src: 'android/revenda-4-dialog.jpg', crop: [27, 1011, 1026, 556], mark: { rect: [790, 1412, 210, 98, 49] } },
];

function ringSvg(width, height, crop, mark) {
  const [cx0, cy0] = crop;
  const stroke = 12;
  let shape;
  if (mark.circle) {
    const [x, y, r] = mark.circle;
    shape = (color, w) => `<circle cx="${x - cx0}" cy="${y - cy0}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
  } else {
    const [x, y, w, h, rx] = mark.rect;
    shape = (color, sw) => `<rect x="${x - cx0}" y="${y - cy0}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  }
  // A white halo under the copper ring keeps it readable on dark and light parts of the screen.
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shape('rgba(255,255,255,0.9)', stroke + 10)}${shape(COPPER, stroke)}</svg>`);
}

mkdirSync(OUT, { recursive: true });
for (const step of STEPS) {
  const [left, top, width, height] = step.crop;
  const base = sharp(join(SRC, step.src)).extract({ left, top, width, height });
  const marked = await base.composite([{ input: ringSvg(width, height, step.crop, step.mark) }]).png().toBuffer();
  const info = await sharp(marked).resize({ width: WIDTH }).webp({ quality: 80 }).toFile(join(OUT, `${step.out}.webp`));
  console.log(`${step.out}.webp  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KB`);
}
