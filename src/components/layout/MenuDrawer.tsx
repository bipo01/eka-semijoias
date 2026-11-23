import { ChevronRight, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { sortedCategories } from '../../data/catalog';
import { useBusiness } from '../../hooks/useBusiness';
import { useMessages } from '../../hooks/useMessages';
import { whatsappUrl } from '../../lib/whatsapp';
import { useCatalog } from '../../store/catalog';
import { useUi } from '../../store/ui';
import { InstagramIcon, WhatsAppIcon } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';

const linkRow = 'flex min-h-12 items-center justify-between gap-3 border-b border-line py-2 text-ink hover:text-copper';

export function MenuDrawer() {
  const open = useUi((s) => s.panel === 'menu');
  const close = useUi((s) => s.closePanel);
  const data = useCatalog((s) => s.data);
  const biz = useBusiness();
  const contactMessage = useMessages()('contato');

  return (
    <Sheet open={open} onClose={close} title="Menu" side="left" hideTitle>
      <nav aria-label="Menu" className="flex flex-col gap-8 pb-6">
        <section aria-labelledby="menu-cat">
          <h3 id="menu-cat" className="eyebrow mb-1 text-ink-muted">Categorias</h3>
          <ul>
            <li>
              <Link to="/catalogo" onClick={close} className={linkRow}>
                <span className="font-display text-title">Todas as peças</span>
                <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
              </Link>
            </li>
            {sortedCategories(data).map((c) => (
              <li key={c.id}>
                <Link to={`/catalogo/${c.slug}`} onClick={close} className={linkRow}>
                  <span className="font-display text-title">{c.name}</span>
                  <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <Link to="/revendedoras" onClick={close} className="flex min-h-14 items-center justify-between rounded-[12px] bg-champagne px-4 text-ink">
          <span>
            <span className="block font-display text-title">Seja revendedora</span>
            <span className="text-sm text-ink-muted">Renda extra com as nossas peças</span>
          </span>
          <ChevronRight size={20} strokeWidth={1.5} className="text-copper" aria-hidden="true" />
        </Link>
        <ul>
          {[
            ['/favoritos', 'Favoritos'],
            ['/como-cuidar', 'Como cuidar'],
            ['/garantia', 'Garantia e trocas'],
            ['/sobre', 'Sobre a ÉKA'],
            ['/contato', 'Contato'],
          ].map(([to, label]) => (
            <li key={to}>
              <Link to={to!} onClick={close} className={linkRow}>
                <span className="flex items-center gap-2">
                  {to === '/favoritos' && <Heart size={18} strokeWidth={1.5} aria-hidden="true" />}
                  {label}
                </span>
                <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          <a href={whatsappUrl(biz.whatsapp, contactMessage)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm hover:border-copper">
            <WhatsAppIcon size={18} /> WhatsApp
          </a>
          {biz.instagramUrl && (
            <a href={biz.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm hover:border-copper">
              <InstagramIcon size={18} /> Instagram
            </a>
          )}
        </div>
      </nav>
    </Sheet>
  );
}
