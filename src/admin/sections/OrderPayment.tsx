import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, FileText, Link2, ReceiptText, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../components/ui/cx';
import { chargeAmount, receiptsEraseAt, RECEIPTS_ERASABLE, settledSince, storedReceipts, type Order, type ReceiptMeta } from '../../data/orders';
import { centsToInput, formatBRL, parseBRL } from '../../lib/format';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { formatDateTime } from '../lib/contact';
import { ADMIN_BASE } from '../lib/paths';
import { changeOrderStatus, chargeOrder, eraseReceipt, eraseReceipts, receiptObjectUrl, receiptUrl } from '../lib/orders';
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
  const om = useOrderMessage(order);
  return useMemo(() => (order.charge && pix && om.link ? { link: om.link, message: om.compose('cobranca') } : null), [order.charge, pix, om]);
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
  const pix = useCatalog((s) => s.data.settings.pix);
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
          <Link to={`${ADMIN_BASE}/configuracoes?aba=pix`} onClick={onClose} className="inline-flex min-h-11 items-center gap-1.5 self-start text-copper underline underline-offset-4">
            Cadastrar a chave Pix
          </Link>
        </div>
      ) : done && ready ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-[12px] bg-success-tint px-4 py-3 text-sm text-success">
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
            <p role="alert" className="rounded-[10px] bg-danger-tint px-4 py-3 text-sm text-danger">
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

/** Day only, in the store's time zone (the automatic erasure date). */
const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Cuiaba' });

/** A receipt whose file is gone (discarded, replaced by the customer, or erased after the payment): only the record stays. */
function ErasedReceipt({ receipt, index }: { receipt: ReceiptMeta; index: number }) {
  const what = receipt.rejected ? 'Descartado' : receipt.replaced ? 'Trocado pela cliente' : 'Arquivo apagado';
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden="true" className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-[6px] bg-ivory text-ink-muted ring-1 ring-line">
        <ReceiptText size={17} strokeWidth={1.4} />
      </span>
      <div className="min-w-0 text-sm">
        <p>
          Comprovante {index + 1} <span className="text-ink-muted">· enviado em {formatDateTime(receipt.at)}</span>
        </p>
        <p className="text-ink-muted">
          {what} em {formatDateTime(receipt.erasedAt!)}
        </p>
      </div>
    </li>
  );
}

/** "Apagar comprovantes": once the payment is checked (paid, delivered or cancelled); asks before erasing. */
function EraseReceipts({ order }: { order: Order }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const stored = storedReceipts(order).length;
  if (!RECEIPTS_ERASABLE.has(order.status) || !stored) return null;
  const bulk = stored > 1;
  const since = settledSince(order);
  const autoAt = since ? receiptsEraseAt(since) : null;

  async function erase() {
    if (busy) return;
    setBusy(true);
    const problem = await eraseReceipts(order);
    setBusy(false);
    setAsking(false);
    toast(problem ?? 'Comprovantes apagados.', { tone: problem ? 'error' : 'success' });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <p className="text-sm text-ink-muted">
        Pagamento conferido? O comprovante já pode ser apagado: o extrato do banco é a prova do recebimento.
        {autoAt && ` Se ficar aqui, ele é apagado sozinho em ${DAY.format(autoAt)}.`}
      </p>
      {!bulk ? null : asking ? (
        <div role="group" aria-label="Confirmar a exclusão" className="flex flex-col gap-2 rounded-[10px] bg-ivory p-3">
          <p className="text-sm">Apagar os {stored} comprovantes deste pedido? Os arquivos não poderão ser recuperados; fica só o registro de que foram recebidos.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" disabled={busy} aria-busy={busy} onClick={() => void erase()}>
              {busy ? 'Apagando…' : 'Apagar'}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setAsking(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-copper underline underline-offset-4">
          <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" /> Apagar todos os comprovantes
        </button>
      )}
    </div>
  );
}

/**
 * One receipt's own action, in any status. Payment still open: "Descartar" (a wrong file; the link shows the
 * Pix again and asks for the right one). Payment checked: "Apagar". Asks before acting; nothing else changes.
 */
function ReceiptAction({ order, receipt, labelId }: { order: Order; receipt: ReceiptMeta; labelId: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const backToTrigger = useRef(false);
  const settled = RECEIPTS_ERASABLE.has(order.status);
  const verb = settled ? 'Apagar' : 'Descartar';

  // Focus follows the step: into the confirmation when it opens, back to the trigger on "Cancelar".
  useEffect(() => {
    if (asking) group.current?.focus();
    else if (backToTrigger.current) {
      backToTrigger.current = false;
      trigger.current?.focus();
    }
  }, [asking]);

  async function act() {
    if (busy) return;
    setBusy(true);
    // The server checks the order is still in the state she saw (another device may have changed it).
    const problem = await eraseReceipt(order, receipt.id, settled ? 'erase' : 'discard');
    setBusy(false);
    setAsking(false);
    toast(problem ?? (settled ? 'Comprovante apagado.' : 'Comprovante descartado. A cliente pode enviar o certo pelo mesmo link.'), { tone: problem ? 'error' : 'success' });
  }

  if (!asking) {
    return (
      <button ref={trigger} type="button" aria-describedby={labelId} onClick={() => setAsking(true)} className="inline-flex min-h-9 items-center gap-1 text-sm text-copper underline underline-offset-4">
        <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" /> {verb}
      </button>
    );
  }
  return (
    <div ref={group} tabIndex={-1} role="group" aria-label={`Confirmar: ${verb.toLowerCase()} o comprovante`} aria-describedby={labelId} className="mt-1 flex flex-col gap-2 rounded-[10px] bg-ivory p-3 outline-none focus-visible:ring-2 focus-visible:ring-copper">
      <p className="text-sm text-ink">
        {settled
          ? 'Apagar este comprovante? O arquivo não poderá ser recuperado; fica só o registro de que ele foi recebido.'
          : 'Descartar este comprovante? Use quando ele estiver errado. A cliente volta a ver o Pix no link e pode enviar o certo. O arquivo não poderá ser recuperado.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" size="sm" disabled={busy} aria-busy={busy} onClick={() => void act()}>
          {busy ? (settled ? 'Apagando…' : 'Descartando…') : verb}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            backToTrigger.current = true;
            setAsking(false);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function ReceiptThumb({ receipt, number, index, order }: { receipt: ReceiptMeta; number: number; index: number; order: Order }) {
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
        <p id={`rcp-label-${receipt.id}`}>Comprovante {index + 1}</p>
        <p className="text-ink-muted">{formatDateTime(receipt.at)}</p>
        {failed && <p className="text-danger">Não foi possível carregar.</p>}
        <ReceiptAction order={order} receipt={receipt} labelId={`rcp-label-${receipt.id}`} />
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
  if (!charge && !receipts.length) return null;
  const open = order.status === 'confirmado' || order.status === 'enviado';
  return (
    <section aria-labelledby={`pay-${order.id}`} className="flex flex-col gap-4 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
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

      {receipts.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className={cx('flex items-center gap-2 text-sm font-medium', open ? 'text-copper' : 'text-ink-muted')}>
            <ReceiptText size={17} strokeWidth={1.5} aria-hidden="true" />
            {open && storedReceipts(order).length > 0 ? 'Comprovante recebido: confira o valor e o recebedor' : 'Comprovantes enviados pela cliente'}
          </p>
          <ul className="flex flex-col gap-3">
            {/* The file to check first; the records of earlier files (replaced, discarded, erased) after it, newest first. */}
            {receipts.map((r, i) => (r.erasedAt ? null : <ReceiptThumb key={r.id} receipt={r} number={order.number} index={i} order={order} />))}
            {receipts.map((r, i) => (r.erasedAt ? <ErasedReceipt key={r.id} receipt={r} index={i} /> : null)).reverse()}
          </ul>
          <EraseReceipts order={order} />
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
