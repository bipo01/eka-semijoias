import { defaultSections, type ContentFacts } from '../../src/content/defaults';
import { createCatalogSeed } from '../../src/data/seed';
import type { HeroSlide } from '../../src/data/content';
import { absoluteImage, clip, DEFAULT_HERO, pageMeta } from '../seo';

const ORIGIN = 'https://loja.example';
const at = (path: string) => new URL(path, ORIGIN);
const MEDIA = `media/${'c'.repeat(64)}.webp`;
const none: ContentFacts = { warrantyMonths: null, whatsapp: null, shipsNationwide: null, hypoallergenic: null, installments: null, plating: null, consignment: null, noUpfrontInvestment: null };

describe('page meta', () => {
  it('uses the share texts of the site, with the built-in picture', () => {
    const catalog = createCatalogSeed();
    const meta = pageMeta(at('/'), catalog);
    const share = defaultSections(none).compartilhar;
    expect(meta).toMatchObject({ title: share.title, description: share.description, image: `${ORIGIN}/og-image.jpg`, url: `${ORIGIN}/`, type: 'website', noindex: false, preloadHero: true });
  });

  it('follows what the owner saved (texts, picture, hero)', () => {
    const base = createCatalogSeed();
    const d = defaultSections(none);
    const catalog = {
      ...base,
      content: {
        compartilhar: { title: 'ÉKA', description: 'Semijoias em Cuiabá', image: { src: MEDIA, alt: '' } },
        inicio: { ...d.inicio, hero: { ...d.inicio.hero, slides: [{ id: 's1', alt: 'x', image: { src: MEDIA, alt: 'x' }, frames: {} }] } },
      },
    };
    expect(pageMeta(at('/'), catalog)).toMatchObject({ title: 'ÉKA', description: 'Semijoias em Cuiabá', image: `${ORIGIN}/${MEDIA}`, preloadHero: false });
  });

  it('shows the piece on a product link: name, price, photo', () => {
    const catalog = createCatalogSeed();
    const p = catalog.products.find((x) => x.available)!;
    const meta = pageMeta(at(`/produto/${p.slug}`), catalog);
    expect(meta.type).toBe('product');
    expect(meta.title).toBe(`${p.name} · ÉKA Semijoias`);
    expect(meta.description).toMatch(/^R\$\s?\d/);
    expect(meta.image).toBe(`${ORIGIN}/${p.images[0]!.src}-960.webp`);
    expect(meta.preloadHero).toBe(false);
    // Hidden or unknown pieces fall back to the site texts.
    const hidden = { ...catalog, products: catalog.products.map((x) => (x.id === p.id ? { ...x, available: false } : x)) };
    expect(pageMeta(at(`/produto/${p.slug}`), hidden).type).toBe('website');
    expect(pageMeta(at('/produto/nao-existe'), catalog).type).toBe('website');
  });

  it('names categories and fixed pages; private areas are never indexed', () => {
    const catalog = createCatalogSeed();
    const c = catalog.categories[0]!;
    expect(pageMeta(at(`/catalogo/${c.slug}`), catalog).title).toBe(`${c.name} · ÉKA Semijoias`);
    expect(pageMeta(at('/privacidade/'), catalog).title).toBe('Política de privacidade · ÉKA Semijoias');
    for (const path of ['/admin', '/admin/pedidos', '/revenda/painel', '/pagamento/abc', '/r/ana']) expect(pageMeta(at(path), catalog).noindex).toBe(true);
    expect(pageMeta(at('/revendedoras'), catalog).noindex).toBe(false);
  });

  it('works without a catalog (database unavailable) with the built-in texts, never empty', () => {
    const share = defaultSections(none).compartilhar;
    expect(pageMeta(at('/'), null)).toMatchObject({ title: share.title, description: share.description, image: `${ORIGIN}/og-image.jpg`, preloadHero: true });
    const first = defaultSections(none).inicio.hero.slides[0]!;
    expect(DEFAULT_HERO).toEqual({ celular: first.frames.celular!.image!.src, computador: first.frames.computador!.image!.src });
    expect(DEFAULT_HERO).toEqual({ celular: 'images/hero/colo-celular', computador: 'images/hero/colo-computador' });
  });

  it('never throws: malformed addresses and unexpected stored shapes fall back to the built-in tags', () => {
    const catalog = createCatalogSeed();
    expect(pageMeta(at('/produto/%E0%A4%A'), catalog).type).toBe('website');
    expect(pageMeta(at('/catalogo/%E0'), catalog).title).toBe(defaultSections(none).compartilhar.title);
    const broken = { ...catalog, content: { inicio: { hero: null }, compartilhar: { title: 'X' } } } as never;
    expect(pageMeta(at('/'), broken)).toMatchObject({ title: defaultSections(none).compartilhar.title, description: defaultSections(none).compartilhar.description });
  });

  it('keeps the hero preloads only while the page opens on the built-in first photos', () => {
    const base = createCatalogSeed();
    const d = defaultSections(none).inicio;
    const withHero = (hero: unknown) => ({ ...base, content: { inicio: { ...d, hero } } }) as never;
    const [colo, mao, seda] = d.hero.slides as [HeroSlide, HeroSlide, HeroSlide];
    // Her own texts with the built-in photos, or her framing of them: same files, preloads kept.
    expect(pageMeta(at('/'), withHero({ ...d.hero, title: 'Outro título' })).preloadHero).toBe(true);
    const reframed = { ...colo, frames: { ...colo.frames, celular: { ...colo.frames.celular!, x: 20, zoom: 1.5 } } };
    expect(pageMeta(at('/'), withHero({ ...d.hero, slides: [reframed, mao, seda] })).preloadHero).toBe(true);
    // Another photo first, or another photo on a preloaded screen: the preloads go (never a wasted download).
    expect(pageMeta(at('/'), withHero({ ...d.hero, slides: [mao, colo, seda] })).preloadHero).toBe(false);
    const ownPhone = { ...colo, frames: { ...colo.frames, celular: { image: { src: MEDIA, alt: '' }, x: 50, y: 50, zoom: 1 } } };
    expect(pageMeta(at('/'), withHero({ ...d.hero, slides: [ownPhone, mao] })).preloadHero).toBe(false);
    // A section saved before the slides (one photo, not parsed in the Worker).
    expect(pageMeta(at('/'), withHero({ title: 'Brilho', image: { src: 'images/lifestyle/l01-hero-pescoco', alt: '' } })).preloadHero).toBe(false);
    // Only the home page preloads it.
    expect(pageMeta(at('/catalogo'), base).preloadHero).toBe(false);
  });

  it('builds absolute picture URLs and clips text at a word', () => {
    expect(absoluteImage(MEDIA, ORIGIN)).toBe(`${ORIGIN}/${MEDIA}`);
    expect(absoluteImage('images/hero/colo-computador', ORIGIN)).toBe(`${ORIGIN}/images/hero/colo-computador-1024.webp`);
    expect(absoluteImage('images/products/p01', ORIGIN)).toBe(`${ORIGIN}/images/products/p01-960.webp`);
    expect(absoluteImage('data:image/webp;base64,AA', ORIGIN)).toBeNull();
    expect(clip('Um  texto\ncom quebras', 100)).toBe('Um texto com quebras');
    const long = clip('palavra '.repeat(40), 50);
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/ …$/);
  });
});
