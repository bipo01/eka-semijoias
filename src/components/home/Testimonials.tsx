import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { testimonials } from '../../content/home';
import { SectionHeading } from '../ui/Misc';
import { cx } from '../ui/cx';

export function Testimonials() {
  const rail = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(items.indexOf(e.target as HTMLElement));
      },
      { root: el, threshold: 0.6 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <section aria-labelledby="home-depoimentos" className="pt-12 lg:pt-20">
      <div className="container-x">
        <SectionHeading id="home-depoimentos" title="Quem usa, recomenda" />
      </div>
      <ul ref={rail} className="no-scrollbar flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] lg:container-x lg:grid lg:grid-cols-4 lg:gap-5">
        {testimonials.map((t, i) => (
          <li key={t.name} className="w-[86%] shrink-0 snap-start sm:w-[46%] lg:w-auto" aria-label={`Depoimento ${i + 1} de ${testimonials.length}`}>
            <figure className="flex h-full flex-col gap-3 rounded-[12px] bg-champagne/70 p-5">
              <div className="flex gap-0.5 text-rose" role="img" aria-label="5 de 5 estrelas">
                {Array.from({ length: 5 }, (_, s) => (
                  <Star key={s} size={16} strokeWidth={1.5} className="fill-current" aria-hidden="true" />
                ))}
              </div>
              <blockquote className="font-display text-[1.1875rem] leading-snug text-ink italic">“{t.quote}”</blockquote>
              <figcaption className="mt-auto text-sm text-ink-muted">
                {t.name} · {t.city}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-center gap-2 lg:hidden" aria-hidden="true">
        {testimonials.map((t, i) => (
          <span key={t.name} className={cx('h-1.5 rounded-full transition-all duration-[240ms]', i === active ? 'w-5 bg-copper' : 'w-1.5 bg-line')} />
        ))}
      </div>
    </section>
  );
}
