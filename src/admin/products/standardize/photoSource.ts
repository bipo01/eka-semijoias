import type { ProductImage } from '../../../data/schema';
import { imageSources } from '../../../lib/assets';

/**
 * Decodes a base64 data URL without fetch(): the admin CSP's connect-src does
 * not include data:. Returns null for anything that is not a base64 image.
 */
export function dataUrlToBlob(url: string): Blob | null {
  const match = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  if (!match) return null;
  try {
    const bin = atob(match[2]!.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: match[1] });
  } catch {
    return null;
  }
}

/**
 * The best copy of a product photo to standardize: the file picked in this
 * session when there is one (full resolution), else the photo being edited
 * (a data URL not yet saved, or the largest stored size from this site).
 */
export async function photoBlob(image: ProductImage, original?: Blob): Promise<Blob> {
  if (original) return original;
  if (image.src.startsWith('data:')) {
    const blob = dataUrlToBlob(image.src);
    if (!blob) throw new Error('invalid-data-url');
    return blob;
  }
  const res = await fetch(imageSources(image.src, { thumb: image.thumb }).src, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`photo-fetch-${res.status}`);
  return res.blob();
}
