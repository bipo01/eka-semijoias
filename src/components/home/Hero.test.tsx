import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { defaultSections, factsOf } from '../../content/defaults';
import type { HeroSlide, SiteContent } from '../../data/content';
import { HERO_FRAMES } from '../../data/heroFrames';
import { createCatalogSeed } from '../../data/seed';
import { useCatalog } from '../../store/catalog';
import { Hero } from './Hero';

const catalog = createCatalogSeed();
const inicio = () => defaultSections(factsOf(catalog.settings, undefined)).inicio;
const MEDIA = `media/${'a'.repeat(64)}.webp`;

function show(content?: SiteContent) {
  useCatalog.setState({ data: { ...catalog, ...(content ? { content } : {}) }, version: 1, status: 'ready', offline: false });
  return render(
    <MemoryRouter>
      <Hero />
    </MemoryRouter>,
  );
}

const slides = () => [...document.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')];
const shown = () => slides().findIndex((s) => s.getAttribute('aria-hidden') !== 'true');
/** jsdom loads no images: settle every photo on the page by hand. */
const loadAll = () => document.querySelectorAll('img').forEach((img) => fireEvent.load(img));
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
// The controls exist twice (under the buttons on phones, on the photo from tablets up); jsdom applies no CSS.
const pauseButton = () => screen.getAllByRole('button', { name: /troca de fotos/ })[0]!;

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => mockReducedMotion(false));
afterEach(() => {
  vi.useRealTimers();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('Hero slider', () => {
  it('gives every screen its own photo: one <source> per frame and the phone photo on the <img>', () => {
    show();
    const picture = document.querySelector('picture')!;
    const sources = [...picture.querySelectorAll('source')];
    const others = HERO_FRAMES.filter((f) => f.id !== 'celular');
    expect(sources.map((s) => s.getAttribute('media'))).toEqual(others.map((f) => f.media));
    sources.forEach((s, i) => {
      const id = others[i]!.id;
      expect(s.getAttribute('srcset')).toBe(`/images/hero/colo-${id}-640.webp 640w, /images/hero/colo-${id}-1024.webp 1024w, /images/hero/colo-${id}-1600.webp 1600w`);
      expect(s.getAttribute('sizes')).toBe('55vw');
    });
    const img = picture.querySelector('img')!;
    expect(img.getAttribute('srcset')).toContain('/images/hero/colo-celular-1600.webp 1600w');
    expect(img).toHaveAttribute('sizes', '100vw');
    expect(img).toHaveAttribute('alt', 'Brinco Gota Cristal e Colar Ponto de Luz em ouro rosé, usados');
    // The first photo is the page's largest paint.
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('decoding', 'sync');
    expect(img.getAttribute('fetchpriority')).toBe('high');
    // Focus and zoom per screen travel as custom properties read by the frame stylesheet.
    expect(img.style.getPropertyValue('--hx-computador')).toBe('50%');
    expect(document.querySelector('style')?.textContent).toContain('@media (min-width: 1280px) and (max-width: 1799px)');
  });

  it('mounts the other photos only once the first one is on screen, lazily', () => {
    show();
    expect(document.querySelectorAll('picture')).toHaveLength(1);
    fireEvent.load(document.querySelector('img')!);
    const imgs = document.querySelectorAll('img');
    expect(imgs).toHaveLength(3);
    expect(imgs[1]).toHaveAttribute('loading', 'lazy');
    expect(imgs[2]?.getAttribute('srcset')).toContain('/images/hero/seda-celular-640.webp');
  });

  it('applies her framing per screen', () => {
    const own: HeroSlide = { id: 's1', name: '', alt: 'Anel', image: { src: MEDIA, alt: 'Anel' }, frames: { tablet: { x: 20, y: 75, zoom: 1.6 } } };
    show({ inicio: { ...inicio(), hero: { ...inicio().hero, slides: [own] } } });
    const img = document.querySelector('img')!;
    expect(img.style.getPropertyValue('--hx-tablet')).toBe('20%');
    expect(img.style.getPropertyValue('--hy-tablet')).toBe('75%');
    expect(img.style.getPropertyValue('--hz-tablet')).toBe('1.6');
    expect(img.style.getPropertyValue('--hz-celular')).toBe('1');
    // An uploaded photo is used as is on every screen.
    expect(img).toHaveAttribute('src', `/${MEDIA}`);
  });

  it('a single photo is a plain picture: no carousel, no controls', () => {
    const one: HeroSlide = { id: 's1', name: '', alt: 'Colar', image: { src: MEDIA, alt: 'Colar' }, frames: {} };
    show({ inicio: { ...inicio(), hero: { ...inicio().hero, slides: [one] } } });
    expect(screen.queryByRole('region', { name: 'Fotos em destaque' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mostrar foto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /troca de fotos/ })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Colar' })).toBeInTheDocument();
  });

  it('with several photos: a labelled carousel, "1 de 3" slides, dots and a pause button', () => {
    show();
    loadAll();
    expect(screen.getByRole('region', { name: 'Fotos em destaque' })).toHaveAttribute('aria-roledescription', 'carrossel');
    expect(slides().map((s) => s.getAttribute('aria-label'))).toEqual(['1 de 3: Brinco e colar', '2 de 3: Anel e pulseira', '3 de 3: Pulseira na seda']);
    expect(slides().map((s) => s.getAttribute('aria-hidden'))).toEqual([null, 'true', 'true']);
    const dots = screen.getAllByRole('button', { name: /Mostrar foto \d de 3/ }).slice(0, 3);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(dots[2]!);
    expect(shown()).toBe(2);
    expect(screen.getAllByRole('button', { name: 'Mostrar foto 3 de 3: Pulseira na seda' })[0]).toHaveAttribute('aria-current', 'true');
    expect(pauseButton()).toHaveAccessibleName('Pausar a troca de fotos');
  });

  it('changes photo on its own every interval, and the pause button stops it', () => {
    vi.useFakeTimers();
    show({ inicio: { ...inicio(), hero: { ...inicio().hero, interval: 4 } } });
    loadAll();
    loadAll(); // the photos mounted after the first one
    expect(shown()).toBe(0);
    tick(3900);
    expect(shown()).toBe(0);
    tick(200);
    expect(shown()).toBe(1);
    fireEvent.click(pauseButton());
    expect(pauseButton()).toHaveAccessibleName('Continuar a troca de fotos');
    tick(20_000);
    expect(shown()).toBe(1);
    fireEvent.click(pauseButton());
    tick(4000);
    expect(shown()).toBe(2);
    tick(4000);
    expect(shown()).toBe(0); // wraps around
  });

  it('waits for the next photo before changing (never fades into an empty frame)', () => {
    vi.useFakeTimers();
    show();
    fireEvent.load(document.querySelector('img')!);
    tick(30_000);
    expect(shown()).toBe(0);
    fireEvent.load(document.querySelectorAll('img')[1]!);
    tick(6000);
    expect(shown()).toBe(1);
  });

  it('pauses while the mouse is over the photos', () => {
    vi.useFakeTimers();
    show();
    loadAll();
    loadAll();
    const region = screen.getByRole('region', { name: 'Fotos em destaque' });
    fireEvent.pointerEnter(region, { pointerType: 'mouse' });
    tick(20_000);
    expect(shown()).toBe(0);
    fireEvent.pointerLeave(region, { pointerType: 'mouse' });
    tick(6000);
    expect(shown()).toBe(1);
  });

  it('with reduced motion the photos never change on their own (she can still start them)', () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    show();
    loadAll();
    loadAll();
    expect(pauseButton()).toHaveAccessibleName('Continuar a troca de fotos');
    tick(60_000);
    expect(shown()).toBe(0);
    fireEvent.click(pauseButton());
    tick(6000);
    expect(shown()).toBe(1);
  });
});
