import type { Catalog } from '../data/schema';

const PAGE_NAMES: Record<string, string> = {
  '/': 'Início',
  '/catalogo': 'Catálogo',
  '/sacola': 'Sacola',
  '/favoritos': 'Favoritos',
  '/revendedoras': 'Revendedoras',
  '/como-cuidar': 'Como cuidar',
  '/garantia': 'Garantia',
  '/sobre': 'Sobre',
  '/contato': 'Contato',
  '/privacidade': 'Privacidade',
};

/** The name of a store page ("Brincos", "Brinco Gota Cristal", "Início"), or null for any other page. */
export function storePageName(pathname: string, data: Pick<Catalog, 'categories' | 'products'>): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  const [, section, slug, ...rest] = path.split('/');
  if (!slug || rest.length) return null;
  if (section === 'catalogo') return data.categories.find((c) => c.slug === slug)?.name ?? null;
  if (section === 'produto') return data.products.find((p) => p.slug === slug)?.name ?? null;
  return null;
}
