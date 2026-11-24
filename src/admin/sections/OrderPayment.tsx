import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, FileText, Link2, ReceiptText } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../components/ui/cx';
import { chargeAmount, type Order, type ReceiptMeta } from '../../data/orders';
import { centsToInput, formatBRL, parseBRL } from '../../lib/format';
import { useCatalog } from '../../store/catalog';
import { formatDateTime } from '../lib/contact';
import { ADMIN_BASE } from '../lib/paths';
import { changeOrderStatus, chargeOrder, receiptObjectUrl, receiptUrl, useOrders } from '../lib/orders';
import { copyText, MessageActions, OrderMessageComposer, useOrderMessage } from './OrderMessages';

/*
 * Payment in the order detail: "Cobrar por Pix" (confirms the order if needed,
 * creates the charge and the payment link, and hands over a ready WhatsApp
 * message) and the receipts the customer sent through the link.
 */

const copy = copyText;

/** The charge message (active "Cobrança Pix" variation) for an order with a charge. */
export function useChargeMessage(order: Order) {
  const pix = useCatalog((s) => s.data.settings.pix);
  const autoPix = useOrders((s) => s.autoPix);
  const om = useOrderMessage(order);
  return useMemo(() => (order.charge && (pix || autoPix) && om.link ? { link: om.link, message: om.compose('cobranca') } : null), [order.charge, pix, autoPix, om]);
}

/** "Cobrar por Pix": shipping/discount → charge → ready message. */
export function ChargeSheet({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={done ? 'Cobrança pronta' : `Cobrar pedido nº ${order.number} por Pix`} side="bottom" className="md-right">
      {/* Mounted per opening, so every opening starts from the order's current values. */}
      {open && <ChargeBody order={order} onClose={onClose} onDone={setDone} />}
    </Sheet>
  );
}

function ChargeBody({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (done: boolean) => void }) {
  const staticPix = useCatalog((s) => s.data.settings.pix);
  const autoPix = useOrders((s) => s.autoPix);
  const pix = staticPix ?? (autoPix || null);
  const [shipping, setShipping] = useState(() => centsToInput(order.charge?.shippingCents || undefined));
  const [discount, setDiscount] = useState(() => centsToInput(order.charge?.discountCents || undefined));
  const [errors, setErrors] = useState<{ shipping?: string; discount?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDoneState] = useState(false);
  const setDone = (value: boolean) => {
    setDoneState(value);
    onDone(value);
  };
  const ready = useChargeMessage(order);
  useEffect(() => () => onDone(false), [onDone]);

  const shippingCents = shipping.trim() ? parseBRL(shipping) : 0;
  const discountCents = discount.trim() ? parseBRL(discount) : 0;
  const amount = shippingCents != null && discountCents != null ? chargeAmount(order.totalCents, shippingCents, discountCents) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (shippingCents == null) next.shipping = 'Use um valor como 20,00.';
    if (discountCents == null) next.discount = 'Use um valor como 10,00.';
    if (amount != null && amount < 1) next.discount = 'O desconto não pode passar do total.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    let current = order;
    if (order.status === 'enviado') {
      // Confirming takes the pieces out of stock, so they are held while the customer pays.
      const problem = await changeOrderStatus(order, 'confirmado');
      if (problem) {
        setBusy(false);
        setErrors({ form: problem });
        return;
      }
      current = { ...order, status: 'confirmado' };
    }
    const result = await chargeOrder(current, shippingCents!, discountCents!);
    setBusy(false);
    if ('error' in result) {
      return setErrors({ form: order.status === 'enviado' ? `O pedido foi confirmado (peças separadas), mas a cobrança não foi criada: ${result.error} Tente gerar de novo.` : result.error });
    }
    setDone(true);
  }

  return (
    <>
      {!pix ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-[12px] bg-champagne px-4 py-3 text-sm">Para cobrar por Pix, cadastre primeiro a chave Pix da loja.</p>
          <Link to={`${ADMIN_BASE}/configuracoes`} onClick={onClose} className="inline-flex min-h-11 items-center gap-1.5 self-start text-copper underline underline-offset-4">
            Ir para Configurações
          </Link>
        </div>
      ) : done && ready ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-[12px] bg-[#e4ece6] px-4 py-3 text-sm text-success">
            <Check size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>
              Pedido confirmado e cobrança de <span className="price font-medium whitespace-nowrap">{formatBRL(order.charge?.amountCents ?? 0)}</span> criada.
            </span>
          </div>
          <p className="text-sm text-ink-muted">Escolha a variação, ajuste o que quiser e copie para a conversa com a cliente. A mensagem leva o link para pagar e enviar o comprovante.</p>
          <OrderMessageComposer order={order} types={['cobranca']} />
          <button type="button" className="min-h-11 text-sm text-copper underline underline-offset-4" onClick={() => void copy(ready.link, 'Link copiado.')}>
            Copiar só o link
          </button>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          {order.status === 'enviado' && (
            <p className="rounded-[12px] bg-champagne px-4 py-3 text-sm">O pedido será confirmado agora: as peças com controle de estoque ficam separadas para a cliente.</p>
          )}
          <div className="flex items-baseline justify-between border-b border-line pb-3">
            <span className="text-ink-muted">Peças</span>
            <span className="price">{formatBRL(order.totalCents)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Frete" optional inputMode="decimal" placeholder="0,00" icon={<span className="text-sm">R$</span>} value={shipping} error={errors.shipping} onChange={(e) => setShipping(e.target.value)} />
            <TextField label="Desconto" optional inputMode="decimal" placeholder="0,00" icon={<span className="text-sm">R$</span>} value={discount} error={errors.discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="flex items-baseline justify-between rounded-[12px] bg-champagne px-4 py-3">
            <span>Total da cobrança</span>
            <span className="font-display text-[1.75rem] leading-none">{amount != null && amount > 0 ? formatBRL(amount) : '—'}</span>
          </div>
          {order.charge && <p className="text-sm text-ink-muted">Mudar o valor gera um link novo; o link anterior deixa de valer.</p>}
          {errors.form && (
            <p role="alert" className="rounded-[10px] bg-[#f6e9e6] px-4 py-3 text-sm text-danger">
              {errors.form}
            </p>
          )}
          <Button type="submit" size="lg" block disabled={busy} aria-busy={busy}>
            {busy ? 'Gerando…' : order.status === 'enviado' ? 'Confirmar e gerar cobrança' : order.charge ? 'Atualizar cobrança' : 'Gerar cobrança'}
          </Button>
        </form>
      )}
    </>
  );
}

function ReceiptThumb({ receipt, number, index }: { receipt: ReceiptMeta; number: number; index: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const pdf = receipt.contentType === 'application/pdf';

  useEffect(() => {
    if (pdf) return;
    let active = true;
    let created: string | null = null;
    receiptObjectUrl(receipt.id).then(
      (u) => {
        created = u;
        if (active) setUrl(u);
        else URL.revokeObjectURL(u);
      },
      () => active && setFailed(true),
    );
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [receipt.id, pdf]);

  const label = `Comprovante ${index + 1}, enviado em ${formatDateTime(receipt.at)}`;
  return (
    <li className="flex items-center gap-3">
      {pdf ? (
        <a href={receiptUrl(receipt.id)} download aria-label={`${label} (baixar PDF)`} className="inline-flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-[8px] bg-champagne text-copper ring-1 ring-line hover:ring-copper">
          <FileText size={24} strokeWidth={1.4} aria-hidden="true" />
          <span className="text-[11px] font-medium">PDF</span>
        </a>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label={`Ver ${label}`} disabled={!url} className="h-20 w-16 shrink-0 overflow-hidden rounded-[8px] bg-champagne ring-1 ring-line hover:ring-copper disabled:opacity-60">
          {url ? <img src={url} alt="" className="h-full w-full object-cover object-top" /> : <span className="block h-full w-full animate-pulse" />}
        </button>
      )}
      <div className="min-w-0 text-sm">
        <p>Comprovante {index + 1}</p>
        <p className="text-ink-muted">{formatDateTime(receipt.at)}</p>
        {failed && <p className="text-danger">Não foi possível carregar.</p>}
        {pdf && (
          <a href={receiptUrl(receipt.id)} download className="inline-flex min-h-9 items-center gap-1 text-copper underline underline-offset-4">
            Baixar PDF <Download size={14} strokeWidth={1.5} aria-hidden="true" />
          </a>
        )}
      </div>
      {!pdf && url && (
        <Sheet open={open} onClose={() => setOpen(false)} title={`Comprovante do pedido nº ${number}`} side="full">
          <div className="flex justify-center">
            <img src={url} alt={label} className="max-h-[calc(100dvh-140px)] w-auto max-w-full rounded-[8px] object-contain ring-1 ring-line" />
          </div>
        </Sheet>
      )}
    </li>
  );
}

/** Charge status, the message again, and the receipts to check. */
/** `phone`: the linked customer's WhatsApp (the charge message then opens straight in her chat). */
export function PaymentSection({ order, onCharge, phone }: { order: Order; onCharge: () => void; phone?: string | undefined }) {
  const charge = order.charge;
  const receipts = order.receipts ?? [];
  const ready = useChargeMessage(order);
  const stray = order.strayPayments ?? [];
  if (!charge && !receipts.length && !stray.length) return null;
  const open = order.status === 'confirmado' || order.status === 'enviado';
  return (
    <section aria-labelledby={`pay-${order.id}`} className="flex flex-col gap-4 rounded-[12px] border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`pay-${order.id}`} className="font-medium">
            Cobrança Pix
          </h3>
          {charge && (
            <p className="text-sm text-ink-muted">
              {formatBRL(order.totalCents)}
              {charge.shippingCents > 0 && ` + frete ${formatBRL(charge.shippingCents)}`}
              {charge.discountCents > 0 && ` − desconto ${formatBRL(charge.discountCents)}`}
            </p>
          )}
        </div>
        {charge && <span className="price shrink-0 text-xl leading-none">{formatBRL(charge.amountCents)}</span>}
      </div>

      {charge?.paidBy === 'mercadopago' && <p className="text-sm text-success">Pago pelo Pix automático: o Mercado Pago confirmou o valor exato.</p>}
      {stray.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
          <p className="font-medium">Pix recebido que não bate com a cobrança atual</p>
          {stray.map((p) => (
            <p key={p.id}>
              {formatBRL(p.amountCents)} em {formatDateTime(p.at)} · pagamento {p.id} no Mercado Pago
            </p>
          ))}
          <p className="text-ink">O dinheiro entrou. Confira no Mercado Pago e combine com a cliente: ajustar o pedido, marcar como pago ou devolver.</p>
        </div>
      )}

      {receipts.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className={cx('flex items-center gap-2 text-sm font-medium', open ? 'text-copper' : 'text-ink-muted')}>
            <ReceiptText size={17} strokeWidth={1.5} aria-hidden="true" />
            {open ? 'Comprovante recebido: confira o valor e o recebedor' : 'Comprovantes enviados pela cliente'}
          </p>
          <ul className="flex flex-col gap-3">
            {receipts.map((r, i) => (
              <ReceiptThumb key={r.id} receipt={r} number={order.number} index={i} />
            ))}
          </ul>
        </div>
      ) : (
        open && <p className="text-sm text-ink-muted">Aguardando a cliente pagar e enviar o comprovante pelo link.</p>
      )}

      {open && charge && ready && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <MessageActions text={ready.message} quiet={receipts.length > 0} phone={phone} />
          <div className="flex flex-wrap gap-x-4">
            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-copper underline underline-offset-4" onClick={() => void copy(ready.link, 'Link copiado.')}>
              <Link2 size={15} strokeWidth={1.5} aria-hidden="true" /> Copiar link
            </button>
            <button type="button" className="min-h-11 text-sm text-copper underline underline-offset-4" onClick={onCharge}>
              Alterar frete ou desconto
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
