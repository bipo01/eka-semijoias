import { describe, expect, it } from 'vitest';
import { bannerSources, imageSources, productImageSources } from './assets';

const MAIN = `media/${'a'.repeat(64)}.webp`;
const THUMB = `media/${'b'.repeat(64)}.webp`;

describe('imageSources', () => {
  it('expands shipped asset stems to their WebP widths', () => {
    expect(imageSources('images/products/p01-brinco')).toEqual({
      src: '/images/products/p01-brinco-960.webp',
      srcSet: '/images/products/p01-brinco-480.webp 480w, /images/products/p01-brinco-960.webp 960w',
    });
  });

  it('serves uploaded photos from /media, thumb for cards and both sizes in srcset', () => {
    expect(productImageSources({ id: 'i', src: MAIN, thumb: THUMB, alt: '' }, true)).toEqual({ src: `/${THUMB}` });
    expect(productImageSources({ id: 'i', src: MAIN, thumb: THUMB, alt: '' })).toEqual({ src: `/${MAIN}`, srcSet: `/${THUMB} 480w, /${MAIN} 1200w` });
    expect(imageSources(MAIN)).toEqual({ src: `/${MAIN}` });
    expect(bannerSources(MAIN)).toEqual({ src: `/${MAIN}` });
  });

  it('uses data URLs as they are (admin preview before saving)', () => {
    const data = 'data:image/webp;base64,AAAA';
    expect(imageSources(data, { thumb: 'data:image/webp;base64,BBBB', small: true })).toEqual({ src: 'data:image/webp;base64,BBBB' });
    expect(imageSources(data)).toEqual({ src: data });
  });
});
