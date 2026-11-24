import { ChevronRight } from 'lucide-react';
import { useSection } from '../../hooks/useSection';
import { siteImageSources } from '../../lib/assets';
import { ButtonLink } from '../ui/Button';

export function ResellerBand() {
  const { resellerBand: band } = useSection('inicio');
  if (!band.show) return null;
  const src = siteImageSources(band.image, 'banner');
  return (
    <section aria-labelledby="home-revenda" className="pt-12 lg:container-x lg:pt-20">
      <div className="grid overflow-hidden bg-champagne sm:grid-cols-2 lg:rounded-[12px]">
        <div className="flex flex-col justify-center gap-3 px-[var(--gutter)] py-8 sm:order-1 lg:px-14 lg:py-12">
          <h2 id="home-revenda" className="font-display text-display-m break-words lg:text-display-l">{band.title}</h2>
          {band.text && <p className="max-w-md whitespace-pre-line [overflow-wrap:anywhere] text-ink">{band.text}</p>}
          <ButtonLink to="/revendedoras" className="mt-2 w-fit">
            {band.cta} <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </ButtonLink>
        </div>
        <div className="aspect-[16/10] sm:order-2 sm:aspect-auto">
          <img src={src.src} srcSet={src.srcSet} sizes="(min-width: 640px) 50vw, 100vw" alt={band.image.alt} width={1536} height={1024} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
      </div>
    </section>
  );
}
