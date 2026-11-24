import { useEffect, useRef, useState } from 'react';
import { Quote } from 'lucide-react';
import { useSection } from '../../hooks/useSection';
import { SectionHeading } from '../ui/Misc';
import { cx } from '../ui/cx';

/**
 * Real, authorized testimonials the owner publishes (Painel → Site → Depoimentos).
 * Only visible ones show, in her order; without any the whole section is gone.
 * No star rating: the store does not collect scores.
 */
export function Testimonials() {
  const { titles } = useSection('inicio');
  const items = useSection('depoimentos').items.filter((t) => t.visible);
  const rail = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const count = items.length;
  const ids = items.map((t) => t.id).join(' ');

  useEffect(() => {
    const el = rail.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const cards = Array.from(el.children) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(cards.indexOf(e.target as HTMLElement));
      },
      { root: el, threshold: 0.6 },
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [ids]);

  if (!count) return null;
  const current = Math.min(active, count - 1);

  return (
    <section aria-labelledby="home-depoimentos" className="pt-12 lg:pt-20">
      <div className="container-x">
        <SectionHeading id="home-depoimentos" title={titles.testimonials} />
      </div>
      <ul
        ref={rail}
        tabIndex={0}
        aria-label="Depoimentos de clientes"
        className={cx(
          'no-scrollbar flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] lg:container-x lg:grid lg:gap-5',
          count >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        )}
      >
        {items.map((t, i) => (
          <li key={t.id} className="w-[86%] shrink-0 snap-start sm:w-[46%] lg:w-auto" aria-label={`Depoimento ${i + 1} de ${count}`}>
            <figure className="flex h-full flex-col gap-3 rounded-[12px] bg-champagne/70 p-5">
              <Quote size={22} strokeWidth={1.5} className="fill-current text-rose" aria-hidden="true" />
              <blockquote className="font-display text-[1.1875rem] leading-snug whitespace-pre-line [overflow-wrap:anywhere] text-ink italic">{t.text}</blockquote>
              <figcaption className="mt-auto text-sm [overflow-wrap:anywhere] text-ink-muted">
                {t.name}
                {t.city && ` · ${t.city}`}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {count > 1 && (
        <div className="mt-4 flex justify-center gap-2 lg:hidden" aria-hidden="true">
          {items.map((t, i) => (
            <span key={t.id} className={cx('h-1.5 rounded-full transition-all duration-[240ms]', i === current ? 'w-5 bg-copper' : 'w-1.5 bg-line')} />
          ))}
        </div>
      )}
    </section>
  );
}
