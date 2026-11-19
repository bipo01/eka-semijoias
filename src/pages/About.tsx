import { Gem, HeartHandshake, Sparkles, MapPin } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useBusiness } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { asset } from '../lib/assets';

/*
 * Starting text in the owner's first person. Replace with her own story
 * before go-live (docs/PERGUNTAS_ERIKA.md, question 14).
 */
const STORY = [
  'Eu sou a Érika. A ÉKA nasceu do meu jeito de enxergar as semijoias: não como um enfeite para dias especiais, mas como aquele detalhe que faz a gente se sentir bonita numa terça-feira qualquer.',
  'Comecei escolhendo peças para mim e para as amigas, sempre com o mesmo cuidado: olhar o acabamento de perto, conferir o fecho, imaginar a peça no dia a dia. Com o tempo, essas escolhas viraram uma curadoria, e a curadoria virou a ÉKA.',
  'Hoje cada peça que chega aqui passa pelas minhas mãos antes de ir para as suas. E eu continuo atendendo do mesmo jeito que comecei: de perto, pelo WhatsApp, ajudando você a escolher o que combina com o seu estilo.',
];

const VALUES = [
  { icon: Gem, title: 'Curadoria', text: 'Peças escolhidas uma a uma, pensando no uso real do dia a dia.' },
  { icon: Sparkles, title: 'Acabamento', text: 'Banho de qualidade, pedras bem cravadas e fechos que dão segurança.' },
  { icon: HeartHandshake, title: 'Atendimento próximo', text: 'Conversa de verdade, sem pressa, do primeiro olhar até depois da compra.' },
];

export function AboutPage() {
  useDocumentTitle('Sobre a ÉKA');
  const biz = useBusiness();
  return (
    <div className="pb-16">
      <PageHeader eyebrow="Sobre a ÉKA" title={<>Brilho com <em className="font-medium italic">história</em></>} />
      <div className="container-x grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
        <div className="max-w-2xl space-y-4 text-lg leading-relaxed">
          {STORY.map((p) => (
            <p key={p.slice(0, 20)}>{p}</p>
          ))}
          <p className="pt-2 font-display text-display-m text-copper italic" aria-label="Assinado, Érika">Érika</p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <img src={asset('brand/eka-emblem-rosegold-600.webp')} alt="Emblema da ÉKA Semijoias" width={300} height={300} loading="lazy" decoding="async" className="size-64 lg:size-80" />
        </div>
      </div>
      <section aria-labelledby="valores" className="container-x mt-14">
        <h2 id="valores" className="font-display text-display-m md:text-display-l">O que guia a ÉKA</h2>
        <ul className="mt-6 grid gap-3 md:grid-cols-3 lg:gap-5">
          {VALUES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-[12px] bg-champagne/70 p-6">
              <Icon size={26} strokeWidth={1.25} className="text-copper" aria-hidden="true" />
              <h3 className="mt-3 font-display text-title">{title}</h3>
              <p className="mt-1 text-ink-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>
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
