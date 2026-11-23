import { FINISHES, type Catalog, type Finish, type Product } from '../data/schema';
import { byOrder, effectivePrice, isOnSale, isPurchasable } from '../data/catalog';
import { matches } from './search';

export const SORTS = [
  { value: 'destaques', label: 'Destaques' },
  { value: 'novidades', label: 'Novidades' },
  { value: 'menor-preco', label: 'Menor preço' },
  { value: 'maior-preco', label: 'Maior preço' },
] as const;
export type Sort = (typeof SORTS)[number]['value'];

export const PRICE_PRESETS = [
  { label: 'Até R$ 100', min: null, max: 100 },
  { label: 'R$ 100 a R$ 200', min: 100, max: 200 },
  { label: 'Acima de R$ 200', min: 200, max: null },
] as const;

export const PAGE_SIZE = 24;

export interface CatalogFilters {
  q: string;
  finishes: Finish[];
  /** Price bounds in whole reais (as typed in the URL). */
  priceMin: number | null;
  priceMax: number | null;
  onlyAvailable: boolean;
  onlyPromo: boolean;
  sort: Sort;
  show: number;
}

const toNumber = (v: string | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export function parseFilters(params: URLSearchParams): CatalogFilters {
  const finishes = (params.get('acabamento') ?? '')
    .split(',')
    .filter((f): f is Finish => (FINISHES as readonly string[]).includes(f));
  const [minRaw, maxRaw] = (params.get('preco') ?? '').split('-');
  const sortRaw = params.get('ordem');
  const show = toNumber(params.get('mostrar') ?? undefined);
  return {
    q: params.get('q') ?? '',
    finishes,
    priceMin: toNumber(minRaw),
    priceMax: toNumber(maxRaw),
    onlyAvailable: params.get('disponivel') === '1',
    onlyPromo: params.get('promo') === '1',
    sort: SORTS.some((s) => s.value === sortRaw) ? (sortRaw as Sort) : 'destaques',
    show: show && show > PAGE_SIZE ? Math.min(show, 500) : PAGE_SIZE,
  };
}

/** Serializes filters back to a query string, omitting defaults so URLs stay short and shareable. */
export function filtersToParams(f: CatalogFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.finishes.length) p.set('acabamento', f.finishes.join(','));
  if (f.priceMin != null || f.priceMax != null) p.set('preco', `${f.priceMin ?? ''}-${f.priceMax ?? ''}`);
  if (f.onlyAvailable) p.set('disponivel', '1');
  if (f.onlyPromo) p.set('promo', '1');
  if (f.sort !== 'destaques') p.set('ordem', f.sort);
  if (f.show > PAGE_SIZE) p.set('mostrar', String(f.show));
  return p;
}

export function filterProducts(data: Catalog, categoryId: string | null, f: CatalogFilters): Product[] {
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const list = data.products.filter((p) => {
    if (categoryId && p.categoryId !== categoryId) return false;
    if (f.q && !matches(`${p.name} ${catName.get(p.categoryId) ?? ''} ${p.description}`, f.q)) return false;
    if (f.finishes.length && !p.variants.some((v) => f.finishes.includes(v.finish))) return false;
    const price = effectivePrice(p);
    if (f.priceMin != null && price < f.priceMin * 100) return false;
    if (f.priceMax != null && price > f.priceMax * 100) return false;
    if (f.onlyAvailable && !isPurchasable(p, data.stock)) return false;
    if (f.onlyPromo && !isOnSale(p)) return false;
    return true;
  });
  const compare: Record<Sort, (a: Product, b: Product) => number> = {
    destaques: byOrder,
    novidades: (a, b) => b.createdAt.localeCompare(a.createdAt),
    'menor-preco': (a, b) => effectivePrice(a) - effectivePrice(b),
    'maior-preco': (a, b) => effectivePrice(b) - effectivePrice(a),
  };
  // Sold-out pieces always go to the end.
  return list.sort((a, b) => Number(isPurchasable(b, data.stock)) - Number(isPurchasable(a, data.stock)) || compare[f.sort](a, b));
}

export function activeFilterCount(f: CatalogFilters): number {
  return f.finishes.length + (f.priceMin != null || f.priceMax != null ? 1 : 0) + (f.onlyAvailable ? 1 : 0) + (f.onlyPromo ? 1 : 0);
}

export function priceLabel(min: number | null, max: number | null): string {
  if (min != null && max != null) return `R$ ${min} a R$ ${max}`;
  if (max != null) return `Até R$ ${max}`;
  return `Acima de R$ ${min}`;
}
