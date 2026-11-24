import { Droplets, Package, Sparkles, SprayCan } from 'lucide-react';
import { useSection } from '../../hooks/useSection';
import { SectionHeading } from '../ui/Misc';
import { SeeAll } from './CategoryRail';

/** Icons by position; tips beyond them get the fallback. */
const ICONS = [SprayCan, Droplets, Package];

export function CareTeaser() {
  const { titles, careTips } = useSection('inicio');
  if (!careTips.length) return null;
  return (
    <section aria-labelledby="home-cuidados" className="container-x pt-12 lg:pt-20">
      <SectionHeading id="home-cuidados" title={titles.care} action={<SeeAll to="/como-cuidar" label="Ver todos os cuidados" />} />
      <ul className="grid gap-3 sm:grid-cols-3 lg:gap-5">
        {careTips.map((tip, i) => {
          const Icon = ICONS[i] ?? Sparkles;
          return (
            <li key={tip.id} className="flex gap-4 rounded-[12px] border border-line bg-white p-5 sm:flex-col">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-champagne text-copper" aria-hidden="true">
                <Icon size={22} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-title break-words">{tip.title}</h3>
                {tip.text && <p className="mt-1 text-sm whitespace-pre-line [overflow-wrap:anywhere] text-ink-muted">{tip.text}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
