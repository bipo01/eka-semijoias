import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useSection } from '../../hooks/useSection';
import { siteImageSources } from '../../lib/assets';
import { ButtonLink } from '../ui/Button';

/**
 * A short headline breaks before its last word from 640 px up ("Brilho que / acompanha você"),
 * as the original design did; a long one wraps naturally.
 */
function HeroTitle({ title, highlight }: { title: string; highlight: string }) {
  const words = title.split(/\s+/);
  const short = words.length >= 3 && `${title} ${highlight}`.trim().length <= 32;
  const italic = highlight && (
    <>
      {' '}
      <em className="font-medium italic">{highlight}</em>
    </>
  );
  if (!short) return <>{title}{italic}</>;
  return (
    <>
      {words.slice(0, -1).join(' ')} <br className="hidden sm:block" />
      {words.at(-1)}
      {italic}
    </>
  );
}

export function Hero() {
  const { hero } = useSection('inicio');
  const img = siteImageSources(hero.image, 'hero');
  return (
    <section aria-labelledby="hero-title" className="relative md:grid md:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] md:items-center md:gap-8 lg:gap-12">
      <div className="relative md:order-2">
        <div className="relative aspect-[4/5] overflow-hidden bg-champagne md:aspect-auto md:h-[min(640px,calc(100dvh-140px))] md:min-h-[480px] md:w-full">
          <img
            src={img.src}
            srcSet={img.srcSet}
            sizes="(min-width: 768px) 55vw, 100vw"
            width={1024}
            height={1536}
            alt={hero.image.alt}
            fetchPriority="high"
            decoding="sync"
            className="absolute inset-0 h-full w-full object-cover object-[50%_62%] md:object-[50%_30%]"
          />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-ivory via-ivory/70 to-transparent md:hidden" />
        </div>
      </div>
      <div className="relative z-10 -mt-36 px-[var(--gutter)] pb-8 md:order-1 md:mt-0 md:py-12 md:pr-0 md:pl-[max(var(--gutter),calc((100vw-1200px)/2))] lg:py-16">
        <h1 id="hero-title" className="font-display text-display-xl break-words text-ink">
          <HeroTitle title={hero.title} highlight={hero.highlight} />
        </h1>
        <span aria-hidden="true" className="mt-4 block h-px w-16 bg-rose" />
        {hero.subtitle && <p className="mt-4 max-w-sm text-lg leading-snug [overflow-wrap:anywhere] text-ink">{hero.subtitle}</p>}
        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6 md:flex-col md:items-start md:gap-3 lg:flex-row lg:items-center lg:gap-6">
          <ButtonLink to="/catalogo" size="lg" className="w-full sm:w-auto">
            {hero.primaryCta} <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </ButtonLink>
          {hero.secondaryCta && (
            <Link to="/revendedoras" className="link-underline inline-flex min-h-11 items-center self-center text-copper hover:text-copper-dark sm:self-auto">
              {hero.secondaryCta}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
