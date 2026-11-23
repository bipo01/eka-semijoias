import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileText, ImageIcon, LockKeyhole, ReceiptText, RefreshCw, X } from 'lucide-react';
import { Lockup } from '../components/layout/Logo';
import { PixCopyField, QrCode } from '../components/pay/PixCode';
import { Button, ButtonAnchor } from '../components/ui/Button';
import { WhatsAppIcon } from '../components/ui/Icons';
import { Toaster } from '../components/ui/Toaster';
import { cx } from '../components/ui/cx';
import { sizeLabel } from '../data/catalog';
import type { PayView } from '../data/orders';
import { FINISH_LABEL } from '../data/schema';
import { useBusiness } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ApiError, errorMessage } from '../lib/api';
import { formatBRL } from '../lib/format';
import { fetchPayView, uploadReceipt } from '../lib/payments';
import { buildPixPayload, pixText, pixTxid } from '../lib/pix';
import { isPdf, prepareReceipt } from '../lib/receipt';
import { whatsappUrl } from '../lib/whatsapp';
import { useMessages } from '../hooks/useMessages';

/*
 * /pagamento/:token — the payment link the owner sends on WhatsApp after
 * confirming an order: summary, exact amount, Pix (QR + copia e cola) and the
 * receipt upload. Standalone (no store navigation) so the customer can focus.
 */

type Load = { status: 'loading' } | { status: 'ready'; view: PayView } | { status: 'error'; message: string; notFound: boolean };

function Illustration({ name, className, size = 160 }: { name: 'pagamento' | 'comprovante-recebido' | 'pedido-registrado'; className?: string; size?: number }) {
  return (
    <img
      src={`/images/illustrations/${name}-320.webp`}
      srcSet={`/images/illustrations/${name}-320.webp 1x, /images/illustrations/${name}-640.webp 2x`}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

/** "——— Title ———" section heading from the brand stationery. */
function RuledTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span aria-hidden="true" className="h-px flex-1 bg-rose/60" />
      <h2 id={id} className="font-display text-title text-ink">
        {children}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-rose/60" />
    </div>
  );
}

function Summary({ view }: { view: PayView }) {
  const extras = view.shippingCents > 0 || view.discountCents > 0;
  return (
    <section aria-label="Resumo do pedido" className="overflow-hidden rounded-[14px] bg-champagne/70 shadow-[var(--shadow-1)]">
      <ul className="flex flex-col gap-3 px-5 pt-5">
        {view.items.map((item, i) => (
          <li key={i} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="leading-snug text-ink">{item.name}</p>
              <p className="text-sm text-ink-muted">
                {FINISH_LABEL[item.finish]}
                {item.size && ` · ${sizeLabel(item.size)}`}
                {item.qty > 1 && ` · ${item.qty} un.`}
              </p>
            </div>
            <p className="price shrink-0 text-ink">{formatBRL(item.lineCents)}</p>
          </li>
        ))}
      </ul>
      <dl className="mx-5 mt-4 flex flex-col gap-1.5 border-t border-rose/40 pt-3 pb-4 text-sm">
        {extras && (
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd className="price">{formatBRL(view.subtotalCents)}</dd>
          </div>
        )}
        {view.shippingCents > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-muted">Frete</dt>
            <dd className="price">{formatBRL(view.shippingCents)}</dd>
          </div>
        )}
        {view.discountCents > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-muted">Desconto</dt>
            <dd className="price">−{formatBRL(view.discountCents)}</dd>
          </div>
        )}
      </dl>
      <div className="flex items-baseline justify-between gap-3 bg-champagne px-5 py-4">
        <span className="text-ink-muted">Total</span>
        <span className="font-display text-[2rem] leading-none text-ink">{formatBRL(view.amountCents)}</span>
      </div>
    </section>
  );
}

function PixSection({ view }: { view: PayView }) {
  const pix = view.pix;
  const code = useMemo(() => (pix ? buildPixPayload({ key: pix.key, name: pix.name, city: pix.city, amountCents: view.amountCents, txid: pixTxid(view.number) }) : ''), [pix, view.amountCents, view.number]);
  if (!pix) {
    return (
      <p className="rounded-[12px] border border-line bg-white px-4 py-3 text-sm">
        O Pix desta loja está sendo atualizado. Fale com a gente pelo WhatsApp para receber os dados de pagamento.
      </p>
    );
  }
  return (
    <section aria-labelledby="pix-title" className="flex flex-col gap-5">
      <RuledTitle id="pix-title">Pague com Pix</RuledTitle>
      <div className="flex flex-col gap-5 rounded-[14px] bg-white p-5 shadow-[var(--shadow-1)]">
        <ol className="flex flex-col gap-2 text-sm text-ink-muted">
          <li className="flex gap-2.5">
            <span className="price inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-champagne text-xs text-copper">1</span>
            <span>
              Copie o código e cole em <strong className="font-medium text-ink">Pix Copia e Cola</strong> no app do seu banco.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="price inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-champagne text-xs text-copper">2</span>
            <span>
              Confira o valor de <span className="price text-ink">{formatBRL(view.amountCents)}</span> e o recebedor, e pague.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="price inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-champagne text-xs text-copper">3</span>
            <span>Envie o comprovante logo abaixo.</span>
          </li>
        </ol>
        <PixCopyField code={code} id="pix-code" />
        <div className="flex flex-col items-center gap-2 border-t border-line pt-5">
          <p className="text-sm text-ink-muted">No computador? Leia o QR Code com o celular.</p>
          <QrCode value={code} label={`QR Code Pix de ${formatBRL(view.amountCents)}`} className="size-[188px] ring-1 ring-line" />
          <p className="text-center text-sm text-ink-muted">
            Recebedor: <span className="text-ink">{pixText(pix.name, 25)}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

const kb = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

function ReceiptUpload({ token, number, onSent, again }: { token: string; number: number; onSent: () => void; again?: boolean }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (!(f.type.startsWith('image/') || isPdf(f))) {
      setError('Envie uma imagem (PNG ou JPG) ou o PDF do comprovante.');
      return;
    }
    setFile(f);
    setPreview(f.type.startsWith('image/') && !/heic|heif/i.test(f.type) ? URL.createObjectURL(f) : null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) pick(e.dataTransfer.files[0]);
  };

  async function send() {
    if (!file || busy) return;
    setError(null);
    setProgress(0);
    try {
      const prepared = await prepareReceipt(file);
      if (!prepared.ok) {
        setError(prepared.message);
        return;
      }
      await uploadReceipt(token, prepared.blob, prepared.type, (f) => setProgress(f));
      setFile(null);
      setPreview(null);
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <section aria-labelledby="receipt-title" className="flex flex-col gap-5">
      <RuledTitle id="receipt-title">{again ? 'Enviar outro comprovante' : 'Envie o comprovante'}</RuledTitle>
      {!file ? (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            'group flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-dashed px-5 py-8 text-center transition-colors duration-[160ms]',
            dragging ? 'border-copper bg-champagne/70' : 'border-rose/70 bg-white/60 hover:border-copper hover:bg-white',
          )}
        >
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-champagne text-copper transition-transform duration-[240ms] group-hover:-translate-y-0.5">
            <ReceiptText size={26} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <span className="font-display text-title text-ink">Escolher o comprovante</span>
          <span className="text-sm text-ink-muted">
            <span className="hidden sm:inline">Arraste o arquivo aqui ou clique. </span>Print ou PDF do banco (PNG, JPG ou PDF).
          </span>
        </label>
      ) : (
        <div className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-3">
          {preview ? (
            <img src={preview} alt="Comprovante escolhido" className="h-20 w-16 shrink-0 rounded-[8px] object-cover object-top ring-1 ring-line" />
          ) : (
            <span className="inline-flex h-20 w-16 shrink-0 items-center justify-center rounded-[8px] bg-champagne text-copper">
              {isPdf(file) ? <FileText size={26} strokeWidth={1.4} aria-hidden="true" /> : <ImageIcon size={26} strokeWidth={1.4} aria-hidden="true" />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink">{file.name}</p>
            <p className="text-sm text-ink-muted">{kb(file.size)}</p>
            {busy && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-champagne" role="progressbar" aria-label="Enviando comprovante" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
                <div className="h-full rounded-full bg-copper transition-[width] duration-200" style={{ width: `${Math.max(6, Math.round((progress ?? 0) * 100))}%` }} />
              </div>
            )}
          </div>
          {!busy && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
              }}
              aria-label="Trocar arquivo"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-champagne hover:text-ink"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}
      <input
        ref={input}
        id={inputId}
        type="file"
        accept="image/*,application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && (
        <p role="alert" className="rounded-[10px] bg-[#f6e9e6] px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button size="lg" block disabled={!file || busy} aria-busy={busy} onClick={() => void send()}>
        {busy ? 'Enviando…' : 'Enviar comprovante'}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
        <LockKeyhole size={13} strokeWidth={1.5} aria-hidden="true" /> Só a ÉKA vê o seu comprovante. Pedido nº {number}.
      </p>
    </section>
  );
}

function StatusCard({ view, onAgain }: { view: PayView; onAgain?: () => void }) {
  const biz = useBusiness();
  const message = useMessages();
  if (view.state === 'pago') {
    return (
      <section className="flex flex-col items-center gap-3 rounded-[14px] bg-white px-5 py-8 text-center shadow-[var(--shadow-1)]">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-[#e4ece6] text-success">
          <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h2 className="font-display text-display-m">Pagamento confirmado</h2>
        <p className="max-w-xs text-ink-muted">Obrigada{view.firstName ? `, ${view.firstName}` : ''}! Seu pedido nº {view.number} está pago. A gente avisa pelo WhatsApp quando for enviado.</p>
      </section>
    );
  }
  if (view.state === 'cancelado') {
    return (
      <section className="flex flex-col items-center gap-3 rounded-[14px] bg-white px-5 py-8 text-center shadow-[var(--shadow-1)]">
        <h2 className="font-display text-display-m">Pedido cancelado</h2>
        <p className="max-w-xs text-ink-muted">Este pedido foi cancelado e não precisa ser pago. Se tiver alguma dúvida, fale com a gente.</p>
        <ButtonAnchor href={whatsappUrl(biz.whatsapp, `Olá! Tenho uma dúvida sobre o pedido nº ${view.number}.`)} variant="secondary">
          <WhatsAppIcon size={20} /> Falar no WhatsApp
        </ButtonAnchor>
      </section>
    );
  }
  // analise
  const last = view.receipts.at(-1);
  return (
    <section className="flex flex-col items-center gap-3 rounded-[14px] bg-white px-5 pt-6 pb-7 text-center shadow-[var(--shadow-1)]">
      <Illustration name="comprovante-recebido" size={150} />
      <h2 className="font-display text-display-m">Comprovante recebido!</h2>
      <p className="max-w-xs text-ink-muted">
        A gente confere o pagamento e confirma pelo WhatsApp{view.firstName ? `, ${view.firstName}` : ''}.
        {last && (
          <span className="mt-1 block text-sm">
            Enviado em {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(last.at))}.
          </span>
        )}
      </p>
      <div className="mt-1 flex w-full flex-col gap-2">
        <ButtonAnchor href={whatsappUrl(biz.whatsapp, message('comprovante', { pedido: String(view.number), primeiro_nome: view.firstName }))} variant="secondary" block>
          <WhatsAppIcon size={20} /> Avisar no WhatsApp
        </ButtonAnchor>
        {onAgain && (
          <button type="button" onClick={onAgain} className="min-h-11 text-sm text-copper underline underline-offset-4">
            Enviar outro comprovante
          </button>
        )}
      </div>
    </section>
  );
}

export function PaymentPage() {
  const { token = '' } = useParams();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [sendAgain, setSendAgain] = useState(false);
  const biz = useBusiness();
  const view = load.status === 'ready' ? load.view : null;
  useDocumentTitle(view ? `Pagamento do pedido nº ${view.number}` : 'Pagamento');

  const refresh = useCallback(async () => {
    try {
      const next = await fetchPayView(token);
      setLoad({ status: 'ready', view: next });
    } catch (error) {
      const notFound = error instanceof ApiError && error.status === 404;
      // A dead link (new amount, order reopened) must never keep showing an old value; a network
      // hiccup keeps what is on screen.
      setLoad((prev) => (prev.status === 'ready' && !notFound ? prev : { status: 'error', message: errorMessage(error), notFound }));
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const showUpload = view && (view.state === 'aguardando' || (view.state === 'analise' && sendAgain));

  return (
    <div className="min-h-dvh bg-ivory">
      <header className="mx-auto flex max-w-[520px] items-center gap-4 px-5 pt-7 pb-2">
        <span aria-hidden="true" className="h-px flex-1 bg-rose/60" />
        <Lockup />
        <span aria-hidden="true" className="h-px flex-1 bg-rose/60" />
      </header>

      <main className="mx-auto flex max-w-[520px] flex-col gap-8 px-5 pt-1 pb-[calc(40px+var(--safe-bottom))]">
        {load.status === 'loading' && (
          <div aria-busy="true" className="flex flex-col items-center gap-5 pt-6">
            <div className="size-40 animate-pulse rounded-full bg-champagne/70" />
            <div className="h-8 w-64 animate-pulse rounded-full bg-champagne/70" />
            <div className="h-48 w-full animate-pulse rounded-[14px] bg-champagne/60" />
          </div>
        )}

        {load.status === 'error' && (
          <section className="flex flex-col items-center gap-3 pt-6 text-center">
            <Illustration name="pagamento" size={150} />
            <h1 className="font-display text-display-m">{load.notFound ? 'Link de pagamento indisponível' : 'Não conseguimos abrir o pagamento'}</h1>
            <p className="max-w-sm text-ink-muted">{load.message}</p>
            {!load.notFound && (
              <Button variant="secondary" onClick={() => void refresh()}>
                <RefreshCw size={17} strokeWidth={1.5} /> Tentar de novo
              </Button>
            )}
            <ButtonAnchor href={whatsappUrl(biz.whatsapp, 'Olá! Preciso de ajuda com o link de pagamento do meu pedido.')} variant={load.notFound ? 'primary' : 'ghost'}>
              <WhatsAppIcon size={20} /> Falar no WhatsApp
            </ButtonAnchor>
          </section>
        )}

        {view && (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <Illustration name="pagamento" size={168} className="-mb-1" />
              <p className="eyebrow text-ink-muted">
                {view.firstName ? `Oi, ${view.firstName}! ` : ''}
                {{ aguardando: 'Falta pouco', analise: 'Quase lá', pago: 'Tudo certo', cancelado: 'Pedido cancelado' }[view.state]}
              </p>
              <h1 className="font-display text-display-l leading-tight text-ink">
                Pagamento do pedido <span className="whitespace-nowrap">nº {view.number}</span>
              </h1>
              <span aria-hidden="true" className="mt-1 h-px w-24 bg-rose/60" />
            </div>

            <Summary view={view} />

            {view.state === 'aguardando' && <PixSection view={view} />}
            {(view.state === 'pago' || view.state === 'cancelado' || (view.state === 'analise' && !sendAgain)) && (
              <StatusCard view={view} {...(view.state === 'analise' && view.receipts.length < 6 ? { onAgain: () => setSendAgain(true) } : {})} />
            )}
            {showUpload && (
              <ReceiptUpload
                token={token}
                number={view.number}
                again={view.state === 'analise'}
                onSent={() => {
                  setSendAgain(false);
                  void refresh();
                }}
              />
            )}

            <footer className="flex flex-col items-center gap-1 border-t border-line pt-6 text-center text-sm text-ink-muted">
              <p>Alguma dúvida sobre o pagamento?</p>
              <a href={whatsappUrl(biz.whatsapp, `Olá! Tenho uma dúvida sobre o pagamento do pedido nº ${view.number}.`)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-copper underline underline-offset-4">
                <WhatsAppIcon size={17} /> Fale com a gente
              </a>
            </footer>
          </>
        )}
      </main>
      <Toaster />
    </div>
  );
}

export default PaymentPage;
