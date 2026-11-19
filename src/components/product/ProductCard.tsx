import { ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BADGE_LABEL, defaultVariant, isPurchasable, productBadge } from '../../data/catalog';
import { FINISH_LABEL, type Product } from '../../data/schema';
import { productImageSources } from '../../lib/assets';
import { Img } from '../ui/Img';
import { Price, SwatchDot } from '../ui/Misc';
import { cx } from '../ui/cx';
import { FavoriteButton } from './FavoriteButton';
import { useAddToBag } from './useAddToBag';

export const CARD_SIZES = '(min-width: 1024px) 280px, (min-width: 768px) 30vw, 46vw';

export function ProductCard({ product, priority, sizes = CARD_SIZES, compact }: { product: Product; priority?: boolean; sizes?: string; compact?: boolean }) {
  const addToBag = useAddToBag();
  const badge = productBadge(product);
  const purchasable = isPurchasable(product);
  const [first, second] = product.images;
  const firstSrc = first ? productImageSources(first, true) : null;
  const secondSrc = second ? productImageSources(second, true) : null;
  const finishes = [...new Set(product.variants.map((v) => v.finish))];
  const variant = defaultVariant(product);
  const needsChoice = Boolean(variant.sizes?.length);

  return (
    <article className="group relative flex flex-col">
      <div className="relative">
        <div className="relative rounded-[12px]">
          {firstSrc ? (
            <Img
              src={firstSrc.src}
              srcSet={firstSrc.srcSet}
              sizes={sizes}
              alt=""
              priority={priority}
              frameClassName="rounded-[12px]"
              className="transition-transform duration-[240ms] ease-[var(--ease)] motion-safe:lg:group-hover:scale-[1.02]"
            />
          ) : (
            <Img src="" alt="" frameClassName="rounded-[12px]" />
          )}
          {secondSrc && (
            <img
              src={secondSrc.src}
              srcSet={secondSrc.srcSet}
              sizes={sizes}
              alt=""
              loading="lazy"
              decoding="async"
              width={480}
              height={600}
              className="pointer-events-none absolute inset-0 hidden h-full w-full rounded-[12px] object-cover opacity-0 transition-opacity duration-[240ms] [@media(hover:hover)_and_(pointer:fine)]:block lg:group-hover:opacity-100"
            />
          )}
        </div>
        {badge && (
          <span className={cx('eyebrow absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 normal-case tracking-[0.02em]', badge === 'esgotado' ? 'bg-white/90 text-ink' : 'bg-copper text-white')}>
            {BADGE_LABEL[badge]}
          </span>
        )}
        <FavoriteButton productId={product.id} name={product.name} className="absolute top-0.5 right-0.5 z-10" />
        {purchasable && (
          needsChoice ? (
            <Link
              to={`/produto/${product.slug}`}
              aria-label={`Escolher tamanho de ${product.name}`}
              className="absolute right-1.5 bottom-1.5 z-10 inline-flex size-11 items-center justify-center"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-white/90 text-copper shadow-sm hover:bg-copper hover:text-white">
                <ShoppingBag size={17} strokeWidth={1.5} />
              </span>
            </Link>
          ) : (
            <button
              type="button"
              aria-label={`Adicionar ${product.name} à sacola`}
              onClick={() => addToBag(product, variant)}
              className="absolute right-1.5 bottom-1.5 z-10 inline-flex size-11 items-center justify-center"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-white/90 text-copper shadow-sm transition-colors hover:bg-copper hover:text-white">
                <ShoppingBag size={17} strokeWidth={1.5} />
              </span>
            </button>
          )
        )}
      </div>
      <div className={cx('flex flex-col gap-1.5', compact ? 'pt-2' : 'pt-3')}>
        <h3 className="font-sans text-[0.9375rem] leading-snug text-ink">
          <Link to={`/produto/${product.slug}`} className="line-clamp-2 after:absolute after:inset-0 after:content-[''] hover:text-copper focus-visible:outline-none [&:focus-visible]:after:rounded-[12px] [&:focus-visible]:after:outline-2 [&:focus-visible]:after:outline-copper">
            {product.name}
          </Link>
        </h3>
        {finishes.length > 0 && (
          <p className="flex items-center gap-1.5">
            <span className="sr-only">Acabamentos: {finishes.map((f) => FINISH_LABEL[f]).join(', ')}</span>
            {finishes.map((f) => (
              <SwatchDot key={f} finish={f} />
            ))}
          </p>
        )}
        <Price price={product.price} promoPrice={product.promoPrice} size="sm" />
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0, className }: { products: Product[]; priorityCount?: number; className?: string }) {
  return (
    <ul className={cx('grid grid-cols-2 gap-x-3 gap-y-7 md:grid-cols-3 md:gap-x-5 lg:grid-cols-4 lg:gap-y-10', className)}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
