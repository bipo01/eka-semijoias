import { Droplets, Package, SprayCan } from 'lucide-react';
import { careTips } from '../../content/home';
import { SectionHeading } from '../ui/Misc';
import { SeeAll } from './CategoryRail';

const ICONS = [SprayCan, Droplets, Package];

export function CareTeaser() {
  return (
    <section aria-labelledby="home-cuidados" className="container-x pt-12 lg:pt-20">
      <SectionHeading id="home-cuidados" title="Como cuidar" action={<SeeAll to="/como-cuidar" label="Ver todos os cuidados" />} />
      <ul className="grid gap-3 sm:grid-cols-3 lg:gap-5">
        {careTips.map((tip, i) => {
          const Icon = ICONS[i] ?? Package;
          return (
            <li key={tip.title} className="flex gap-4 rounded-[12px] border border-line bg-white p-5 sm:flex-col">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-champagne text-copper" aria-hidden="true">
                <Icon size={22} strokeWidth={1.5} />
              </span>
              <div>
                <h3 className="font-display text-title">{tip.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{tip.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
