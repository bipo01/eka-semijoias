import { Link } from 'react-router-dom';
import { useBusiness } from '../../hooks/useBusiness';
import { asset } from '../../lib/assets';
import { generalMessage, whatsappUrl } from '../../lib/whatsapp';
import { InstagramIcon, WhatsAppIcon } from '../ui/Icons';

const COLUMNS = [
  {
    title: 'Loja',
    links: [
      ['/catalogo', 'Catálogo'],
      ['/favoritos', 'Favoritos'],
      ['/revendedoras', 'Seja revendedora'],
    ],
  },
  {
    title: 'Ajuda',
    links: [
      ['/como-cuidar', 'Como cuidar'],
      ['/garantia', 'Garantia e trocas'],
      ['/contato', 'Contato'],
      ['/sobre', 'Sobre a ÉKA'],
    ],
  },
] as const;

export function Footer() {
  const biz = useBusiness();
  return (
    <footer className="on-dark bg-ink pb-[calc(88px+var(--safe-bottom))] text-on-dark lg:pb-12">
      <div className="container-x grid gap-10 pt-12 md:grid-cols-[1.2fr_1fr_1fr_1fr] md:gap-8 lg:pt-16">
        <div className="flex flex-col items-start gap-4">
          <img src={asset('brand/eka-emblem-rosegold-240.webp')} alt="ÉKA Semijoias" width={112} height={112} loading="lazy" decoding="async" className="size-28" />
          <p className="max-w-xs font-display text-title text-on-dark">Peças que acompanham você todos os dias, com brilho que dura.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="eyebrow mb-3 font-sans text-rose-light">{col.title}</h2>
            <ul className="flex flex-col">
              {col.links.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="inline-flex min-h-11 items-center text-on-dark/90 hover:text-rose-light">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div>
          <h2 className="eyebrow mb-3 font-sans text-rose-light">Fale com a gente</h2>
          <ul className="flex flex-col">
            <li>
              <a href={whatsappUrl(biz.whatsapp, generalMessage)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2.5 hover:text-rose-light">
                <WhatsAppIcon size={20} /> WhatsApp
              </a>
            </li>
            {biz.instagramUrl && (
              <li>
                <a href={biz.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2.5 hover:text-rose-light">
                  <InstagramIcon size={20} /> @{biz.instagram}
                </a>
              </li>
            )}
            {biz.city && <li className="py-2.5 text-on-dark/80">{biz.city}</li>}
          </ul>
        </div>
      </div>
      <div className="container-x mt-10 border-t border-white/10 pt-6 text-sm text-on-dark/70">
        <p>© {new Date().getFullYear()} ÉKA Semijoias</p>
      </div>
    </footer>
  );
}
