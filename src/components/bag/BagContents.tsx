import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, PencilLine, ShoppingBag, Trash2, User } from 'lucide-react';
import { useBusiness } from '../../hooks/useBusiness';
import { productImageSources } from '../../lib/assets';
import { formatBRL } from '../../lib/format';
import { buildOrderMessage, lineTotal, orderTotal, resolveCart, whatsappUrl } from '../../lib/whatsapp';
import { sizeLabel } from '../../data/catalog';
import { cartKey, useCart } from '../../store/cart';
import { useCatalog } from '../../store/catalog';
import { useCustomer } from '../../store/customer';
import { useUi } from '../../store/ui';
import { ButtonAnchor, ButtonLink, Button } from '../ui/Button';
import { WhatsAppIcon } from '../ui/Icons';
import { Img } from '../ui/Img';
import { Stepper } from '../ui/Misc';
import { cx } from '../ui/cx';

const inputClass =
  'min-h-12 w-full rounded-[10px] border border-line bg-white pr-3 pl-10 text-base text-ink placeholder:text-ink-muted focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper';

function useBag() {
  const items = useCart((s) => s.items);
  const data = useCatalog((s) => s.data);
  return useMemo(() => resolveCart(items, data), [items, data]);
}

export function BagCount() {
  const { lines } = useBag();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  return <span className="font-sans text-xl text-ink-muted">({count})</span>;
}

/** Line items, customer fields and the WhatsApp CTA. Shared by the sheet and the /sacola page. */
export function BagContents({ onNavigate, variant }: { onNavigate?: () => void; variant: 'sheet' | 'page' }) {
  const { lines, unavailable } = useBag();
  const data = useCatalog((s) => s.data);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const restore = useCart((s) => s.restore);
  const clear = useCart((s) => s.clear);
  const prune = useCart((s) => s.prune);
  const toast = useUi((s) => s.toast);
  const { name, city, note, setField } = useCustomer();
  const biz = useBusiness();
  const [sent, setSent] = useState(false);

  // Drop items whose product was deleted in the admin.
  useEffect(() => {
    prune((item) => data.products.some((p) => p.id === item.productId && p.variants.some((v) => v.id === item.variantId)));
  }, [data.products, prune]);

  const total = orderTotal(lines);
  const message = buildOrderMessage({ lines, name, city, note });

  if (!lines.length && !unavailable.length) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-champagne text-copper">
          <ShoppingBag size={28} strokeWidth={1.5} />
        </span>
        <p className="font-display text-title">Sua sacola está vazia</p>
        <p className="max-w-xs text-ink-muted">Escolha suas peças preferidas e envie o pedido pelo WhatsApp em poucos toques.</p>
        <ButtonLink to="/catalogo" onClick={onNavigate}>
          Ver catálogo
        </ButtonLink>
      </div>
    );
  }

  const removeLine = (key: string, productName: string) => {
    const removed = remove(key);
    if (removed) toast(`${productName} removido da sacola`, { action: { label: 'Desfazer', onClick: () => restore(removed.item, removed.index) } });
  };

  return (
    <div className={cx('flex flex-col gap-5', variant === 'page' && 'lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-12')}>
      <div className="flex flex-col">
        <ul className="divide-y divide-line border-y border-line">
          {lines.map((line) => {
            const product = data.products.find((p) => p.id === line.item.productId)!;
            const img = product.images[0];
            const src = img ? productImageSources(img, true) : null;
            return (
              <li key={line.key} className="flex gap-3 py-4">
                <Link to={`/produto/${product.slug}`} onClick={onNavigate} className="w-[84px] shrink-0 rounded-[10px]" aria-label={product.name} tabIndex={-1}>
                  <Img src={src?.src ?? ''} srcSet={src?.srcSet} sizes="84px" alt="" frameClassName="rounded-[10px]" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/produto/${product.slug}`} onClick={onNavigate} className="block leading-snug hover:text-copper">
                        {line.name}
                      </Link>
                      <p className="text-sm text-ink-muted">
                        {line.finish}
                        {line.size && ` · ${sizeLabel(line.size)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remover ${line.name}`}
                      onClick={() => removeLine(line.key, line.name)}
                      className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-champagne hover:text-danger"
                    >
                      <Trash2 size={18} strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <p className="price">{formatBRL(lineTotal(line))}</p>
                    <Stepper size="sm" value={line.qty} label={`Quantidade de ${line.name}`} onChange={(q) => setQty(line.key, q)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {unavailable.length > 0 && (
          <div className="mt-3 rounded-[10px] bg-champagne px-4 py-3 text-sm">
            <p>
              {unavailable.length === 1 ? 'Uma peça da sua sacola esgotou' : `${unavailable.length} peças da sua sacola esgotaram`} e não vai no pedido.
            </p>
            <button type="button" className="mt-1 min-h-11 font-medium text-copper underline underline-offset-4" onClick={() => unavailable.forEach((i) => remove(cartKey(i)))}>
              Remover da sacola
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor={`bag-note-${variant}`}>Observação</label>
        <div className="relative">
          <PencilLine size={18} strokeWidth={1.5} className="pointer-events-none absolute top-3.5 left-3.5 text-ink-muted" aria-hidden="true" />
          <textarea
            id={`bag-note-${variant}`}
            rows={2}
            maxLength={300}
            placeholder="Observação (opcional)"
            value={note}
            onChange={(e) => setField('note', e.target.value)}
            className={cx(inputClass, 'min-h-12 resize-none py-3 leading-normal')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <label className="sr-only" htmlFor={`bag-name-${variant}`}>Seu nome</label>
            <User size={18} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input id={`bag-name-${variant}`} autoComplete="given-name" maxLength={80} placeholder="Seu nome" value={name} onChange={(e) => setField('name', e.target.value)} className={inputClass} />
          </div>
          <div className="relative">
            <label className="sr-only" htmlFor={`bag-city-${variant}`}>Cidade</label>
            <MapPin size={18} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input id={`bag-city-${variant}`} autoComplete="address-level2" maxLength={80} placeholder="Cidade" value={city} onChange={(e) => setField('city', e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="flex items-baseline justify-between pt-2">
          <span className="text-lg">Subtotal</span>
          <span className="price text-[1.375rem]">{formatBRL(total)}</span>
        </div>
        {lines.length > 0 ? (
          <ButtonAnchor href={whatsappUrl(biz.whatsapp, message)} size="lg" block onClick={() => setSent(true)}>
            <WhatsAppIcon size={22} /> Enviar pedido pelo WhatsApp
          </ButtonAnchor>
        ) : (
          <Button size="lg" block disabled>
            <WhatsAppIcon size={22} /> Enviar pedido pelo WhatsApp
          </Button>
        )}
        {sent && (
          <div className="flex items-center justify-between gap-3 rounded-[10px] bg-champagne px-4 py-2 text-sm">
            <span>Pedido enviado?</span>
            <button
              type="button"
              className="min-h-11 font-medium text-copper underline underline-offset-4"
              onClick={() => {
                clear();
                setSent(false);
                toast('Sacola limpa', { tone: 'success' });
              }}
            >
              Limpar sacola
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
