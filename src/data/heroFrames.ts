import type { ContentImage, HeroSlide } from './content';

/*
 * The shapes the home hero photo takes on each screen (src/components/home/Hero.tsx):
 * a 4:5 box on phones, then the right column of the desktop layout, whose
 * width/height ratio grows with the screen. Each slide may bring its own photo
 * and framing (focus point + zoom) per shape; the site, the editor
 * (Painel → Site → Página inicial), the share-tag preload and the tests all read
 * the shapes and their media queries from here, so they never drift apart.
 */

export const HERO_FRAMES = [
  { id: 'celular', label: 'Celular', ratio: '4 / 5', aspect: 4 / 5, media: '(max-width: 767px)', sizes: '100vw' },
  { id: 'tablet', label: 'Tablet em pé', ratio: '2 / 3', aspect: 2 / 3, media: '(min-width: 768px) and (max-width: 1023px)', sizes: '55vw' },
  { id: 'quadrado', label: 'Tablet deitado', ratio: '1 / 1', aspect: 1, media: '(min-width: 1024px) and (max-width: 1279px)', sizes: '55vw' },
  { id: 'computador', label: 'Computador', ratio: '4 / 3', aspect: 4 / 3, media: '(min-width: 1280px) and (max-width: 1799px)', sizes: '55vw' },
  { id: 'amplo', label: 'Tela grande', ratio: '16 / 9', aspect: 16 / 9, media: '(min-width: 1800px)', sizes: '55vw' },
] as const;

export type HeroFrameInfo = (typeof HERO_FRAMES)[number];
export type HeroFrameId = HeroFrameInfo['id'];
export const HERO_FRAME_IDS = HERO_FRAMES.map((f) => f.id) as unknown as readonly [HeroFrameId, ...HeroFrameId[]];

/** Built-in widths of the art-directed hero photos (public/images/hero/<slide>-<frame>-<width>.webp). */
export const HERO_WIDTHS = [640, 1024, 1600] as const;
export const HERO_STEM_PREFIX = 'images/hero/';

/** Focus in the middle, no zoom: what a frame shows until the owner frames it. */
export const FRAME_DEFAULT = { x: 50, y: 50, zoom: 1 } as const;

/** Share of the phone frame, from the bottom, that the headline covers (ivory gradient on the site). */
export const PHONE_TEXT_AREA = 0.38;

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2.5;
export const INTERVAL_MIN = 4;
export const INTERVAL_MAX = 12;
export const INTERVAL_DEFAULT = 6;
export const SLIDES_MAX = 5;

export interface FramePlacement {
  /** The photo this frame shows: its own, or the slide's main photo. */
  image: ContentImage;
  x: number;
  y: number;
  zoom: number;
  /** Whether the frame has its own photo. */
  ownImage: boolean;
  /** Whether anything differs from the automatic framing (own photo, focus or zoom). */
  adjusted: boolean;
}

/** What a slide shows in one frame. */
export function framePlacement(slide: HeroSlide, id: HeroFrameId): FramePlacement {
  const frame = slide.frames[id];
  const x = frame?.x ?? FRAME_DEFAULT.x;
  const y = frame?.y ?? FRAME_DEFAULT.y;
  const zoom = frame?.zoom ?? FRAME_DEFAULT.zoom;
  const ownImage = !!frame?.image;
  return {
    image: frame?.image ?? slide.image,
    x,
    y,
    zoom,
    ownImage,
    adjusted: x !== FRAME_DEFAULT.x || y !== FRAME_DEFAULT.y || zoom !== FRAME_DEFAULT.zoom,
  };
}

/**
 * The CSS of a framed photo, the same on the site and in the editor preview: the focus point
 * (x%, y%) of the picture sits at (x%, y%) of the box, and the zoom grows around it.
 */
export function frameStyle(p: { x: number; y: number; zoom: number }): { objectPosition: string; transform?: string; transformOrigin?: string } {
  const pos = `${p.x}% ${p.y}%`;
  return p.zoom === 1 ? { objectPosition: pos } : { objectPosition: pos, transform: `scale(${p.zoom})`, transformOrigin: pos };
}

/** CSS custom properties of one hero photo, one set per frame (read by heroFrameCss). */
export function frameVars(slide: HeroSlide): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const f of HERO_FRAMES) {
    const p = framePlacement(slide, f.id);
    vars[`--hx-${f.id}`] = `${p.x}%`;
    vars[`--hy-${f.id}`] = `${p.y}%`;
    vars[`--hz-${f.id}`] = String(p.zoom);
  }
  return vars;
}

/**
 * Static stylesheet of the site's hero photos: each frame's media query picks that frame's focus
 * and zoom from the custom properties of frameVars. The phone frame is the base rule (also the
 * <img> fallback of the <picture>), so the photo and its framing always agree.
 */
export function heroFrameCss(className: string): string {
  const rule = (id: HeroFrameId) =>
    `.${className}{object-position:var(--hx-${id}) var(--hy-${id});transform:scale(var(--hz-${id}));transform-origin:var(--hx-${id}) var(--hy-${id})}`;
  return HERO_FRAMES.map((f) => (f.id === 'celular' ? rule(f.id) : `@media ${f.media}{${rule(f.id)}}`)).join('');
}

/**
 * New focus point after dragging the photo by (dx, dy) px inside a box of `box` px, for a photo
 * of `natural` proportions shown with object-fit: cover at `zoom`. Moving the photo right shows
 * more of its left side (x goes down). The photo follows the finger 1:1; an axis with nothing
 * left to show keeps its value. Without the photo's size (not loaded yet), 1 box = 100 %.
 */
export function dragFocus(input: {
  start: { x: number; y: number };
  dx: number;
  dy: number;
  box: { width: number; height: number };
  natural: { width: number; height: number } | null;
  zoom: number;
}): { x: number; y: number } {
  const { start, dx, dy, box, natural, zoom } = input;
  if (box.width <= 0 || box.height <= 0) return start;
  let overflowX = box.width;
  let overflowY = box.height;
  if (natural && natural.width > 0 && natural.height > 0) {
    const scale = Math.max(box.width / natural.width, box.height / natural.height) * zoom;
    overflowX = natural.width * scale - box.width;
    overflowY = natural.height * scale - box.height;
  }
  const axis = (value: number, delta: number, overflow: number) => (overflow < 1 ? value : clampPercent(value - (delta / overflow) * 100));
  return { x: axis(start.x, dx, overflowX), y: axis(start.y, dy, overflowY) };
}

export const clampPercent = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
export const clampZoom = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100));

/** The first slide of a stored hero, whichever shape it was saved in (old single photo or slides). */
export function firstHeroSlide(hero: unknown): HeroSlide | null {
  if (!hero || typeof hero !== 'object') return null;
  const h = hero as { slides?: unknown; image?: unknown };
  if (Array.isArray(h.slides)) {
    const s = h.slides[0] as Partial<HeroSlide> | undefined;
    if (!s || typeof s !== 'object' || !s.image || typeof s.image.src !== 'string') return null;
    return { id: String(s.id ?? 'slide'), alt: String(s.alt ?? ''), image: s.image, frames: s.frames && typeof s.frames === 'object' ? s.frames : {} };
  }
  const image = h.image as ContentImage | undefined;
  return image && typeof image.src === 'string' ? { id: 'principal', alt: image.alt ?? '', image, frames: {} } : null;
}
