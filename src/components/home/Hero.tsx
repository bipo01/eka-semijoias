import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { asset } from '../../lib/assets';
import { ButtonLink } from '../ui/Button';

const stem = asset('images/lifestyle/l01-hero-pescoco');

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative md:grid md:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] md:items-center md:gap-8 lg:gap-12">
      <div className="relative md:order-2">
        <div className="relative aspect-[4/5] overflow-hidden bg-champagne md:aspect-auto md:h-[min(640px,calc(100dvh-140px))] md:min-h-[480px] md:w-full">
          <img
            src={`${stem}-720.webp`}
            srcSet={`${stem}-480.webp 480w, ${stem}-720.webp 720w, ${stem}-960.webp 960w`}
            sizes="(min-width: 768px) 55vw, 100vw"
            width={1024}
            height={1536}
            alt="Brinco Gota Cristal e Colar Ponto de Luz em ouro rosé, usados"
            fetchPriority="high"
            decoding="sync"
            className="absolute inset-0 h-full w-full object-cover object-[50%_62%] md:object-[50%_30%]"
          />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-ivory via-ivory/70 to-transparent md:hidden" />
        </div>
      </div>
      <div className="relative z-10 -mt-36 px-[var(--gutter)] pb-8 md:order-1 md:mt-0 md:py-12 md:pr-0 md:pl-[max(var(--gutter),calc((100vw-1200px)/2))] lg:py-16">
        <h1 id="hero-title" className="font-display text-display-xl text-ink">
          Brilho que <br className="hidden sm:block" />
          acompanha <em className="font-medium italic">você</em>
        </h1>
        <span aria-hidden="true" className="mt-4 block h-px w-16 bg-rose" />
        <p className="mt-4 max-w-sm text-lg leading-snug text-ink">Semijoias com banho de qualidade e acabamento impecável</p>
        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6 md:flex-col md:items-start md:gap-3 lg:flex-row lg:items-center lg:gap-6">
          <ButtonLink to="/catalogo" size="lg" className="w-full sm:w-auto">
            Ver catálogo <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </ButtonLink>
          <Link to="/revendedoras" className="link-underline inline-flex min-h-11 items-center self-center text-copper hover:text-copper-dark sm:self-auto">
            Seja revendedora
          </Link>
        </div>
      </div>
    </section>
  );
}
