import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { categoryFromPrice, categoryImage, sortedCategories } from '../../data/catalog';
import { productImageSources } from '../../lib/assets';
import { formatBRL } from '../../lib/format';
import { useCatalog } from '../../store/catalog';
import { Img } from '../ui/Img';
import { SectionHeading } from '../ui/Misc';

export function SeeAll({ to, label = 'Ver todas' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[0.9375rem] text-copper hover:text-copper-dark">
      <span className="link-underline">{label}</span>
      <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
    </Link>
  );
}

export function CategoryRail() {
  const data = useCatalog((s) => s.data);
  const tiles = sortedCategories(data)
    .map((c) => ({ category: c, image: categoryImage(data, c), from: categoryFromPrice(data, c.id) }))
    .filter((t) => t.image && t.from != null);
  if (!tiles.length) return null;
  return (
    <section aria-labelledby="home-categorias" className="pt-10 lg:pt-16">
      <div className="container-x">
        <SectionHeading id="home-categorias" title="Categorias" action={<SeeAll to="/catalogo" />} />
      </div>
      <ul className="no-scrollbar flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] lg:container-x lg:grid lg:snap-none lg:gap-5 lg:overflow-visible" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
        {tiles.map(({ category, image, from }) => {
          const src = productImageSources(image!, true);
          return (
            <li key={category.id} className="w-[38%] shrink-0 snap-start sm:w-[28%] lg:w-auto">
              <Link to={`/catalogo/${category.slug}`} className="group block rounded-[12px]">
                <Img src={src.src} srcSet={src.srcSet} sizes="(min-width: 1024px) 230px, 38vw" alt="" frameClassName="rounded-[12px]" className="transition-transform duration-[240ms] motion-safe:group-hover:scale-[1.03]" />
                <span className="mt-2 block text-center font-display text-title leading-tight text-ink group-hover:text-copper">{category.name}</span>
                <span className="block text-center text-micro text-ink-muted">a partir de {formatBRL(from!)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
