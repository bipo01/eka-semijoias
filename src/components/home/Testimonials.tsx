import { useEffect, useRef, useState } from 'react';
import { Quote } from 'lucide-react';
import { testimonialSignature } from '../../data/content';
import { useSection } from '../../hooks/useSection';
import { SectionHeading } from '../ui/Misc';
import { cx } from '../ui/cx';

/**
 * Real, authorized testimonials the owner publishes (Painel → Site → Depoimentos).
 * All of them show, in her order; without any the whole section is gone.
 * No star rating: the store does not collect scores.
 */
export function Testimonials() {
  const { titles } = useSection('inicio');
  const items = useSection('depoimentos').items;
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
  // A lone testimonial is a centered quote, not the first card of a rail waiting for the next one.
  // Two on a wide screen sit centered at the size of a three-column card.
  const single = count === 1;
  const pair = count === 2;

  return (
    <section aria-labelledby="home-depoimentos" className="pt-12 lg:pt-20">
      <div className="container-x">
        {/* Centered cards get a centered title (from where they stop spanning the full width). */}
        <SectionHeading id="home-depoimentos" title={titles.testimonials} className={cx(single && 'sm:justify-center sm:text-center', pair && 'lg:justify-center lg:text-center')} />
      </div>
      <ul
        ref={rail}
        // Only a rail that scrolls sideways needs to take keyboard focus.
        tabIndex={single ? undefined : 0}
        aria-label="Depoimentos de clientes"
        className={cx(
          single
            ? 'container-x flex justify-center'
            : 'no-scrollbar flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] lg:container-x lg:gap-5',
          !single && (pair ? 'lg:justify-center' : cx('lg:grid', count >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')),
        )}
      >
        {items.map((t, i) => {
          const signature = testimonialSignature(t);
          return (
            <li
              key={t.id}
              className={single ? 'w-full max-w-[600px]' : cx('w-[86%] shrink-0 snap-start sm:w-[46%]', pair ? 'lg:w-[calc((100%-2.5rem)/3)]' : 'lg:w-auto')}
              aria-label={`Depoimento ${i + 1} de ${count}`}
            >
              <figure className={cx('flex h-full flex-col gap-3 rounded-[12px] bg-champagne/70 p-5', single && 'items-center text-center sm:px-8 sm:py-7')}>
                <Quote size={22} strokeWidth={1.5} className="fill-current text-rose" aria-hidden="true" />
                <blockquote className="font-display text-[1.1875rem] leading-snug whitespace-pre-line [overflow-wrap:anywhere] text-ink italic">{t.text}</blockquote>
                {signature && <figcaption className="mt-auto text-sm [overflow-wrap:anywhere] text-ink-muted">{signature}</figcaption>}
              </figure>
            </li>
          );
        })}
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
