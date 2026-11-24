import { describe, expect, it } from 'vitest';
import { bannerSources, imageSources, productImageSources, siteImageSources } from './assets';

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

describe('siteImageSources', () => {
  it('keeps the sizes the pages used for the built-in photos', () => {
    const hero = '/images/lifestyle/l01-hero-pescoco';
    expect(siteImageSources({ src: 'images/lifestyle/l01-hero-pescoco' }, 'hero')).toEqual({ src: `${hero}-720.webp`, srcSet: `${hero}-480.webp 480w, ${hero}-720.webp 720w, ${hero}-960.webp 960w` });
    expect(siteImageSources({ src: 'images/lifestyle/l02-mostruario-revendedora' }, 'banner')).toEqual(bannerSources('images/lifestyle/l02-mostruario-revendedora'));
    expect(siteImageSources({ src: 'images/lifestyle/l01-orelha' }, 'tile')).toEqual(imageSources('images/lifestyle/l01-orelha', { small: true }));
    // A built-in photo without a 720 px width used as the hero falls back to its own widths.
    expect(siteImageSources({ src: 'images/products/p01-brinco' }, 'hero')).toEqual(imageSources('images/products/p01-brinco'));
  });

  it('serves uploaded photos with their thumb where it helps', () => {
    expect(siteImageSources({ src: MAIN, thumb: THUMB }, 'tile')).toEqual({ src: `/${THUMB}` });
    expect(siteImageSources({ src: MAIN, thumb: THUMB }, 'banner')).toEqual({ src: `/${MAIN}`, srcSet: `/${THUMB} 480w, /${MAIN} 1200w` });
    expect(siteImageSources({ src: MAIN }, 'hero')).toEqual({ src: `/${MAIN}` });
    expect(siteImageSources({ src: MAIN }, 'tile')).toEqual({ src: `/${MAIN}` });
  });
});
