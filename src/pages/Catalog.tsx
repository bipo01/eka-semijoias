import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Check, Search, SlidersHorizontal, X } from 'lucide-react';
import { BackLink } from '../components/layout/BackLink';
import { ProductGrid } from '../components/product/ProductCard';
import { Button, ButtonAnchor } from '../components/ui/Button';
import { BareInput, TextField } from '../components/ui/Field';
import { WhatsAppIcon } from '../components/ui/Icons';
import { Chip, SwatchDot, Switch } from '../components/ui/Misc';
import { Sheet } from '../components/ui/Sheet';
import { cx } from '../components/ui/cx';
import { categoriesWithProducts } from '../data/catalog';
import { FINISHES, FINISH_LABEL, type Finish } from '../data/schema';
import { useBusiness } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSection } from '../hooks/useSection';
import { useMessages } from '../hooks/useMessages';
import {
  activeFilterCount,
  filterProducts,
  filtersToParams,
  PAGE_SIZE,
  parseFilters,
  PRICE_PRESETS,
  priceLabel,
  SORTS,
  type CatalogFilters,
} from '../lib/catalogQuery';
import { whatsappUrl } from '../lib/whatsapp';
import { useCatalog } from '../store/catalog';
import { NotFoundPage } from './NotFound';

export function CatalogPage() {
  const { categoria } = useParams();
  const [params, setParams] = useSearchParams();
  const data = useCatalog((s) => s.data);
  const biz = useBusiness();
  const message = useMessages();
  const filters = useMemo(() => parseFilters(params), [params]);
  const category = categoria ? data.categories.find((c) => c.slug === categoria) : null;
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [query, setQuery] = useState(filters.q);

  const geral = useSection('geral');
  // An unknown category shows the not-found page: its title, not "Catálogo" (this effect runs after the child's).
  useDocumentTitle(category ? category.name : categoria ? (geral.categoryNotFoundTitle ?? geral.notFoundTitle) : 'Catálogo');

  // Keep the input in sync when the URL changes (back/forward, chips).
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    setQuery(filters.q);
  }

  const update = (patch: Partial<CatalogFilters>, opts: { replace?: boolean } = {}) => {
    const next = { ...filters, show: PAGE_SIZE, ...patch };
    setParams(filtersToParams(next), { replace: opts.replace ?? false, preventScrollReset: true });
  };

  // Debounced search (150 ms) that replaces the history entry instead of stacking one per keystroke.
  useEffect(() => {
    if (query === filters.q) return;
    const t = window.setTimeout(() => update({ q: query }, { replace: true }), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `update` is derived from the current URL
  }, [query]);

  const results = useMemo(() => filterProducts(data, category?.id ?? null, filters), [data, category, filters]);

  if (categoria && !category) return <NotFoundPage kind="categoria" />;

  const visible = results.slice(0, filters.show);
  const activeCount = activeFilterCount(filters);
  const search = params.toString() ? `?${filtersToParams({ ...filters, show: PAGE_SIZE }).toString()}` : '';

  const activeChips: { key: string; label: string; remove: () => void }[] = [
    ...filters.finishes.map((f) => ({ key: f, label: FINISH_LABEL[f], remove: () => update({ finishes: filters.finishes.filter((x) => x !== f) }) })),
    ...(filters.priceMin != null || filters.priceMax != null ? [{ key: 'preco', label: priceLabel(filters.priceMin, filters.priceMax), remove: () => update({ priceMin: null, priceMax: null }) }] : []),
    ...(filters.onlyAvailable ? [{ key: 'disp', label: 'Disponíveis', remove: () => update({ onlyAvailable: false }) }] : []),
    ...(filters.onlyPromo ? [{ key: 'promo', label: 'Em promoção', remove: () => update({ onlyPromo: false }) }] : []),
  ];

  return (
    <div className={cx('container-x pb-16', category ? 'pt-3 lg:pt-6' : 'pt-6 lg:pt-10')}>
      {category && <BackLink up={{ to: '/catalogo', label: 'Catálogo' }} siblings="/catalogo/" className="mb-2 lg:mb-3" />}
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-display-l">{category ? category.name : 'Catálogo'}</h1>
        <p className="shrink-0 text-ink-muted" aria-live="polite">
          {results.length} {results.length === 1 ? 'peça' : 'peças'}
        </p>
      </div>

      <form role="search" className="mt-4 lg:max-w-md" onSubmit={(e) => { e.preventDefault(); update({ q: query }, { replace: true }); }}>
        <label htmlFor="catalog-search" className="sr-only">Buscar peças</label>
        <BareInput id="catalog-search" type="search" enterKeyHint="search" placeholder="Buscar peças" icon={<Search size={20} strokeWidth={1.5} />} value={query} onChange={(e) => setQuery(e.target.value)} />
      </form>

      {/* Desktop: category chips and Filtrar/Ordenar share one row. */}
      <div className="lg:mt-4 lg:flex lg:items-center lg:justify-between lg:gap-6">
        <nav aria-label="Categorias" className="-mx-[var(--gutter)] mt-4 lg:mx-0 lg:mt-0 lg:min-w-0 lg:flex-1">
          <ul className="no-scrollbar flex gap-2 overflow-x-auto px-[var(--gutter)] py-1 lg:px-0">
          <li>
            <Link to={`/catalogo${search}`} aria-current={!category ? 'page' : undefined} className={chipLink(!category)}>Todos</Link>
          </li>
          {categoriesWithProducts(data).map((c) => (
            <li key={c.id}>
              <Link to={`/catalogo/${c.slug}${search}`} aria-current={category?.id === c.id ? 'page' : undefined} className={chipLink(category?.id === c.id)}>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:mt-0 lg:flex lg:shrink-0">
        <Button variant="secondary" size="sm" onClick={() => setFilterOpen(true)} className="max-[359px]:gap-1.5 max-[359px]:px-3 lg:min-w-40">
          <SlidersHorizontal size={18} strokeWidth={1.5} aria-hidden="true" /> Filtrar{activeCount > 0 && <span className="price">({activeCount})</span>}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSortOpen(true)} className="max-[359px]:gap-1.5 max-[359px]:px-3 lg:min-w-40">
          <ArrowUpDown size={18} strokeWidth={1.5} aria-hidden="true" /> {filters.sort === 'destaques' ? 'Ordenar' : SORTS.find((s) => s.value === filters.sort)!.label}
        </Button>
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button key={chip.key} type="button" onClick={chip.remove} aria-label={`Remover filtro ${chip.label}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-champagne pr-3 pl-4 text-sm hover:bg-[#ecd9cb]">
              {chip.label} <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={() => update({ finishes: [], priceMin: null, priceMax: null, onlyAvailable: false, onlyPromo: false })} className="min-h-10 px-2 text-sm text-copper underline underline-offset-4">
            Limpar tudo
          </button>
        </div>
      )}

      {visible.length ? (
        <>
          <ProductGrid products={visible} priorityCount={2} className="mt-6 lg:mt-8" />
          <div className="mt-10 flex flex-col items-center gap-3">
            <p className="text-sm text-ink-muted">
              Mostrando {visible.length} de {results.length}
            </p>
            {visible.length < results.length && (
              <Button variant="secondary" onClick={() => update({ show: filters.show + PAGE_SIZE }, { replace: true })}>
                Carregar mais
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="mx-auto mt-12 flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="font-display text-display-m">Nenhuma peça encontrada</p>
          {/* An empty category with no filter on: nothing to clear, just say so. */}
          <p className="text-ink-muted">{activeCount > 0 || filters.q ? 'Tente outra busca ou limpe os filtros.' : 'Ainda não temos peças nesta categoria.'}</p>
          {(activeCount > 0 || filters.q) && (
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setParams(new URLSearchParams(), { preventScrollReset: true });
              }}
            >
              Limpar filtros
            </Button>
          )}
          {category && (
            <Link to="/catalogo" className="min-h-11 text-copper underline underline-offset-4">
              Ver todas as peças
            </Link>
          )}
          <div className="mt-6 w-full rounded-[12px] bg-champagne p-5">
            <p className="font-display text-title">Procurando algo específico?</p>
            <ButtonAnchor href={whatsappUrl(biz.whatsapp, message('procura', { busca: filters.q ? `"${filters.q}"` : 'uma peça' }))} className="mt-3" block>
              <WhatsAppIcon size={20} /> Fale com a gente
            </ButtonAnchor>
          </div>
        </div>
      )}

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} filters={filters} countFor={(f) => filterProducts(data, category?.id ?? null, f).length} onApply={(patch) => { update(patch); setFilterOpen(false); }} />

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Ordenar por" className="md-center">
        <ul role="radiogroup" aria-label="Ordenar por" className="flex flex-col">
          {SORTS.map((s) => {
            const checked = filters.sort === s.value;
            return (
              <li key={s.value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => {
                    update({ sort: s.value }, { replace: true });
                    setSortOpen(false);
                  }}
                  className="flex min-h-13 w-full items-center justify-between border-b border-line text-left"
                >
                  <span className={cx(checked && 'font-medium text-copper')}>{s.label}</span>
                  {checked && <Check size={20} strokeWidth={1.5} className="text-copper" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}

function chipLink(selected: boolean) {
  return cx(
    'inline-flex min-h-10 items-center rounded-full border px-4 text-sm whitespace-nowrap transition-colors',
    selected ? 'border-copper bg-copper text-white' : 'border-line bg-white text-ink hover:border-copper',
  );
}

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: CatalogFilters;
  countFor: (f: CatalogFilters) => number;
  onApply: (patch: Partial<CatalogFilters>) => void;
}

function FilterSheet({ open, onClose, filters, countFor, onApply }: FilterSheetProps) {
  const [draft, setDraft] = useState(filters);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(filters); // start each session from the applied filters
  }
  const set = (patch: Partial<CatalogFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleFinish = (f: Finish) => set({ finishes: draft.finishes.includes(f) ? draft.finishes.filter((x) => x !== f) : [...draft.finishes, f] });
  const count = countFor(draft);
  const invalidRange = draft.priceMin != null && draft.priceMax != null && draft.priceMin > draft.priceMax;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtrar"
      className="md-right"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setDraft({ ...draft, finishes: [], priceMin: null, priceMax: null, onlyAvailable: false, onlyPromo: false })}>
            Limpar
          </Button>
          <Button block disabled={invalidRange} onClick={() => onApply({ finishes: draft.finishes, priceMin: draft.priceMin, priceMax: draft.priceMax, onlyAvailable: draft.onlyAvailable, onlyPromo: draft.onlyPromo })}>
            Ver {count} {count === 1 ? 'peça' : 'peças'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-7">
        <fieldset>
          <legend className="mb-3 font-medium">Acabamento</legend>
          <div className="flex flex-wrap gap-2">
            {FINISHES.map((f) => (
              <Chip key={f} selected={draft.finishes.includes(f)} onClick={() => toggleFinish(f)}>
                <SwatchDot finish={f} size={14} /> {FINISH_LABEL[f]}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 font-medium">Faixa de preço</legend>
          <div className="flex flex-wrap gap-2">
            {PRICE_PRESETS.map((p) => (
              <Chip key={p.label} selected={draft.priceMin === p.min && draft.priceMax === p.max} onClick={() => set({ priceMin: p.min, priceMax: p.max })}>
                {p.label}
              </Chip>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <TextField label="Mínimo (R$)" inputMode="numeric" pattern="[0-9]*" value={draft.priceMin ?? ''} onChange={(e) => set({ priceMin: e.target.value.replace(/\D/g, '') === '' ? null : Number(e.target.value.replace(/\D/g, '')) })} />
            <TextField label="Máximo (R$)" inputMode="numeric" pattern="[0-9]*" value={draft.priceMax ?? ''} error={invalidRange ? 'Precisa ser maior que o mínimo' : undefined} onChange={(e) => set({ priceMax: e.target.value.replace(/\D/g, '') === '' ? null : Number(e.target.value.replace(/\D/g, '')) })} />
          </div>
        </fieldset>
        <div className="flex flex-col divide-y divide-line border-y border-line">
          <div className="flex min-h-13 items-center justify-between gap-3">
            <span id="f-available">Somente disponíveis</span>
            <Switch checked={draft.onlyAvailable} onChange={(v) => set({ onlyAvailable: v })} label="Somente disponíveis" />
          </div>
          <div className="flex min-h-13 items-center justify-between gap-3">
            <span>Em promoção</span>
            <Switch checked={draft.onlyPromo} onChange={(v) => set({ onlyPromo: v })} label="Em promoção" />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
