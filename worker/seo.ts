import { defaultSections } from '../src/content/defaults';
import { parseSection } from '../src/data/content';
import { firstHeroSlide, framePlacement, HERO_STEM_PREFIX, HERO_WIDTHS, type HeroFrameId } from '../src/data/heroFrames';
import { MEDIA_KEY_PATTERN } from '../src/data/imageSrc';
import type { Catalog } from '../src/data/schema';
import { formatBRL } from '../src/lib/format';

/*
 * Title, description and share picture of every page, written into the HTML
 * the Worker serves (crawlers and WhatsApp/Instagram link previews do not run
 * the app). The texts come from Painel → Site → "Google e compartilhamento";
 * a product link shows the piece itself (photo, name, price). Pure: the
 * HTMLRewriter glue lives in index.ts.
 */

export const STORE_NAME = 'ÉKA Semijoias';

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute URL of the share picture. */
  image: string;
  url: string;
  type: 'website' | 'product';
  /** Private areas: never indexed. */
  noindex: boolean;
  /** Whether the built-in first hero slide is the one the page shows first (keeps its preloads). */
  preloadHero: boolean;
}

const PAGE_TITLES: Record<string, string> = {
  '/catalogo': 'Catálogo',
  '/sobre': 'Sobre a ÉKA',
  '/como-cuidar': 'Como cuidar',
  '/garantia': 'Garantia e trocas',
  '/revendedoras': 'Seja revendedora',
  '/contato': 'Contato',
  '/privacidade': 'Política de privacidade',
  '/favoritos': 'Favoritos',
  '/sacola': 'Sua sacola',
};
const PRIVATE = /^\/(admin|revenda|pagamento|r)(\/|$)/;
const NO_FACTS = { warrantyMonths: null, whatsapp: null, shipsNationwide: null, hypoallergenic: null, installments: null, plating: null, consignment: null, noUpfrontInvestment: null };

/** Frames of the first hero slide preloaded by index.html (phones and the common laptop/desktop sizes). */
export const PRELOADED_FRAMES: readonly HeroFrameId[] = ['celular', 'computador'];
/** The built-in first slide's photo per preloaded frame (what index.html preloads). */
export const DEFAULT_HERO: Readonly<Record<string, string>> = Object.fromEntries(
  PRELOADED_FRAMES.map((id) => [id, framePlacement(defaultSections(NO_FACTS).inicio.hero.slides[0]!, id).image.src]),
);

/** Absolute URL of a catalog/content image for previews (largest built-in size, or the uploaded file). */
export function absoluteImage(src: string, origin: string): string | null {
  if (MEDIA_KEY_PATTERN.test(src)) return `${origin}/${src}`;
  if (src.startsWith(HERO_STEM_PREFIX) && /^images\/[a-z0-9/_-]+$/.test(src)) return `${origin}/${src}-${HERO_WIDTHS[1]}.webp`;
  if (/^images\/[a-z0-9/_-]+$/.test(src)) return `${origin}/${src}-960.webp`;
  return null;
}

/** Plain one-line text, cut at a word boundary. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

/** Built-in share texts (they do not depend on business facts). */
const BUILT_IN_SHARE = defaultSections(NO_FACTS).compartilhar;

const decode = (part: string): string | null => {
  try {
    return decodeURIComponent(part);
  } catch {
    return null; // malformed escape: no match, the app shows "não encontrada"
  }
};

/** Private areas never read the catalog for their tags. */
export const isPrivatePath = (pathname: string) => PRIVATE.test(pathname.replace(/\/+$/, '') || '/');

/**
 * Whether the home page opens on the built-in first hero photos (so index.html's preloads are the
 * photos it shows): no saved "Página inicial", or a first slide that still shows those photos on
 * the preloaded frames (her framing may differ: same files). Reads the stored shape as is (the
 * snapshot is not parsed here), old single-photo heroes included.
 */
export function showsBuiltInHero(catalog: Catalog | null): boolean {
  const inicio = catalog?.content?.inicio as { hero?: unknown } | undefined;
  if (!inicio) return true;
  const slide = firstHeroSlide(inicio.hero);
  return !!slide && PRELOADED_FRAMES.every((id) => framePlacement(slide, id).image.src === DEFAULT_HERO[id]);
}

/** The page's tags; never throws (an unexpected stored shape falls back to the built-in tags). */
export function pageMeta(url: URL, catalog: Catalog | null): PageMeta {
  try {
    return buildMeta(url, catalog);
  } catch {
    return buildMeta(url, null);
  }
}

function buildMeta(url: URL, catalog: Catalog | null): PageMeta {
  const origin = url.origin;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const stored = catalog?.content?.compartilhar === undefined ? null : parseSection('compartilhar', catalog.content.compartilhar);
  const share = stored?.ok ? stored.data : BUILT_IN_SHARE;
  const siteTitle = share.title;
  const description = share.description;
  const image = (share.image && absoluteImage(share.image.src, origin)) || `${origin}/og-image.jpg`;
  const base: PageMeta = { title: siteTitle, description, image, url: `${origin}${path === '/' ? '/' : path}`, type: 'website', noindex: PRIVATE.test(path), preloadHero: path === '/' && showsBuiltInHero(catalog) };
  if (!catalog || base.noindex) return base;

  const product = /^\/produto\/([^/]+)$/.exec(path);
  if (product) {
    const slug = decode(product[1]!);
    const p = slug === null ? undefined : catalog.products.find((x) => x.slug === slug && x.available);
    if (!p) return base;
    const price = formatBRL(p.promoPrice ?? p.price);
    const picture = p.images[0] ? absoluteImage(p.images[0].src, origin) : null;
    return { ...base, title: `${p.name} · ${STORE_NAME}`, description: clip(`${price} · ${p.description || description}`, 200), ...(picture ? { image: picture } : {}), type: 'product' };
  }
  const category = /^\/catalogo\/([^/]+)$/.exec(path);
  if (category) {
    const slug = decode(category[1]!);
    const c = slug === null ? undefined : catalog.categories.find((x) => x.slug === slug);
    return c ? { ...base, title: `${c.name} · ${STORE_NAME}` } : base;
  }
  const page = PAGE_TITLES[path];
  return page ? { ...base, title: `${page} · ${STORE_NAME}` } : base;
}
