import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Lockup } from '../components/layout/Logo';
import { ButtonAnchor } from '../components/ui/Button';
import { WhatsAppIcon } from '../components/ui/Icons';
import { Img } from '../components/ui/Img';
import { sizeLabel } from '../data/catalog';
import { FINISH_LABEL, type Finish, type ProductImage } from '../data/schema';
import { useBusiness } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useMessages } from '../hooks/useMessages';
import { api, ApiError, errorMessage } from '../lib/api';
import { productImageSources } from '../lib/assets';
import { formatBRL } from '../lib/format';
import { isOwnShowcase } from '../lib/panelShowcase';
import { whatsappUrl } from '../lib/whatsapp';

/*
 * /r/:slug — a reseller's digital showcase (docs/revenda/PLAN.md §5): the
 * pieces available in her kit and a button to order through her WhatsApp.
 * Standalone (no store navigation): it is her page.
 */

interface ShowcaseItem {
  productId: string;
  variantId: string;
  size: string;
  slug: string;
  name: string;
  finish: Finish;
  unitCents: number;
  available: number;
  image?: ProductImage;
}
interface ShowcaseView {
  firstName: string;
  whatsapp: string | null;
  active: boolean;
  items: ShowcaseItem[];
}

type Load = { status: 'loading' } | { status: 'ready'; view: ShowcaseView } | { status: 'error'; message: string; notFound: boolean };

export function ShowcasePage() {
  const { slug = '' } = useParams();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const biz = useBusiness();
  const compose = useMessages();
  const navigate = useNavigate();
  const location = useLocation();
  // Only on the reseller's own device (her panel remembers its showcase): customers never see it.
  const own = isOwnShowcase(slug);
  const backToPanel = () => {
    // Opened from the panel in this tab: going back keeps the panel's place; otherwise open it.
    if ((location.state as { fromPanel?: boolean } | null)?.fromPanel) navigate(-1);
    else navigate('/revenda');
  };
  const view = load.status === 'ready' ? load.view : null;
  useDocumentTitle(view ? `Mostruário de ${view.firstName}` : 'Mostruário');

  useEffect(() => {
    let alive = true;
    api<ShowcaseView>(`/api/r/${encodeURIComponent(slug)}`, { retries: 2 }).then(
      (v) => alive && setLoad({ status: 'ready', view: v }),
      (e: unknown) => alive && setLoad({ status: 'error', message: errorMessage(e), notFound: e instanceof ApiError && e.status === 404 }),
    );
    return () => {
      alive = false;
    };
  }, [slug]);

  const contact = view?.whatsapp ? `55${view.whatsapp}` : biz.whatsapp;
  const ask = (item?: ShowcaseItem) =>
    whatsappUrl(
      contact,
      item
        ? compose('mostruario', {
            revendedora: view?.whatsapp ? view.firstName : '',
            peca: `${item.name} (${FINISH_LABEL[item.finish]}${item.size ? `, ${sizeLabel(item.size)}` : ''})`,
            link_peca: `${window.location.origin}/produto/${item.slug}`,
          })
        : // No piece chosen: the site's general contact message.
          compose('contato', {}),
    );

  return (
    <div className="min-h-dvh bg-ivory">
      {own && (
        <div className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2">
            <button type="button" onClick={backToPanel} className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-medium text-copper hover:text-copper-dark">
              <ArrowLeft size={17} strokeWidth={1.75} aria-hidden="true" /> Voltar ao meu painel
            </button>
            <p className="text-sm text-ink-muted">É assim que suas clientes veem o seu mostruário.</p>
          </div>
        </div>
      )}
      <header className="mx-auto flex max-w-[960px] items-center gap-4 px-5 pt-7 pb-2">
        <span aria-hidden="true" className="h-px flex-1 bg-rose/60" />
        <Link to="/" aria-label="ÉKA Semijoias: ir para a loja">
          <Lockup />
        </Link>
        <span aria-hidden="true" className="h-px flex-1 bg-rose/60" />
      </header>
      <main className="mx-auto flex max-w-[960px] flex-col gap-8 px-5 pt-2 pb-[calc(40px+var(--safe-bottom))]">
        {load.status === 'loading' && <div aria-busy="true" className="mx-auto mt-6 h-40 w-full max-w-md animate-pulse rounded-[14px] bg-champagne/60" />}
        {load.status === 'error' && (
          <section className="flex flex-col items-center gap-3 pt-8 text-center">
            <h1 className="font-display text-display-m">{load.notFound ? 'Mostruário não encontrado' : 'Não conseguimos abrir o mostruário'}</h1>
            <p className="max-w-sm text-ink-muted">{load.notFound ? 'Este mostruário não está mais no ar, mas as peças continuam na loja.' : load.message}</p>
            <ButtonAnchor href="/catalogo" variant="secondary">
              Ver as peças da loja
            </ButtonAnchor>
          </section>
        )}
        {view && (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="eyebrow text-ink-muted">Revendedora ÉKA</p>
              <h1 className="font-display text-display-l leading-tight">Mostruário de {view.firstName}</h1>
              <span aria-hidden="true" className="mt-1 h-px w-24 bg-rose/60" />
            </div>
            {view.items.length ? (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
                {view.items.map((item) => (
                  <li key={`${item.productId}|${item.variantId}|${item.size}`} className="flex flex-col gap-2">
                    {item.image ? (
                      <Img {...productImageSources(item.image, true)} alt={item.image.alt} ratio="4 / 5" frameClassName="rounded-[12px]" />
                    ) : (
                      <div className="aspect-[4/5] rounded-[12px] bg-champagne" />
                    )}
                    <div>
                      <p className="leading-snug">{item.name}</p>
                      <p className="text-sm text-ink-muted">
                        {FINISH_LABEL[item.finish]}
                        {item.size && ` · ${sizeLabel(item.size)}`}
                      </p>
                      <p className="price mt-1">{formatBRL(item.unitCents)}</p>
                    </div>
                    <ButtonAnchor href={ask(item)} size="sm" variant="secondary">
                      <WhatsAppIcon size={17} /> Quero esta
                    </ButtonAnchor>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mx-auto max-w-sm text-center text-ink-muted">{view.active ? `O mostruário de ${view.firstName} está sendo renovado. Fale com ela para saber as novidades.` : 'Mostruário em preparação. Fale com a gente pelo WhatsApp.'}</p>
            )}
            <div className="flex flex-col items-center gap-2 border-t border-line pt-6 text-center">
              <p className="text-ink-muted">{view.whatsapp ? `Pedidos com ${view.firstName}, pelo WhatsApp.` : 'Pedidos pelo WhatsApp da ÉKA.'}</p>
              <ButtonAnchor href={ask()}>
                <WhatsAppIcon size={19} /> {view.whatsapp ? `Falar com ${view.firstName}` : 'Falar com a ÉKA'}
              </ButtonAnchor>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default ShowcasePage;
