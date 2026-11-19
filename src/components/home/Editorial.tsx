import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { bannerSources } from '../../lib/assets';
import { useCatalog } from '../../store/catalog';

/** Splits "Coleção Rosé" into a lead and an italic accent word. */
function titleParts(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return ['', name];
  return [words.slice(0, -1).join(' '), words[words.length - 1]!];
}

export function Editorial() {
  const collection = useCatalog((s) => s.data.collections.find((c) => c.featuredOnHome));
  if (!collection?.heroImage) return null;
  const src = bannerSources(collection.heroImage);
  const [lead, accent] = titleParts(collection.name);
  return (
    <section aria-labelledby="home-colecao" className="pt-12 lg:container-x lg:pt-20">
      <Link to={`/colecao/${collection.slug}`} className="group relative block overflow-hidden bg-champagne lg:rounded-[12px]">
        <div className="aspect-[4/3] sm:aspect-[16/9] lg:aspect-[12/5]">
          <img
            src={src.src}
            srcSet={src.srcSet}
            sizes="(min-width: 1264px) 1200px, 100vw"
            alt=""
            width={1536}
            height={1024}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-[70%_50%] transition-transform duration-[600ms] ease-[var(--ease)] motion-safe:group-hover:scale-[1.02]"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-ivory/85 via-ivory/40 to-transparent" aria-hidden="true" />
        <div className="absolute inset-y-0 left-0 flex w-3/5 flex-col justify-center gap-4 px-[var(--gutter)] lg:px-14">
          <p className="eyebrow text-ink-muted">Coleção</p>
          <h2 id="home-colecao" className="font-display text-display-l text-ink">
            {lead && <span className="block">{lead}</span>}
            <em className="font-medium italic">{accent}</em>
          </h2>
          {collection.description && <p className="hidden max-w-sm text-ink lg:block">{collection.description}</p>}
          <span className="inline-flex min-h-11 w-fit items-center gap-1 rounded-full border border-copper bg-ivory/60 px-4 text-sm text-copper transition-colors group-hover:bg-copper group-hover:text-white">
            Explorar coleção <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
        </div>
      </Link>
    </section>
  );
}
