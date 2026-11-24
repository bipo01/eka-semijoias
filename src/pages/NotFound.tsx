import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ProductGrid } from '../components/product/ProductCard';
import { ButtonLink } from '../components/ui/Button';
import { byOrder, isPurchasable } from '../data/catalog';
import type { Product } from '../data/schema';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSection } from '../hooks/useSection';
import { useCatalog } from '../store/catalog';

/** Which link failed: a piece, a category or any other page. Each has its own text and illustration. */
export type NotFoundKind = 'peca' | 'categoria' | 'pagina';

/**
 * A family of three brand illustrations made in ChatGPT (assets/illustrations/, mockups in docs/mockups/):
 * the open jewel box the drop earring escaped from (piece), a jewelry case with one empty
 * compartment (category) and a necklace whose chain draws a winding path (any other link).
 */
const ILLUSTRATION: Record<NotFoundKind, string> = {
  peca: '/images/illustrations/pagina-nao-encontrada',
  categoria: '/images/illustrations/categoria-nao-encontrada',
  pagina: '/images/illustrations/link-nao-encontrado',
};

const SUGGESTIONS = 4;

/** Search engines should not index a page that does not exist (the server answers every page route with the app). */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

/** Pieces to keep the visit going: the featured ones first, then the rest of the catalog order, only what can be bought. */
function useSuggestions(): Product[] {
  const products = useCatalog((s) => s.data.products);
  const stock = useCatalog((s) => s.data.stock);
  return useMemo(() => {
    const buyable = products.filter((p) => isPurchasable(p, stock)).sort(byOrder);
    return [...buyable.filter((p) => p.featured), ...buyable.filter((p) => !p.featured)].slice(0, SUGGESTIONS);
  }, [products, stock]);
}

/**
 * Shown when a link leads nowhere: a piece that left the catalog, an unknown category, or any other
 * address (and the router's 404). Title and text per case are editable in Painel → Site → Textos gerais.
 */
export function NotFoundPage({ kind = 'pagina' }: { kind?: NotFoundKind }) {
  const geral = useSection('geral');
  const copy = {
    peca: { title: geral.notFoundTitle, text: geral.notFoundText },
    categoria: { title: geral.categoryNotFoundTitle ?? geral.notFoundTitle, text: geral.categoryNotFoundText ?? geral.notFoundText },
    pagina: { title: geral.pageNotFoundTitle ?? geral.notFoundTitle, text: geral.pageNotFoundText ?? geral.notFoundText },
  }[kind];
  const suggestionsTitle = geral.notFoundSuggestions?.trim() ?? '';
  const suggestions = useSuggestions();
  useDocumentTitle(copy.title);
  useNoIndex();
  const src = ILLUSTRATION[kind];

  return (
    <div className="pb-12 lg:pb-20">
      <section className="container-x flex flex-col items-center pt-8 pb-4 text-center md:pt-14" aria-labelledby="nao-encontrada">
        <img
          src={`${src}-320.webp`}
          srcSet={`${src}-320.webp 320w, ${src}-640.webp 640w`}
          sizes="(min-width: 1024px) 300px, 260px"
          alt=""
          width={300}
          height={300}
          decoding="async"
          fetchPriority="high"
          className="size-[260px] lg:size-[300px]"
        />
        <p className="-mt-3 flex items-center gap-3 font-display text-[1.0625rem] italic text-copper" aria-hidden="true">
          <span className="h-px w-10 bg-rose/60" />
          404
          <span className="h-px w-10 bg-rose/60" />
        </p>
        <h1 id="nao-encontrada" className="mt-3 max-w-[18ch] font-display text-display-l text-balance break-words">
          {copy.title}
        </h1>
        {copy.text && <p className="mt-4 max-w-[36ch] whitespace-pre-line text-ink-muted [overflow-wrap:anywhere] text-pretty">{copy.text}</p>}
        <ButtonLink to="/catalogo" className="mt-8 w-full max-w-xs">
          Ver catálogo
        </ButtonLink>
        <Link to="/" className="mt-3 inline-flex min-h-11 items-center text-copper underline underline-offset-4">
          Ir para a página inicial
        </Link>
      </section>

      {suggestionsTitle && suggestions.length > 0 && (
        <section className="container-x mt-10 lg:mt-14" aria-labelledby="nao-encontrada-sugestoes">
          <div className="mb-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
            <h2 id="nao-encontrada-sugestoes" className="text-center font-display text-title">
              {suggestionsTitle}
            </h2>
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </div>
          <ProductGrid products={suggestions} dense />
        </section>
      )}
    </div>
  );
}
