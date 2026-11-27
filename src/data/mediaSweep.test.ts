import { describe, expect, it } from 'vitest';
import { defaultSections, factsOf } from '../content/defaults';
import { imageSourcesOf } from './changes';
import { MEDIA_GRACE_MS, MEDIA_SWEEP_LIMIT, mediaFilesIn, releasedMedia, unusedMedia } from './mediaSweep';
import { createCatalogSeed } from './seed';

const key = (n: number) => `${String(n).padStart(64, 'a')}.webp`;
const row = (n: number, at = '2026-11-20T10:00:00.000Z', size = 1000) => ({ key: key(n), created_at: at, size });
const CUTOFF = '2026-11-26T10:00:00.000Z';

function catalogUsing() {
  const seed = createCatalogSeed();
  const [first, second, ...rest] = seed.products;
  const sections = defaultSections(factsOf(seed.settings, undefined));
  const inicio = sections.inicio;
  const img = (n: number) => ({ src: `media/${key(n)}`, alt: `Foto ${n}` });
  const [slide, ...slides] = inicio.hero.slides;
  return {
    ...seed,
    products: [
      // Main photo and its 480 px thumb.
      { ...first!, images: [...first!.images, { id: 'img-up', src: `media/${key(1)}`, thumb: `media/${key(2)}`, alt: 'Foto' }] },
      // The same file in a second piece.
      { ...second!, images: [...second!.images, { id: 'img-shared', src: `media/${key(1)}`, alt: 'Foto' }] },
      ...rest,
    ],
    collections: [{ id: 'col-1', slug: 'verao', name: 'Verão', heroImage: `media/${key(3)}`, featuredOnHome: false }],
    content: {
      inicio: {
        ...inicio,
        // A photo for one screen shape only (hero slide frame).
        hero: { ...inicio.hero, slides: [{ ...slide!, frames: { ...slide!.frames, celular: { ...slide!.frames.celular!, image: { src: `media/${key(4)}`, alt: 'Celular' } } } }, ...slides] },
        resellerBand: { ...inicio.resellerBand, image: img(30) },
        instagram: [{ id: 'ig-up', ...img(31) }, ...inicio.instagram.slice(1)],
      },
      sobre: { ...sections.sobre, image: { src: `media/${key(5)}`, alt: 'Sobre' } },
      revendedoras: { ...sections.revendedoras, hero: { ...sections.revendedoras.hero, image: img(32) } },
      compartilhar: { ...sections.compartilhar, image: img(33) },
    },
  };
}

const usedBy = (catalog: ReturnType<typeof catalogUsing>) => mediaFilesIn([catalog.products, catalog.collections, catalog.content]);

describe('unused uploaded photos', () => {
  it('finds every uploaded photo the catalog uses, at any depth: pieces (and thumbs), collections, site sections', () => {
    const used = usedBy(catalogUsing());
    expect([...used].sort()).toEqual([key(1), key(2), key(3), key(4), key(5), key(30), key(31), key(32), key(33)].sort());
    // Built-in photos ("images/…") are not uploads.
    expect([...used].every((k) => /^[a-f0-9]{64}\.webp$/.test(k))).toBe(true);
  });

  it('agrees with the schema walk the uploads use (no image field is missed)', () => {
    const catalog = catalogUsing();
    const fromSchema = imageSourcesOf(catalog).filter((src) => src.startsWith('media/')).map((src) => src.slice('media/'.length));
    expect([...usedBy(catalog)].sort()).toEqual([...new Set(fromSchema)].sort());
  });

  it('never misses a photo in a section saved in an older or newer shape', () => {
    // The hero before the slider (a single image) and a field this build does not know.
    const old = { inicio: { hero: { image: { src: `media/${key(20)}`, alt: 'Topo' } } }, novidade: { fotos: [[{ src: `media/${key(21)}` }]] } };
    expect([...mediaFilesIn(old)].sort()).toEqual([key(20), key(21)].sort());
    expect(mediaFilesIn(['media/naoehash.webp', 'images/products/p01', `x media/${key(22)}`, null, 3]).size).toBe(0);
  });

  it('lists the photos a save lets go, not the ones still used elsewhere', () => {
    const before = catalogUsing();
    const after = { ...before, products: before.products.map((p, i) => (i === 0 ? { ...p, images: p.images.filter((img) => img.id !== 'img-up') } : p)) };
    // key(2) was only the thumb of the removed photo; key(1) is still in the second piece.
    expect(releasedMedia([before.products, before.collections, before.content], [after.products, after.collections, after.content])).toEqual([key(2)]);
  });

  it('erases only what nothing uses, and never a photo touched after the cutoff', () => {
    const rows = [row(1), row(2), row(3), row(4), row(5), row(6), row(7, '2026-11-26T09:59:59.999Z'), row(8, CUTOFF), row(9, '2026-11-26T11:00:00.000Z')];
    expect(unusedMedia(usedBy(catalogUsing()), rows, CUTOFF).map((r) => r.key)).toEqual([key(6), key(7)]);
    // No cutoff: every unused row (the panel's count).
    expect(unusedMedia(usedBy(catalogUsing()), rows, null).map((r) => r.key)).toEqual([key(6), key(7), key(8), key(9)]);
  });

  it('goes oldest first, stops at the limit, and waits a day by default', () => {
    const rows = [row(10, '2026-11-22T00:00:00.000Z'), row(11, '2026-11-21T00:00:00.000Z'), row(12, '2026-11-23T00:00:00.000Z')];
    expect(unusedMedia(new Set(), rows, CUTOFF, 2).map((r) => r.key)).toEqual([key(11), key(10)]);
    expect(unusedMedia(new Set(), rows, CUTOFF, 0)).toEqual([]);
    expect(MEDIA_SWEEP_LIMIT).toBeGreaterThanOrEqual(100);
    expect(MEDIA_GRACE_MS).toBe(24 * 3600_000);
  });
});
