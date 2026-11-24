import { ChevronRight } from 'lucide-react';
import { useBusiness } from '../../hooks/useBusiness';
import { useSection } from '../../hooks/useSection';
import { siteImageSources } from '../../lib/assets';
import { InstagramIcon } from '../ui/Icons';

export function InstagramStrip() {
  const biz = useBusiness();
  const { instagram: shots } = useSection('inicio');
  if (!biz.instagramUrl || !shots.length) return null;
  return (
    <section aria-labelledby="home-instagram" className="container-x pt-12 lg:pt-20">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id="home-instagram" className="flex items-center gap-2 font-display text-display-m">
          <InstagramIcon size={26} className="text-copper" />@{biz.instagram}
        </h2>
        <a href={biz.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[0.9375rem] text-copper hover:text-copper-dark">
          <span className="link-underline">Ver no Instagram</span>
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </a>
      </div>
      <ul className="grid grid-cols-3 gap-2 lg:grid-cols-6 lg:gap-4">
        {shots.map((shot) => {
          const src = siteImageSources(shot, 'tile');
          return (
            <li key={shot.id}>
              <a href={biz.instagramUrl!} target="_blank" rel="noopener noreferrer" aria-label={`Abrir @${biz.instagram} no Instagram`} className="group block overflow-hidden rounded-[10px] bg-champagne">
                <img src={src.src} srcSet={src.srcSet} sizes="(min-width: 1024px) 190px, 31vw" alt={shot.alt} width={480} height={480} loading="lazy" decoding="async" className="aspect-square h-auto w-full object-cover transition-transform duration-[240ms] motion-safe:group-hover:scale-[1.04]" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
