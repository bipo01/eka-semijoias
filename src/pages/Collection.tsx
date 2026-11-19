import { useParams } from 'react-router-dom';
import { ProductGrid } from '../components/product/ProductCard';
import { byOrder, isPurchasable } from '../data/catalog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { bannerSources } from '../lib/assets';
import { useCatalog } from '../store/catalog';
import { NotFoundPage } from './NotFound';

export function CollectionPage() {
  const { slug } = useParams();
  const data = useCatalog((s) => s.data);
  const collection = data.collections.find((c) => c.slug === slug);
  useDocumentTitle(collection?.name ?? 'Coleção');
  if (!collection) return <NotFoundPage />;
  const products = data.products
    .filter((p) => p.collectionIds.includes(collection.id))
    .sort((a, b) => Number(isPurchasable(b)) - Number(isPurchasable(a)) || byOrder(a, b));
  const hero = collection.heroImage ? bannerSources(collection.heroImage) : null;
  const words = collection.name.split(' ');
  return (
    <div className="pb-16">
      <header className="relative lg:container-x lg:pt-8">
        <div className="relative overflow-hidden bg-champagne lg:rounded-[12px]">
          {hero && (
            <div className="aspect-[4/3] sm:aspect-[16/7]">
              <img src={hero.src} srcSet={hero.srcSet} sizes="(min-width: 1264px) 1200px, 100vw" alt="" width={1536} height={1024} fetchPriority="high" className="h-full w-full object-cover object-[70%_50%]" />
            </div>
          )}
          <div className={hero ? 'absolute inset-0 bg-gradient-to-r from-ivory/90 via-ivory/50 to-transparent' : ''} aria-hidden="true" />
          <div className={hero ? 'absolute inset-y-0 left-0 flex w-2/3 flex-col justify-center gap-3 px-[var(--gutter)] lg:px-14' : 'px-[var(--gutter)] py-10'}>
            <p className="eyebrow text-ink-muted">Coleção</p>
            <h1 className="font-display text-display-l lg:text-display-xl">
              {words.length > 1 ? <>{words.slice(0, -1).join(' ')} <em className="font-medium italic">{words[words.length - 1]}</em></> : collection.name}
            </h1>
            {collection.description && <p className="hidden max-w-md text-ink sm:block">{collection.description}</p>}
          </div>
        </div>
      </header>
      <div className="container-x mt-6 lg:mt-10">
        {collection.description && <p className="mb-6 text-ink sm:hidden">{collection.description}</p>}
        <p className="mb-4 text-ink-muted">{products.length} {products.length === 1 ? 'peça' : 'peças'}</p>
        <ProductGrid products={products} />
      </div>
    </div>
  );
}
