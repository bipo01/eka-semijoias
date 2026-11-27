import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Eye, FileText, ImageIcon, LockKeyhole, ReceiptText, RefreshCw, X } from 'lucide-react';
import { Lockup } from '../components/layout/Logo';
import { PixCopyField, QrCode } from '../components/pay/PixCode';
import { Button, ButtonAnchor } from '../components/ui/Button';
import { WhatsAppIcon } from '../components/ui/Icons';
import { Sheet } from '../components/ui/Sheet';
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
import { isPdf, prepareReceipt, snapshotFile } from '../lib/receipt';
import { whatsappUrl } from '../lib/whatsapp';
import { useMessages } from '../hooks/useMessages';
import { useSection, useSectionsReady } from '../hooks/useSection';
import { fillString, fillText } from '../content/fillText';

/*
 * /pagamento/:token — the payment link the owner sends on WhatsApp after
 * confirming an order: summary, exact amount, Pix (QR + copia e cola) and the
 * receipt upload. Standalone (no store navigation) so the customer can focus.
 * The texts come from the "pagamento" section (Painel → Site).
 */

/** "Pix Copia e Cola" stands out in the steps wherever the owner kept it. */
const PIX_EMPHASIS = { phrase: 'Pix Copia e Cola', render: (phrase: string) => <strong className="font-medium text-ink">{phrase}</strong> };

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

const AmountText = ({ cents }: { cents: number }) => <span className="price text-ink">{formatBRL(cents)}</span>;

const Step = ({ n, children }: { n: number; children: ReactNode }) => (
  <li className="flex gap-2.5">
    <span className="price inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-champagne text-xs text-copper">{n}</span>
    <span>{children}</span>
  </li>
);

function PixSection({ view }: { view: PayView }) {
  const t = useSection('pagamento');
  const pix = view.pix;
  const code = useMemo(() => (pix ? buildPixPayload({ key: pix.key, name: pix.name, city: pix.city, amountCents: view.amountCents, txid: pixTxid(view.number) }) : ''), [pix, view.amountCents, view.number]);
  if (!pix) {
    return (
      <p className="rounded-[12px] border border-line bg-white px-4 py-3 text-sm">{t.pix.unavailable}</p>
    );
  }
  return (
    <section aria-labelledby="pix-title" className="flex flex-col gap-5">
      <RuledTitle id="pix-title">{t.pix.title}</RuledTitle>
      <div className="flex flex-col gap-5 rounded-[14px] bg-white p-5 shadow-[var(--shadow-1)]">
        <ol className="flex flex-col gap-2 text-sm text-ink-muted">
          <Step n={1}>{fillText(t.pix.step1, {}, PIX_EMPHASIS)}</Step>
          <Step n={2}>{fillText(t.pix.step2, { total: <AmountText cents={view.amountCents} /> }, PIX_EMPHASIS)}</Step>
          <Step n={3}>{fillText(t.pix.step3, {}, PIX_EMPHASIS)}</Step>
        </ol>
        <PixCopyField code={code} id="pix-code" />
        <div className="flex flex-col items-center gap-2 border-t border-line pt-5">
          {t.pix.qrHint && <p className="text-center text-sm text-ink-muted">{t.pix.qrHint}</p>}
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
  const t = useSection('pagamento');
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** The picked PDF, to open in the phone's viewer ("Ver comprovante"). */
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (!(f.type.startsWith('image/') || isPdf(f))) {
      setError('Envie uma imagem (PNG ou JPG) ou o PDF do comprovante.');
      return;
    }
    // Read it now: Chrome on Android reads a picked file only when it is sent, and refuses the upload
    // (net::ERR_UPLOAD_FILE_CHANGED, shown as "Sem conexão") when the phone touched the file meanwhile,
    // as it does with a screenshot just taken. The copy in memory cannot change.
    const copy = await snapshotFile(f);
    if (!copy) {
      setError('Não conseguimos abrir este arquivo. Escolha o comprovante de novo.');
      return;
    }
    setFile(copy);
    setPreview(copy.type.startsWith('image/') && !/heic|heif/i.test(copy.type) ? URL.createObjectURL(copy) : null);
    setPdfUrl(isPdf(copy) ? URL.createObjectURL(copy) : null);
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
    setPdfUrl(null);
    setViewing(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) void pick(e.dataTransfer.files[0]);
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
      clear();
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <section aria-labelledby="receipt-title" className="flex flex-col gap-5">
      <RuledTitle id="receipt-title">{again ? t.receipt.againTitle : t.receipt.title}</RuledTitle>
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
          {/* The whole thumbnail + name opens the receipt full screen, to check it is the right one. */}
          {(() => {
            const thumb = preview ? (
              <img src={preview} alt="" className="h-20 w-16 shrink-0 rounded-[8px] object-cover object-top ring-1 ring-line" />
            ) : (
              <span className="inline-flex h-20 w-16 shrink-0 items-center justify-center rounded-[8px] bg-champagne text-copper">
                {isPdf(file) ? <FileText size={26} strokeWidth={1.4} aria-hidden="true" /> : <ImageIcon size={26} strokeWidth={1.4} aria-hidden="true" />}
              </span>
            );
            const text = (
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm text-ink">{file.name}</span>
                <span className="block text-sm text-ink-muted">{kb(file.size)}</span>
                {!busy && (preview || pdfUrl) && (
                  <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-copper">
                    <Eye size={16} strokeWidth={1.75} aria-hidden="true" /> Toque para ver
                  </span>
                )}
                {busy && (
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-champagne" role="progressbar" aria-label="Enviando comprovante" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
                    <span className="block h-full rounded-full bg-copper transition-[width] duration-200" style={{ width: `${Math.max(6, Math.round((progress ?? 0) * 100))}%` }} />
                  </span>
                )}
              </span>
            );
            const cls = 'flex min-w-0 flex-1 items-center gap-3 rounded-[10px] select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper';
            if (busy || (!preview && !pdfUrl)) return <span className={cls}>{thumb}{text}</span>;
            return pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noopener" aria-label={`Ver comprovante: ${file.name}`} className={cls}>
                {thumb}
                {text}
              </a>
            ) : (
              <button type="button" onClick={() => setViewing(true)} aria-label={`Ver comprovante: ${file.name}`} className={cls}>
                {thumb}
                {text}
              </button>
            );
          })()}
          {!busy && (
            <button
              type="button"
              onClick={clear}
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
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {preview && file && (
        <Sheet
          open={viewing}
          onClose={() => setViewing(false)}
          title="Seu comprovante"
          side="full"
          footer={
            <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  clear();
                  input.current?.click();
                }}
              >
                Trocar arquivo
              </Button>
              <Button onClick={() => setViewing(false)}>Está certo</Button>
            </div>
          }
        >
          {/* Full width, scrolling down a long screenshot; the phone's own zoom works on it too. */}
          <img src={preview} alt={`Comprovante escolhido: ${file.name}`} className="mx-auto block h-auto w-full max-w-md rounded-[10px] ring-1 ring-line" />
        </Sheet>
      )}
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
      <p className="-mt-3 text-center text-xs text-ink-muted">
        <a href="/privacidade" target="_blank" rel="noopener" className="inline-flex min-h-6 items-center underline underline-offset-4 hover:text-copper">
          Política de privacidade
        </a>
      </p>
    </section>
  );
}

function StatusCard({ view, onAgain }: { view: PayView; onAgain?: () => void }) {
  const biz = useBusiness();
  const message = useMessages();
  const t = useSection('pagamento');
  const vars = { pedido: String(view.number), primeiro_nome: view.firstName };
  if (view.state === 'pago') {
    return (
      <section className="flex flex-col items-center gap-3 rounded-[14px] bg-white px-5 py-8 text-center shadow-[var(--shadow-1)]">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-[#e4ece6] text-success">
          <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h2 className="font-display text-display-m">{t.status.paidTitle}</h2>
        <p className="max-w-xs text-ink-muted">{fillString(t.status.paidText, vars)}</p>
      </section>
    );
  }
  if (view.state === 'cancelado') {
    return (
      <section className="flex flex-col items-center gap-3 rounded-[14px] bg-white px-5 py-8 text-center shadow-[var(--shadow-1)]">
        <h2 className="font-display text-display-m">{t.status.cancelledTitle}</h2>
        <p className="max-w-xs text-ink-muted">{fillString(t.status.cancelledText, vars)}</p>
        <ButtonAnchor href={whatsappUrl(biz.whatsapp, fillString(t.help.cancelledMessage, vars))} variant="secondary">
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
      <h2 className="font-display text-display-m">{t.status.reviewTitle}</h2>
      <p className="max-w-xs text-ink-muted">
        {fillString(t.status.reviewText, vars)}
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
  const t = useSection('pagamento');
  // The owner's texts are known before anything is shown (no built-in text swapped in front of the customer).
  const textsReady = useSectionsReady();
  const view = load.status === 'ready' && textsReady ? load.view : null;
  useDocumentTitle(view ? `${t.header.title} nº ${view.number}` : 'Pagamento');

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
        {(load.status === 'loading' || !textsReady) && (
          <div aria-busy="true" className="flex flex-col items-center gap-5 pt-6">
            <div className="size-40 animate-pulse rounded-full bg-champagne/70" />
            <div className="h-8 w-64 animate-pulse rounded-full bg-champagne/70" />
            <div className="h-48 w-full animate-pulse rounded-[14px] bg-champagne/60" />
          </div>
        )}

        {load.status === 'error' && textsReady && (
          <section className="flex flex-col items-center gap-3 pt-6 text-center">
            <Illustration name="pagamento" size={150} />
            <h1 className="font-display text-display-m">{load.notFound ? t.problem.goneTitle : t.problem.failedTitle}</h1>
            <p className="max-w-sm text-ink-muted">{load.message}</p>
            {!load.notFound && (
              <Button variant="secondary" onClick={() => void refresh()}>
                <RefreshCw size={17} strokeWidth={1.5} /> Tentar de novo
              </Button>
            )}
            <ButtonAnchor href={whatsappUrl(biz.whatsapp, fillString(t.problem.message, {}))} variant={load.notFound ? 'primary' : 'ghost'}>
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
                {{ aguardando: t.header.waiting, analise: t.header.review, pago: t.header.paid, cancelado: t.header.cancelled }[view.state]}
              </p>
              <h1 className="font-display text-display-l leading-tight text-ink">
                {t.header.title} <span className="whitespace-nowrap">nº {view.number}</span>
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
              {t.help.question && <p>{t.help.question}</p>}
              <a href={whatsappUrl(biz.whatsapp, fillString(t.help.message, { pedido: String(view.number), primeiro_nome: view.firstName }))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-copper underline underline-offset-4">
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
