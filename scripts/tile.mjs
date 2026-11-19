// Tiles a tall screenshot into N side-by-side columns for review: node scripts/tile.mjs in.png out.png cols [scale]
import sharp from 'sharp';
const [input, output, colsArg, scaleArg] = process.argv.slice(2);
const cols = Number(colsArg ?? 3);
const scale = Number(scaleArg ?? 1);
const meta = await sharp(input).metadata();
const seg = Math.ceil(meta.height / cols);
const parts = [];
for (let i = 0; i < cols; i++) {
  const top = i * seg;
  const height = Math.min(seg, meta.height - top);
  if (height <= 0) break;
  parts.push({ input: await sharp(input).extract({ left: 0, top, width: meta.width, height }).toBuffer(), left: i * (meta.width + 16), top: 0 });
}
const W = cols * meta.width + (cols - 1) * 16;
let img = sharp({ create: { width: W, height: seg, channels: 3, background: '#ffffff' } }).composite(parts);
const buf = await img.png().toBuffer();
await sharp(buf).resize(Math.round(W * scale)).png().toFile(output);
