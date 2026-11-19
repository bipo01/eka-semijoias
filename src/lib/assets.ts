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
 * Resolves an image source: data URLs are used as-is (uploaded photos, with an
 * optional smaller thumb for cards); asset stems expand to the WebP widths
 * produced by scripts/prepare-images.mjs.
 */
export function imageSources(src: string, opts: { thumb?: string | undefined; small?: boolean; widths?: number[] } = {}): ImageSources {
  if (src.startsWith('data:')) return { src: opts.small && opts.thumb ? opts.thumb : src };
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
