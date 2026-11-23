import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MapPin, PencilLine, ShoppingBag, Trash2, User } from 'lucide-react';
import { useBusiness } from '../../hooks/useBusiness';
import { productImageSources } from '../../lib/assets';
import { formatBRL } from '../../lib/format';
import { buildOrderMessage, lineTotal, orderTotal, resolveCart, whatsappUrl, type OrderLine } from '../../lib/whatsapp';
import { sizeLabel } from '../../data/catalog';
import { finishLabel, pricingMessage, type PricingProblem } from '../../data/orders';
import { ApiError, errorMessage, idempotencyKey } from '../../lib/api';
import { createOrder } from '../../lib/orders';
import { cartKey, MAX_QTY, useCart } from '../../store/cart';
import { useCatalog } from '../../store/catalog';
import { cartSignature, useCheckout, type RegisteredOrder } from '../../store/checkout';
import { useCustomer } from '../../store/customer';
import { useUi } from '../../store/ui';
import { ButtonAnchor, ButtonLink, Button } from '../ui/Button';

// The QR Code encoder only loads once an order is registered with Pix.
const PixPayment = lazy(() => import('./PixPayment').then((m) => ({ default: m.PixPayment })));
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
/** Order lines as the WhatsApp message needs them, from the server-priced order. */
const orderLines = (order: RegisteredOrder): OrderLine[] =>
  order.items.map((i) => ({ name: i.name, finish: finishLabel(i.finish), ...(i.size ? { size: i.size } : {}), qty: i.qty, unitCents: i.unitCents }));

/** After "Finalizar pedido": the order number, the Pix and the WhatsApp button. */
function RegisteredView({ order, onNavigate }: { order: RegisteredOrder; onNavigate?: (() => void) | undefined }) {
  const biz = useBusiness();
  const pix = useCatalog((s) => s.data.settings.pix);
  const { sent, markSent, reset } = useCheckout();
  const clearCart = useCart((s) => s.clear);
  const showPix = order.pix && pix;
  const message = buildOrderMessage({ lines: orderLines(order), name: order.name, city: order.city, ...(order.note ? { note: order.note } : {}), number: order.number, pix: !!showPix });
  const units = order.items.reduce((sum, i) => sum + i.qty, 0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-champagne text-copper">
          <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h3 ref={heading} tabIndex={-1} className="font-display text-display-m focus:outline-none">
          Pedido nº {order.number} registrado
        </h3>
        <p className="max-w-sm text-ink-muted">
          {sent ? 'Pronto! Se o WhatsApp não abriu, toque no botão de novo.' : 'Agora envie o pedido pelo WhatsApp para combinarmos a entrega.'}
        </p>
      </div>

      <div className="flex items-baseline justify-between border-y border-line py-3">
        <span className="text-ink-muted">
          {units} {units === 1 ? 'peça' : 'peças'}
        </span>
        <span className="price text-[1.375rem]">{formatBRL(order.totalCents)}</span>
      </div>

      <ButtonAnchor
        href={whatsappUrl(biz.whatsapp, message)}
        size="lg"
        block
        onClick={() => {
          markSent();
          clearCart();
        }}
      >
        <WhatsAppIcon size={22} /> {sent ? 'Enviar de novo pelo WhatsApp' : 'Enviar pedido pelo WhatsApp'}
      </ButtonAnchor>
      {showPix && (
        <Suspense fallback={<div className="h-[420px] animate-pulse rounded-[12px] border border-line bg-white" aria-busy="true" />}>
          <PixPayment pix={pix} amountCents={order.totalCents} orderNumber={order.number} />
        </Suspense>
      )}

      {sent ? (
        <ButtonLink
          to="/catalogo"
          variant="secondary"
          block
          onClick={() => {
            reset();
            onNavigate?.();
          }}
        >
          Continuar comprando
        </ButtonLink>
      ) : (
        <button type="button" className="min-h-11 self-center text-sm text-copper underline underline-offset-4" onClick={reset}>
          Alterar pedido
        </button>
      )}
    </div>
  );
}

type Phase = { state: 'edit'; error?: string } | { state: 'sending' } | { state: 'failed'; message: string };

/** Line items, customer fields and checkout. Shared by the sheet and the /sacola page. */
export function BagContents({ onNavigate, variant }: { onNavigate?: () => void; variant: 'sheet' | 'page' }) {
  const { lines, unavailable } = useBag();
  const data = useCatalog((s) => s.data);
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const restore = useCart((s) => s.restore);
  const prune = useCart((s) => s.prune);
  const toast = useUi((s) => s.toast);
  const { name, city, note, setField } = useCustomer();
  const biz = useBusiness();
  const { order, sent, setOrder, reset } = useCheckout();
  const registeredFrom = useCheckout((s) => s.cartSignature);
  const [phase, setPhase] = useState<Phase>({ state: 'edit' });
  const [errors, setErrors] = useState<{ name?: string; city?: string }>({});
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  // While a registered order waits to be sent, the bag it came from stays as it is: catalog updates
  // must not change it (that would discard the confirmation and invite a duplicate order).
  const holding = !!order && !sent;

  // Drop items whose product was deleted in the admin.
  useEffect(() => {
    if (holding) return;
    prune((item) => data.products.some((p) => p.id === item.productId && p.variants.some((v) => v.id === item.variantId)));
  }, [data.products, prune, holding]);

  // Never hold more than the stock: lower the quantity and say so.
  useEffect(() => {
    if (holding) return;
    for (const line of lines) {
      if (line.available !== null && line.qty > line.available) {
        setQty(line.key, line.available);
        toast(`Ajustamos ${line.name}: ${line.available === 1 ? 'só resta 1 unidade' : `só restam ${line.available} unidades`}.`);
      }
    }
  }, [lines, setQty, toast, holding]);

  // Changing the bag after registering (or adding after sending) starts a new order.
  const currentSignature = cartSignature(items);
  useEffect(() => {
    if (order && (sent ? items.length > 0 : currentSignature !== registeredFrom)) reset();
  }, [order, sent, items.length, currentSignature, registeredFrom, reset]);

  if (order && (sent || currentSignature === registeredFrom)) return <RegisteredView order={order} onNavigate={onNavigate} />;

  const total = orderTotal(lines);
  const sending = phase.state === 'sending';

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

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending || !lines.length) return;
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Informe seu nome.';
    if (city.trim().length < 2) next.city = 'Informe sua cidade.';
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(next.name ? `bag-name-${variant}` : `bag-city-${variant}`)?.focus();
      return;
    }
    const request = {
      items: lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, ...(l.item.size ? { size: l.item.size } : {}), qty: l.qty })),
      name: name.trim(),
      city: city.trim(),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    // Same bag and details → same key, so a retry or a double tap returns the same order.
    const signature = JSON.stringify(request);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: idempotencyKey() };
    // The bag as it is now (the steppers are locked while sending): the order belongs to this bag.
    const bagSignature = cartSignature(items);
    setPhase({ state: 'sending' });
    try {
      const created = await createOrder(request, attempt.current.key);
      if (!created) throw new ApiError(500, 'not_registered', 'Não foi possível registrar o pedido agora.');
      setOrder({ ...created, name: request.name, city: request.city, ...(request.note ? { note: request.note } : {}) }, bagSignature);
      attempt.current = null;
      setPhase({ state: 'edit' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Something sold out or changed: bring the latest catalog so the bag shows it.
        const problems = (error.details as { problems?: PricingProblem[] } | undefined)?.problems ?? [];
        void useCatalog.getState().refresh(undefined, { force: true });
        setPhase({ state: 'edit', error: problems.length ? pricingMessage(problems) : error.message });
      } else if (error instanceof ApiError && (error.status === 400 || error.status === 413)) {
        setPhase({ state: 'edit', error: error.message });
      } else {
        setPhase({ state: 'failed', message: errorMessage(error) });
      }
    }
  }

  // Fallback when the order could not be registered: the sale still goes through WhatsApp.
  const fallbackMessage = buildOrderMessage({ lines, name, city, note });

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
                      disabled={sending}
                      className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-champagne hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 size={18} strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <p className="price">{formatBRL(lineTotal(line))}</p>
                    <Stepper
                      size="sm"
                      value={line.qty}
                      max={line.available === null ? MAX_QTY : Math.min(MAX_QTY, line.available)}
                      label={`Quantidade de ${line.name}`}
                      disabled={sending}
                      onChange={(q) => setQty(line.key, q)}
                    />
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

      <form noValidate onSubmit={submit} className="flex flex-col gap-3" aria-busy={sending}>
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
          <div>
            <div className="relative">
              <label className="sr-only" htmlFor={`bag-name-${variant}`}>Seu nome</label>
              <User size={18} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                id={`bag-name-${variant}`}
                autoComplete="given-name"
                maxLength={80}
                placeholder="Seu nome"
                value={name}
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? `bag-name-${variant}-error` : undefined}
                onChange={(e) => {
                  setField('name', e.target.value);
                  if (errors.name) setErrors((er) => ({ ...er, name: undefined }));
                }}
                className={cx(inputClass, errors.name && 'border-danger')}
              />
            </div>
            {errors.name && <p id={`bag-name-${variant}-error`} className="mt-1 text-sm text-danger">{errors.name}</p>}
          </div>
          <div>
            <div className="relative">
              <label className="sr-only" htmlFor={`bag-city-${variant}`}>Cidade</label>
              <MapPin size={18} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                id={`bag-city-${variant}`}
                autoComplete="address-level2"
                maxLength={80}
                placeholder="Cidade"
                value={city}
                aria-invalid={!!errors.city || undefined}
                aria-describedby={errors.city ? `bag-city-${variant}-error` : undefined}
                onChange={(e) => {
                  setField('city', e.target.value);
                  if (errors.city) setErrors((er) => ({ ...er, city: undefined }));
                }}
                className={cx(inputClass, errors.city && 'border-danger')}
              />
            </div>
            {errors.city && <p id={`bag-city-${variant}-error`} className="mt-1 text-sm text-danger">{errors.city}</p>}
          </div>
        </div>
        <div className="flex items-baseline justify-between pt-2">
          <span className="text-lg">Subtotal</span>
          <span className="price text-[1.375rem]">{formatBRL(total)}</span>
        </div>
        {phase.state === 'edit' && phase.error && (
          <p role="alert" className="rounded-[10px] bg-champagne px-4 py-3 text-sm">
            {phase.error}
          </p>
        )}
        {phase.state === 'failed' ? (
          <div role="alert" className="flex flex-col gap-3 rounded-[12px] border border-line bg-white p-4">
            <p className="text-sm">
              <span className="font-medium">Não conseguimos registrar o pedido.</span> {phase.message} Você pode tentar de novo ou enviar direto pelo WhatsApp.
            </p>
            <Button type="submit" size="lg" block>
              Tentar de novo
            </Button>
            <ButtonAnchor href={whatsappUrl(biz.whatsapp, fallbackMessage)} variant="secondary" block>
              <WhatsAppIcon size={20} /> Enviar pelo WhatsApp mesmo assim
            </ButtonAnchor>
          </div>
        ) : (
          <Button type="submit" size="lg" block disabled={!lines.length || sending} aria-disabled={sending || undefined}>
            {sending ? 'Registrando pedido…' : 'Finalizar pedido'}
          </Button>
        )}
        <p className="text-center text-sm text-ink-muted">Usamos seu nome e cidade só para acompanhar o seu pedido.</p>
      </form>
    </div>
  );
}
