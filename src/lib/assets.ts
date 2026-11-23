import type { ProductImage } from '../data/schema';

const BASE = import.meta.env.BASE_URL;

/** URL of a file under public/. */
export function asset(path: string): string {
  return `${BASE}${path.replace(/^\//, '')}`;
}

export interface ImageSources {
  src: string;
  srcSet?: string;
}

/**
 * Resolves an image source:
 * - uploaded photos ("media/<sha256>.webp", served by the Worker) and data URLs
 *   (admin, before saving) are used as-is, with the smaller thumb for cards;
 * - asset stems expand to the WebP widths produced by scripts/prepare-images.mjs.
 */
export function imageSources(src: string, opts: { thumb?: string | undefined; small?: boolean; widths?: number[] } = {}): ImageSources {
  const resolve = (s: string) => (s.startsWith('data:') ? s : asset(s));
  if (src.startsWith('data:') || src.startsWith('media/')) {
    const thumb = opts.thumb;
    if (opts.small && thumb) return { src: resolve(thumb) };
    // Uploaded photos come in two sizes: the 480 px thumb and the main photo (≤ 1200 px).
    if (thumb && thumb !== src && thumb.startsWith('media/') && src.startsWith('media/')) return { src: resolve(src), srcSet: `${resolve(thumb)} 480w, ${resolve(src)} 1200w` };
    return { src: resolve(src) };
  }
  const widths = opts.widths ?? [480, 960];
  const stem = asset(src);
  return {
    src: `${stem}-${opts.small ? widths[0] : widths[widths.length - 1]}.webp`,
    srcSet: widths.map((w) => `${stem}-${w}.webp ${w}w`).join(', '),
  };
}

/** Landscape editorial photos also ship a 1440 px width. */
const WIDE_STEMS = new Set(['images/lifestyle/l02-mostruario-revendedora', 'images/lifestyle/l03-editorial-colecao-rose']);

/** Sources for banners/heroes: adds the 1440 px width when the asset has one. */
export function bannerSources(src: string): ImageSources {
  return imageSources(src, { widths: WIDE_STEMS.has(src) ? [480, 960, 1440] : [480, 960] });
}

export function productImageSources(image: ProductImage, small = false): ImageSources {
  return imageSources(image.src, { thumb: image.thumb, small });
}
