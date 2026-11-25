import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useParams, useSearchParams } from 'react-router-dom';
import { useListPlace } from '../DetailPage';
import { Search } from 'lucide-react';
import { BareInput } from '../../components/ui/Field';
import { Chip } from '../../components/ui/Misc';
import { byOrder, sortedCategories } from '../../data/catalog';
import { matches } from '../../lib/search';
import { useCatalog } from '../../store/catalog';
import { save } from '../lib/persist';
import { standInProducts } from '../lib/setup';
import { AreaChecklist } from '../SetupProgress';
import { StandInBanner, StandInPhotosCard } from './StandInPhotos';
import { reorderSubset } from '../lib/reorder';
import { ProductList } from './ProductList';

export function ProductsPage() {
  const data = useCatalog((s) => s.data);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const categories = sortedCategories(data);
  const categoryName = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  // ?fotos=provisorias: only pieces still on a stand-in photo (the store meter links here).
  const [params, setParams] = useSearchParams();
  const standInList = useMemo(() => standInProducts(data.products), [data.products]);
  const standIn = useMemo(() => new Set(standInList.map((p) => p.id)), [standInList]);
  const onlyStandIn = params.get('fotos') === 'provisorias' && standIn.size > 0;
  const banner = useRef<HTMLElement>(null);
  /** Set when "Trocar as fotos" turns the filter on: the banner is brought into view and glows once. */
  const reveal = useRef(false);
  const setStandIn = (on: boolean) =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        if (on) out.set('fotos', 'provisorias');
        else out.delete('fotos');
        return out;
      },
      { replace: true },
    );
  const toggleStandIn = () => setStandIn(!onlyStandIn);
  function showStandIn() {
    // The other filters would hide pieces she has to fix.
    setCategoryId(null);
    setQuery('');
    reveal.current = true;
    setStandIn(true);
  }
  useEffect(() => {
    const el = banner.current;
    if (!onlyStandIn || !reveal.current || !el) return;
    reveal.current = false;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
    if (!reduce && typeof el.animate === 'function')
      el.animate(
        [
          { boxShadow: '0 0 0 0 rgb(138 90 69 / 0)' },
          { boxShadow: '0 0 0 6px rgb(138 90 69 / 0.25)', offset: 0.3 },
          { boxShadow: '0 0 0 0 rgb(138 90 69 / 0)' },
        ],
        { duration: 1600, easing: 'ease-out' },
      );
  }, [onlyStandIn]);

  const visible = useMemo(
    () =>
      [...data.products]
        .sort(byOrder)
        .filter((p) => !categoryId || p.categoryId === categoryId)
        .filter((p) => !onlyStandIn || standIn.has(p.id))
        .filter((p) => matches(`${p.name} ${categoryName.get(p.categoryId) ?? ''} ${p.variants.map((v) => v.sku ?? '').join(' ')}`, query)),
    [data.products, categoryId, categoryName, query, onlyStandIn, standIn],
  );

  // A piece open (/produtos/<id>): the list stays mounted, hidden, so filters and scroll come back.
  const detailOpen = !!useParams().productId;
  useListPlace(detailOpen);

  function reorder(idsInNewOrder: string[]) {
    void save((d) => {
      const orders = reorderSubset(d.products, idsInNewOrder);
      return { ...d, products: d.products.map((p) => ({ ...p, order: orders.get(p.id) ?? p.order })) };
    });
  }

  return (
    <>
      <div hidden={detailOpen}>
      {standInList.length > 0 ? (
        <div className="mb-4">
          <StandInPhotosCard standIn={standInList} total={data.products.length} active={onlyStandIn} onShow={showStandIn} />
        </div>
      ) : (
        <AreaChecklist area="produtos" place="área" hideWhenComplete className="mb-4" />
      )}
      <div className="flex flex-col gap-3">
        <BareInput
          type="search"
          aria-label="Buscar peça"
          placeholder="Buscar peça, categoria ou código"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          icon={<Search size={18} strokeWidth={1.5} />}
        />
        <div role="group" aria-label="Filtrar por categoria" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
          <Chip selected={categoryId === null} onClick={() => setCategoryId(null)}>
            Todas
          </Chip>
          {standIn.size > 0 && (
            <Chip selected={onlyStandIn} onClick={toggleStandIn}>
              Fotos provisórias ({standIn.size})
            </Chip>
          )}
          {categories.map((c) => (
            <Chip key={c.id} selected={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      {onlyStandIn && (
        <div className="mt-4">
          <StandInBanner ref={banner} count={standIn.size} onClear={() => setStandIn(false)} />
        </div>
      )}

      <p className="mt-4 mb-2 text-sm text-ink-muted" aria-live="polite">
        {visible.length === data.products.length
          ? `${data.products.length} ${data.products.length === 1 ? 'peça' : 'peças'}`
          : `${visible.length} de ${data.products.length} peças`}
      </p>

      {visible.length ? (
        <ProductList products={visible} categoryName={categoryName} onReorder={reorder} standIn={standIn} />
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-4 py-10 text-center text-ink-muted">
          {data.products.length ? 'Nenhuma peça encontrada com esses filtros.' : 'Nenhuma peça cadastrada ainda. Toque em “Nova peça” para começar.'}
        </p>
      )}
      </div>

      <Outlet />
    </>
  );
}
