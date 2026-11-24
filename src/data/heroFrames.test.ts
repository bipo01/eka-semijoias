import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultSections, resolveSection, type ContentFacts } from '../content/defaults';
import { contentImageSources, parseSection, siteContentSchema, type HeroSlide } from './content';
import { dragFocus, firstHeroSlide, framePlacement, frameStyle, frameVars, HERO_FRAME_IDS, HERO_FRAMES, heroFrameCss } from './heroFrames';

const none: ContentFacts = { warrantyMonths: null, whatsapp: null, shipsNationwide: null, hypoallergenic: null, installments: null, plating: null, consignment: null, noUpfrontInvestment: null };
const MEDIA = `media/${'a'.repeat(64)}.webp`;
const inicio = () => defaultSections(none).inicio;
const slide = (over: Partial<HeroSlide> = {}): HeroSlide => ({ id: 's1', alt: 'Colar no colo', image: { src: MEDIA, alt: 'Colar no colo' }, frames: {}, ...over });
const withSlides = (slides: unknown[], extra: Record<string, unknown> = {}) => ({ ...inicio(), hero: { ...inicio().hero, slides, ...extra } });

describe('hero frames', () => {
  it('cover every screen width once, phone first, with the shapes of the layout', () => {
    expect(HERO_FRAME_IDS).toEqual(['celular', 'tablet', 'quadrado', 'computador', 'amplo']);
    expect(HERO_FRAMES.map((f) => f.media)).toEqual([
      '(max-width: 767px)',
      '(min-width: 768px) and (max-width: 1023px)',
      '(min-width: 1024px) and (max-width: 1279px)',
      '(min-width: 1280px) and (max-width: 1799px)',
      '(min-width: 1800px)',
    ]);
    expect(HERO_FRAMES.map((f) => f.ratio)).toEqual(['4 / 5', '2 / 3', '1 / 1', '4 / 3', '16 / 9']);
    expect(HERO_FRAMES.map((f) => f.label)).toEqual(['Celular', 'Tablet em pé', 'Tablet deitado', 'Computador', 'Tela grande']);
  });

  it('place a slide: own photo and framing, or the main photo centered', () => {
    const own = { src: `media/${'b'.repeat(64)}.webp`, alt: '' };
    const s = slide({ frames: { tablet: { image: own, x: 20, y: 80, zoom: 1.5 }, amplo: { x: 50, y: 50, zoom: 1 } } });
    expect(framePlacement(s, 'celular')).toEqual({ image: s.image, x: 50, y: 50, zoom: 1, ownImage: false, adjusted: false });
    expect(framePlacement(s, 'tablet')).toEqual({ image: own, x: 20, y: 80, zoom: 1.5, ownImage: true, adjusted: true });
    expect(framePlacement(s, 'amplo').adjusted).toBe(false);
  });

  it('frame CSS: the focus stays put while zooming, the same on the site and in the editor', () => {
    expect(frameStyle({ x: 30, y: 70, zoom: 1 })).toEqual({ objectPosition: '30% 70%' });
    expect(frameStyle({ x: 30, y: 70, zoom: 1.5 })).toEqual({ objectPosition: '30% 70%', transform: 'scale(1.5)', transformOrigin: '30% 70%' });
    const vars = frameVars(slide({ frames: { computador: { x: 10, y: 90, zoom: 2 } } }));
    expect(vars).toMatchObject({ '--hx-celular': '50%', '--hx-computador': '10%', '--hy-computador': '90%', '--hz-computador': '2' });
    const css = heroFrameCss('shot');
    // The phone frame is the base rule; every other frame has exactly its <source> media query.
    expect(css.startsWith('.shot{object-position:var(--hx-celular) var(--hy-celular);transform:scale(var(--hz-celular))')).toBe(true);
    for (const f of HERO_FRAMES.slice(1)) expect(css).toContain(`@media ${f.media}{.shot{object-position:var(--hx-${f.id}) var(--hy-${f.id})`);
  });

  it('dragging follows the finger: right shows more of the left side, an axis with nothing to show stays', () => {
    // A 1000×1500 portrait photo in a 400×300 box: cover → 400×600, 300 px to spare vertically, none sideways.
    const base = { start: { x: 50, y: 50 }, box: { width: 400, height: 300 }, natural: { width: 1000, height: 1500 }, zoom: 1 };
    expect(dragFocus({ ...base, dx: 100, dy: -150 })).toEqual({ x: 50, y: 100 });
    expect(dragFocus({ ...base, dx: 0, dy: 60 })).toEqual({ x: 50, y: 30 });
    // Zoom 2 → 800×1200: 400 px to spare sideways.
    expect(dragFocus({ ...base, zoom: 2, dx: 100, dy: 0 })).toEqual({ x: 25, y: 50 });
    // Clamped to the photo.
    expect(dragFocus({ ...base, dx: 0, dy: -9999 })).toEqual({ x: 50, y: 100 });
    // Before the photo's size is known: one box = 100 %.
    expect(dragFocus({ ...base, natural: null, dx: -40, dy: 30 })).toEqual({ x: 60, y: 40 });
  });

  it('read the first slide of any stored hero shape', () => {
    expect(firstHeroSlide({ slides: [slide()] })?.image.src).toBe(MEDIA);
    expect(firstHeroSlide({ image: { src: MEDIA, alt: 'x' } })).toEqual({ id: 'principal', alt: 'x', image: { src: MEDIA, alt: 'x' }, frames: {} });
    for (const broken of [null, 42, {}, { slides: [] }, { slides: [null] }, { slides: [{ image: 3 }] }]) expect(firstHeroSlide(broken)).toBeNull();
  });

  it('index.html preloads the built-in first slide with the media, widths and sizes of its <picture>', () => {
    const html = readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    const links = [...html.matchAll(/<link rel="preload" as="image"[^>]*>/g)].map((m) => m[0]);
    expect(links).toHaveLength(2);
    const first = inicio().hero.slides[0]!;
    for (const [i, id] of (['celular', 'computador'] as const).entries()) {
      const f = HERO_FRAMES.find((x) => x.id === id)!;
      const stem = framePlacement(first, id).image.src;
      expect(links[i]).toContain(`media="${f.media}"`);
      expect(links[i]).toContain(`imagesizes="${f.sizes}"`);
      for (const w of [640, 1024, 1600]) expect(links[i]).toContain(`%BASE_URL%${stem}-${w}.webp ${w}w`);
    }
  });
});

describe('hero slides schema', () => {
  it('the built-in hero has three art-directed slides, each frame with its own photo, centered', () => {
    const hero = inicio().hero;
    expect(hero.interval).toBe(6);
    expect(hero.slides.map((s) => s.id)).toEqual(['colo', 'mao', 'seda']);
    for (const s of hero.slides) {
      expect(s.image.src).toBe(`images/hero/${s.id}-computador`);
      expect(s.alt).toBeTruthy();
      for (const id of HERO_FRAME_IDS) expect(s.frames[id]).toEqual({ image: { src: `images/hero/${s.id}-${id}`, alt: s.alt }, x: 50, y: 50, zoom: 1 });
    }
  });

  it('reads a section saved with the old single photo as one slide (nothing she saved breaks)', () => {
    const { slides: _slides, interval: _interval, ...texts } = inicio().hero;
    const old = { ...inicio(), hero: { ...texts, image: { src: MEDIA, alt: 'Colar Ponto de Luz no colo' } } };
    const r = parseSection('inicio', old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.hero.slides).toEqual([{ id: 'principal', alt: 'Colar Ponto de Luz no colo', image: { src: MEDIA, alt: 'Colar Ponto de Luz no colo' }, frames: {} }]);
    expect(r.data.hero.interval).toBe(6);
    expect('image' in r.data.hero).toBe(false);
    // Through the public catalog too, and the site shows her photo (never the built-in ones).
    const content = siteContentSchema.parse({ inicio: old });
    expect(content.inicio?.hero.slides[0]!.image.src).toBe(MEDIA);
    expect(resolveSection('inicio', content, none).hero.slides).toHaveLength(1);
    expect(contentImageSources(content)).toContain(MEDIA);
  });

  it('round-trips the new shape and fills framing defaults', () => {
    const data = withSlides([slide({ frames: { celular: { x: 12, y: 88, zoom: 1.75 }, tablet: { image: { src: MEDIA, alt: '' } } } as never })], { interval: 9 });
    const r = parseSection('inicio', data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.hero.interval).toBe(9);
    expect(r.data.hero.slides[0]!.frames).toEqual({ celular: { x: 12, y: 88, zoom: 1.75 }, tablet: { image: { src: MEDIA, alt: '' }, x: 50, y: 50, zoom: 1 } });
    expect(parseSection('inicio', r.data)).toEqual(r);
    // A slide without frames is the main photo everywhere.
    const bare = parseSection('inicio', withSlides([{ id: 's1', alt: '', image: { src: MEDIA, alt: '' } }]));
    expect(bare.ok && bare.data.hero.slides[0]!.frames).toEqual({});
  });

  it('enforces the limits: 1 to 5 slides, focus 0–100, zoom 100–250 %, 4–12 seconds', () => {
    expect(parseSection('inicio', withSlides([]))).toMatchObject({ ok: false, path: 'hero.slides', error: 'Deixe pelo menos 1 foto.' });
    const six = Array.from({ length: 6 }, (_, i) => slide({ id: `s${i}` }));
    expect(parseSection('inicio', withSlides(six))).toMatchObject({ ok: false, path: 'hero.slides', error: 'No máximo 5 fotos.' });
    expect(parseSection('inicio', withSlides(six.slice(0, 5))).ok).toBe(true);
    const framed = (frame: Record<string, unknown>) => withSlides([slide({ frames: { amplo: frame } as never })]);
    expect(parseSection('inicio', framed({ x: 101, y: 50, zoom: 1 }))).toMatchObject({ ok: false, path: 'hero.slides.0.frames.amplo.x' });
    expect(parseSection('inicio', framed({ x: 50, y: -1, zoom: 1 }))).toMatchObject({ ok: false, path: 'hero.slides.0.frames.amplo.y' });
    expect(parseSection('inicio', framed({ x: 50.5, y: 50, zoom: 1 }))).toMatchObject({ ok: false, path: 'hero.slides.0.frames.amplo.x' });
    expect(parseSection('inicio', framed({ x: 0, y: 100, zoom: 2.5 })).ok).toBe(true);
    expect(parseSection('inicio', framed({ x: 50, y: 50, zoom: 2.6 }))).toMatchObject({ ok: false, path: 'hero.slides.0.frames.amplo.zoom' });
    expect(parseSection('inicio', framed({ x: 50, y: 50, zoom: 0.9 }))).toMatchObject({ ok: false, path: 'hero.slides.0.frames.amplo.zoom' });
    for (const interval of [3, 13, 6.5]) expect(parseSection('inicio', withSlides([slide()], { interval }))).toMatchObject({ ok: false, path: 'hero.interval' });
    expect(parseSection('inicio', withSlides([slide()], { interval: 12 })).ok).toBe(true);
    expect(parseSection('inicio', withSlides([slide({ alt: 'a'.repeat(201) })]))).toMatchObject({ ok: false, path: 'hero.slides.0.alt' });
    expect(parseSection('inicio', withSlides([slide({ id: 'não vale' })]))).toMatchObject({ ok: false, path: 'hero.slides.0.id' });
  });
});
