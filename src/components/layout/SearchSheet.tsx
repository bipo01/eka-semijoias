import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { byOrder, effectivePrice } from '../../data/catalog';
import { productImageSources } from '../../lib/assets';
import { formatBRL } from '../../lib/format';
import { matches } from '../../lib/search';
import { useCatalog } from '../../store/catalog';
import { useUi } from '../../store/ui';
import { BareInput } from '../ui/Field';
import { Img } from '../ui/Img';
import { Sheet } from '../ui/Sheet';

export function SearchSheet() {
  const open = useUi((s) => s.panel === 'search');
  const close = useUi((s) => s.closePanel);
  const data = useCatalog((s) => s.data);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!deferred.trim()) return [];
    const catName = new Map(data.categories.map((c) => [c.id, c.name]));
    return data.products
      .filter((p) => matches(`${p.name} ${catName.get(p.categoryId) ?? ''}`, deferred))
      .sort(byOrder)
      .slice(0, 6);
  }, [deferred, data]);

  const submit = () => {
    close();
    navigate(query.trim() ? `/catalogo?q=${encodeURIComponent(query.trim())}` : '/catalogo');
  };

  return (
    <Sheet open={open} onClose={close} title="Buscar peças" side="bottom" className="md-center" initialFocus={inputRef}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="global-search" className="sr-only">O que você procura?</label>
        <BareInput
          ref={inputRef}
          id="global-search"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Brinco, colar, anel…"
          icon={<Search size={20} strokeWidth={1.5} />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      {deferred.trim() && (
        <div className="mt-4" aria-live="polite">
          {results.length ? (
            <ul className="divide-y divide-line">
              {results.map((p) => {
                const img = p.images[0];
                const src = img ? productImageSources(img, true) : null;
                return (
                  <li key={p.id}>
                    <Link to={`/produto/${p.slug}`} onClick={close} className="flex items-center gap-3 py-2.5 hover:text-copper">
                      <span className="w-14 shrink-0">
                        <Img src={src?.src ?? ''} srcSet={src?.srcSet} sizes="56px" alt="" frameClassName="rounded-[8px]" />
                      </span>
                      <span className="flex-1">{p.name}</span>
                      <span className="price text-sm">{formatBRL(effectivePrice(p))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-4 text-ink-muted">Nenhuma peça encontrada para “{deferred.trim()}”.</p>
          )}
          <button type="button" onClick={submit} className="mt-2 inline-flex min-h-11 items-center gap-2 font-medium text-copper">
            Ver todos os resultados <ArrowRight size={18} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </Sheet>
  );
}
