import { ChevronRight } from 'lucide-react';
import { bannerSources } from '../../lib/assets';
import { ButtonLink } from '../ui/Button';

export function ResellerBand() {
  const src = bannerSources('images/lifestyle/l02-mostruario-revendedora');
  return (
    <section aria-labelledby="home-revenda" className="pt-12 lg:container-x lg:pt-20">
      <div className="grid overflow-hidden bg-champagne sm:grid-cols-2 lg:rounded-[12px]">
        <div className="flex flex-col justify-center gap-3 px-[var(--gutter)] py-8 sm:order-1 lg:px-14 lg:py-12">
          <h2 id="home-revenda" className="font-display text-display-m lg:text-display-l">Seja uma revendedora ÉKA</h2>
          <p className="max-w-md text-ink">Aumente sua renda com semijoias de alta qualidade, suporte de perto e condições especiais.</p>
          <ButtonLink to="/revendedoras" className="mt-2 w-fit">
            Quero revender <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </ButtonLink>
        </div>
        <div className="aspect-[16/10] sm:order-2 sm:aspect-auto">
          <img src={src.src} srcSet={src.srcSet} sizes="(min-width: 640px) 50vw, 100vw" alt="" width={1536} height={1024} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
      </div>
    </section>
  );
}
