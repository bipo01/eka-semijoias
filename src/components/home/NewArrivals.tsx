import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isPurchasable } from '../../data/catalog';
import { useCatalog } from '../../store/catalog';
import { ProductCard } from '../product/ProductCard';
import { IconButton } from '../ui/Button';
import { SectionHeading } from '../ui/Misc';

export function NewArrivals() {
  const products = useCatalog((s) => s.data.products);
  const stock = useCatalog((s) => s.data.stock);
  const newest = products
    .filter((p) => isPurchasable(p, stock))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);
  const rail = useRef<HTMLUListElement>(null);
  if (!newest.length) return null;
  const scroll = (dir: 1 | -1) => rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section aria-labelledby="home-novidades" className="pt-12 lg:pt-20">
      <div className="container-x">
        <SectionHeading
          id="home-novidades"
          title="Novidades"
          action={
            <div className="hidden gap-1 lg:flex">
              <IconButton label="Ver anteriores" onClick={() => scroll(-1)} className="border border-line">
                <ChevronLeft size={20} strokeWidth={1.5} />
              </IconButton>
              <IconButton label="Ver próximas" onClick={() => scroll(1)} className="border border-line">
                <ChevronRight size={20} strokeWidth={1.5} />
              </IconButton>
            </div>
          }
        />
      </div>
      <ul ref={rail} className="no-scrollbar flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] lg:container-x lg:gap-5">
        {newest.map((p) => (
          <li key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[30%] lg:w-[calc((100%-60px)/4)]">
            <ProductCard product={p} sizes="(min-width: 1024px) 280px, 44vw" />
          </li>
        ))}
      </ul>
    </section>
  );
}
