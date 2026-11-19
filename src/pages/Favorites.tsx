import { Heart } from 'lucide-react';
import { ProductGrid } from '../components/product/ProductCard';
import { ButtonLink } from '../components/ui/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useCatalog } from '../store/catalog';
import { useFavorites } from '../store/favorites';

export function FavoritesPage() {
  useDocumentTitle('Favoritos');
  const ids = useFavorites((s) => s.ids);
  const products = useCatalog((s) => s.data.products);
  const list = ids.map((id) => products.find((p) => p.id === id)).filter((p) => p != null);
  return (
    <div className="container-x pt-8 pb-16 lg:pt-12">
      <h1 className="font-display text-display-l">Favoritos</h1>
      {list.length ? (
        <>
          <p className="mt-1 text-ink-muted">{list.length} {list.length === 1 ? 'peça salva' : 'peças salvas'}</p>
          <ProductGrid products={list} className="mt-6" />
        </>
      ) : (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-14 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-champagne text-copper">
            <Heart size={28} strokeWidth={1.5} />
          </span>
          <p className="font-display text-title">Nenhuma peça salva ainda</p>
          <p className="text-ink-muted">Toque no coração das peças que você amou para encontrar todas aqui depois.</p>
          <ButtonLink to="/catalogo">Ver catálogo</ButtonLink>
        </div>
      )}
    </div>
  );
}
