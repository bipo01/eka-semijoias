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

export function productImageSources(image: ProductImage, small = false): ImageSources {
  return imageSources(image.src, { thumb: image.thumb, small });
}
