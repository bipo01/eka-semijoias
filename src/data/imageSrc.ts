import { z } from 'zod';

/*
 * Image sources shared by the catalog and the site content (own module so the
 * content schemas can use it without importing schema.ts, which imports them).
 */

/** Uploaded photo stored by the backend, addressed by the SHA-256 of its bytes. */
export const MEDIA_KEY_PATTERN = /^media\/[a-f0-9]{64}\.(webp|jpg|png)$/;
export const ASSET_STEM_PATTERN = /^images\/[a-z0-9/_-]+$/;
export const DATA_URL_PATTERN = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

export const isDataUrl = (src: string) => src.startsWith('data:');

/**
 * Image sources are a public asset stem shipped with the site
 * ("images/products/p01-brinco-gota-cristal" → -480/-960.webp), an uploaded
 * photo ("media/<sha256>.webp"), or — only in the admin before saving — a data
 * URL produced by the photo pipeline. The server refuses data URLs.
 */
export const imageSrc = z
  .string()
  .max(1_500_000)
  .refine((v) => ASSET_STEM_PATTERN.test(v) || MEDIA_KEY_PATTERN.test(v) || DATA_URL_PATTERN.test(v), 'Imagem inválida');
