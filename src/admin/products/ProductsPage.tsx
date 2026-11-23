import { useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Search } from 'lucide-react';
import { BareInput } from '../../components/ui/Field';
import { Chip } from '../../components/ui/Misc';
import { byOrder, sortedCategories } from '../../data/catalog';
import { matches } from '../../lib/search';
import { useCatalog } from '../../store/catalog';
import { save } from '../lib/persist';
import { reorderSubset } from '../lib/reorder';
import { ProductList } from './ProductList';

export function ProductsPage() {
  const data = useCatalog((s) => s.data);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const categories = sortedCategories(data);
  const categoryName = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);

  const visible = useMemo(
    () =>
      [...data.products]
        .sort(byOrder)
        .filter((p) => !categoryId || p.categoryId === categoryId)
        .filter((p) => matches(`${p.name} ${categoryName.get(p.categoryId) ?? ''} ${p.variants.map((v) => v.sku ?? '').join(' ')}`, query)),
    [data.products, categoryId, categoryName, query],
  );

  function reorder(idsInNewOrder: string[]) {
    void save((d) => {
      const orders = reorderSubset(d.products, idsInNewOrder);
      return { ...d, products: d.products.map((p) => ({ ...p, order: orders.get(p.id) ?? p.order })) };
    });
  }

  return (
    <>
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
          {categories.map((c) => (
            <Chip key={c.id} selected={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <p className="mt-4 mb-2 text-sm text-ink-muted" aria-live="polite">
        {visible.length === data.products.length
          ? `${data.products.length} ${data.products.length === 1 ? 'peça' : 'peças'}`
          : `${visible.length} de ${data.products.length} peças`}
      </p>

      {visible.length ? (
        <ProductList products={visible} categoryName={categoryName} onReorder={reorder} />
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-4 py-10 text-center text-ink-muted">
          {data.products.length ? 'Nenhuma peça encontrada com esses filtros.' : 'Nenhuma peça cadastrada ainda. Toque em “Nova peça” para começar.'}
        </p>
      )}

      <Outlet />
    </>
  );
}
