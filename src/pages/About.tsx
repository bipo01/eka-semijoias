import { Gem, HeartHandshake, MapPin, Sparkles, Star } from 'lucide-react';
import { ContentPageHeader } from '../components/layout/PageHeader';
import { useBusiness } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSection } from '../hooks/useSection';
import { paragraphs } from '../data/content';
import { asset, siteImageSources } from '../lib/assets';

/** Icons of the values by position; values beyond them get the fallback. */
const VALUE_ICONS = [Gem, Sparkles, HeartHandshake];

export function AboutPage() {
  useDocumentTitle('Sobre a ÉKA');
  const biz = useBusiness();
  const about = useSection('sobre');
  const photo = about.image ? siteImageSources(about.image, 'banner') : null;
  return (
    <div className="pb-16">
      <ContentPageHeader header={about.header} />
      <div className="container-x grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
        <div className="max-w-2xl min-w-0 space-y-4 text-lg leading-relaxed">
          {paragraphs(about.story).map((p, i) => (
            <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">{p}</p>
          ))}
          {about.signature && (
            <p className="pt-2 font-display text-display-m [overflow-wrap:anywhere] text-copper italic" aria-label={`Assinado, ${about.signature}`}>
              {about.signature}
            </p>
          )}
        </div>
        <div className="flex justify-center lg:justify-end">
          {about.image && photo ? (
            <img src={photo.src} srcSet={photo.srcSet} sizes="(min-width: 1024px) 360px, 100vw" alt={about.image.alt} loading="lazy" decoding="async" className="aspect-[4/5] w-full max-w-sm rounded-[12px] bg-champagne object-cover lg:max-w-none" />
          ) : (
            <img src={asset('brand/eka-emblem-rosegold-600.webp')} alt="Emblema da ÉKA Semijoias" width={300} height={300} loading="lazy" decoding="async" className="size-64 lg:size-80" />
          )}
        </div>
      </div>
      {about.values.length > 0 && (
        <section aria-labelledby="valores" className="container-x mt-14">
          <h2 id="valores" className="font-display text-display-m break-words md:text-display-l">{about.valuesTitle}</h2>
          <ul className="mt-6 grid gap-3 md:grid-cols-3 lg:gap-5">
            {about.values.map((value, i) => {
              const Icon = VALUE_ICONS[i] ?? Star;
              return (
                <li key={value.id} className="min-w-0 rounded-[12px] bg-champagne/70 p-6">
                  <Icon size={26} strokeWidth={1.25} className="text-copper" aria-hidden="true" />
                  <h3 className="mt-3 font-display text-title break-words">{value.title}</h3>
                  {value.text && <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere] text-ink-muted">{value.text}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {biz.showroom && (
        <section aria-labelledby="showroom" className="container-x mt-14">
          <div className="rounded-[12px] border border-line bg-white p-6 lg:p-8">
            <h2 id="showroom" className="font-display text-display-m">Showroom</h2>
            <p className="mt-3 flex gap-2"><MapPin size={20} strokeWidth={1.5} className="mt-1 shrink-0 text-copper" aria-hidden="true" />{biz.showroom}</p>
            {biz.openingHours && <p className="mt-2 text-ink-muted">{biz.openingHours}</p>}
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.showroom)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center text-copper underline underline-offset-4">Ver no mapa</a>
          </div>
        </section>
      )}
    </div>
  );
}
