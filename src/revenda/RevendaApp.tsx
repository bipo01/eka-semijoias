import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clock3, Copy, ExternalLink, Eye, LogOut, Minus, Plus, ShoppingBag, Undo2 } from 'lucide-react';
import { Lockup } from '../components/layout/Logo';
import { InstallAppButton } from '../components/install/InstallAppButton';
import { Button, ButtonAnchor, ButtonLink } from '../components/ui/Button';
import { forgetPanelShowcase, rememberPanelShowcase } from '../lib/panelShowcase';
import { TextField } from '../components/ui/Field';
import { WhatsAppIcon } from '../components/ui/Icons';
import { Img } from '../components/ui/Img';
import { Chip } from '../components/ui/Misc';
import { Sheet } from '../components/ui/Sheet';
import { Toaster } from '../components/ui/Toaster';
import { cx } from '../components/ui/cx';
import { sizeLabel } from '../data/catalog';
import { warrantyText, warrantyUntil } from '../data/customers';
import { firstNameOf } from '../data/messages';
import { daysLeft, PAYMENT_LABEL, PAYMENT_METHODS, repassePixTxid, repasseState, type KitLineState, type PaymentMethod, type ResellerSale } from '../data/revenda';
import { PixCopyField, QrCode } from '../components/pay/PixCode';
import { useBusiness } from '../hooks/useBusiness';
import { buildPixPayload, pixText } from '../lib/pix';
import { FINISH_LABEL } from '../data/schema';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSection, useSectionsReady } from '../hooks/useSection';
import { fillString } from '../content/fillText';
import { messageItems, useMessages } from '../hooks/useMessages';
import { ApiError, errorMessage, idempotencyKey } from '../lib/api';
import { productImageSources } from '../lib/assets';
import { formatBRL, parseBRL } from '../lib/format';
import { applyAppHead } from '../lib/install';
import { maskPhone } from '../lib/lead';
import { whatsappUrl } from '../lib/whatsapp';
import { useCatalog } from '../store/catalog';
import { toast } from '../store/ui';
import { acceptContract, acceptInvite, cancelSale, fetchInvite, fetchMe, login, logout, registerSale, reportRepasse, type InviteView, type Me } from './api';

/*
 * /revenda — the reseller's own panel (docs/revenda/PLAN.md §3): login with
 * WhatsApp + PIN, first access (contract + PIN) from the invite link, and the
 * panel: summary with commission progress, kit, sales (with the message to
 * her customer) and past cycles. Mobile first; installable as "ÉKA Revenda".
 * The texts come from the "revenda" section (Painel → Site); every page waits
 * for them (useSectionsReady) together with its own data.
 */

const lineKey = (l: { productId: string; variantId: string; size: string }) => `${l.productId}|${l.variantId}|${l.size}`;

function Shell({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  return (
    <div className="min-h-dvh bg-ivory">
      <header className={cx('mx-auto flex max-w-[560px] items-center gap-3 px-5 pt-6 pb-2', !onLogout && 'justify-center')}>
        <Lockup className="h-9 w-auto" />
        <span className="eyebrow text-ink-muted">Revenda</span>
        {onLogout && (
          <button type="button" onClick={onLogout} className="ml-auto inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
            <LogOut size={17} strokeWidth={1.5} /> Sair
          </button>
        )}
      </header>
      <main className="mx-auto flex max-w-[560px] flex-col gap-6 px-5 pt-2 pb-[calc(40px+var(--safe-bottom))]">{children}</main>
      <Toaster />
    </div>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

function LoginPage() {
  useDocumentTitle('Revenda · Entrar');
  const t = useSection('revenda').login;
  const navigate = useNavigate();
  const [whatsapp, setWhatsapp] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (whatsapp.replace(/\D/g, '').length < 10) return setError('Digite seu WhatsApp com DDD.');
    if (!/^\d{6}$/.test(pin)) return setError('O PIN tem 6 números.');
    setBusy(true);
    try {
      await login(whatsapp, pin);
      navigate('/revenda/painel', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-col gap-1 pt-4 text-center">
        <h1 className="font-display text-display-m">{t.title}</h1>
        {t.text && <p className="text-ink-muted">{t.text}</p>}
      </div>
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 rounded-[14px] bg-white p-5 shadow-[var(--shadow-1)]">
        <TextField label="WhatsApp" inputMode="tel" autoComplete="username" value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')))} />
        <TextField label="PIN" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" size="lg" block disabled={busy} aria-busy={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      {t.forgot && <p className="text-center text-sm text-ink-muted">{t.forgot}</p>}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// First access: contract + PIN
// ---------------------------------------------------------------------------

function InvitePage() {
  useDocumentTitle('Revenda · Primeiro acesso');
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const t = useSection('revenda').invite;
  const textsReady = useSectionsReady();
  const [view, setView] = useState<InviteView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typedName, setTypedName] = useState('');
  const [agree, setAgree] = useState(false);
  const [signed, setSigned] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInvite(token).then(
      (v) => alive && setView(v),
      (e: unknown) => alive && setLoadError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !view) return;
    setError(null);
    const c = view.contract;
    if (c?.mode === 'aceite' && (!agree || typedName.trim().split(/\s+/).length < 2)) return setError('Digite seu nome completo e marque que leu e aceita o contrato.');
    if (c?.mode === 'link' && !signed) return setError('Assine o contrato no link e confirme.');
    if (!/^\d{6}$/.test(pin)) return setError('O PIN precisa ter 6 números.');
    if (pin !== pin2) return setError('Os dois PINs não são iguais.');
    setBusy(true);
    try {
      await acceptInvite(token, { pin, ...(c ? { contract: { version: c.version, ...(c.mode === 'aceite' ? { typedName } : { signedExternal: true as const }) } } : {}) });
      toast(t.welcome, { tone: 'success' });
      navigate('/revenda/painel', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!textsReady) return <Shell><p className="py-10 text-center text-ink-muted" aria-busy="true">Carregando…</p></Shell>;
  if (loadError) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 pt-8 text-center">
          <h1 className="font-display text-display-m">{t.goneTitle}</h1>
          <p className="max-w-sm text-ink-muted">{loadError}</p>
          <Button variant="secondary" onClick={() => navigate('/revenda')}>
            Já tenho PIN: entrar
          </Button>
        </div>
      </Shell>
    );
  }
  if (!view) return <Shell><p className="py-10 text-center text-ink-muted" aria-busy="true">Carregando…</p></Shell>;
  const c = view.contract;
  const greeting = fillString(t.greeting, { primeiro_nome: view.firstName });
  const intro = c ? t.text : t.textNoContract;

  return (
    <Shell>
      <div className="flex flex-col gap-1 pt-2 text-center">
        {greeting && <p className="eyebrow text-ink-muted">{greeting}</p>}
        <h1 className="font-display text-display-m">{t.title}</h1>
        {intro && <p className="text-ink-muted">{intro}</p>}
      </div>
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
        {c && (
          <ContractFields
            contract={c}
            heading={`1. ${c.title}`}
            name={view.name}
            typedName={typedName}
            onTypedName={setTypedName}
            agree={agree}
            onAgree={setAgree}
            signed={signed}
            onSigned={setSigned}
          />
        )}
        <section aria-labelledby="pin-title" className="flex flex-col gap-3 rounded-[14px] bg-white p-5 shadow-[var(--shadow-1)]">
          <h2 id="pin-title" className="font-display text-title">
            {c ? '2. ' : ''}Crie seu PIN
          </h2>
          <p className="text-sm text-ink-muted">6 números, fácil para você e difícil para os outros (evite 123456 ou a data de nascimento).</p>
          <TextField label="PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          <TextField label="Repita o PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </section>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" size="lg" block disabled={busy} aria-busy={busy}>
          {busy ? 'Salvando…' : c ? 'Aceitar e entrar' : 'Salvar PIN e entrar'}
        </Button>
        {/* New tab: leaving this page would lose what she typed (contract name, PIN). */}
        <p className="-mt-2 text-center text-xs text-ink-muted">
          Como a ÉKA cuida dos seus dados:{' '}
          <a href="/privacidade" target="_blank" rel="noopener" className="inline-flex min-h-6 items-center underline underline-offset-4 hover:text-copper">
            política de privacidade
          </a>
        </p>
      </form>
    </Shell>
  );
}

type ContractView = NonNullable<InviteView['contract']>;

/** The contract to accept: the text, typed name and "li e aceito" (mode aceite), or the external link (mode link). */
function ContractFields({
  contract: c,
  heading,
  name,
  typedName,
  onTypedName,
  agree,
  onAgree,
  signed,
  onSigned,
}: {
  contract: ContractView;
  heading: string;
  name: string;
  typedName: string;
  onTypedName: (v: string) => void;
  agree: boolean;
  onAgree: (v: boolean) => void;
  signed: boolean;
  onSigned: (v: boolean) => void;
}) {
  return (
    <section aria-labelledby="contract-title" className="flex flex-col gap-3 rounded-[14px] bg-white p-5 shadow-[var(--shadow-1)]">
      <h2 id="contract-title" className="font-display text-title">
        {heading}
      </h2>
      {c.mode === 'aceite' ? (
        <>
          <div tabIndex={0} aria-label="Texto do contrato" className="max-h-80 overflow-y-auto rounded-[10px] border border-line bg-ivory p-4 text-sm leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-copper">
            {c.text}
          </div>
          <TextField label="Seu nome completo" autoComplete="name" value={typedName} onChange={(e) => onTypedName(e.target.value)} hint={`Como no cadastro: ${name}`} />
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--color-copper)]" checked={agree} onChange={(e) => onAgree(e.target.checked)} />
            <span>Li e aceito o contrato (versão {c.version}).</span>
          </label>
        </>
      ) : (
        <>
          {c.url && (
            <ButtonAnchor href={c.url} target="_blank" rel="noopener noreferrer" variant="secondary" block>
              <ExternalLink size={18} strokeWidth={1.5} /> Abrir e assinar o contrato
            </ButtonAnchor>
          )}
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--color-copper)]" checked={signed} onChange={(e) => onSigned(e.target.checked)} />
            <span>Já assinei o contrato.</span>
          </label>
        </>
      )}
    </section>
  );
}

/** An updated contract from the panel: sales wait until she accepts it. */
function ContractUpdate({ me, onAccepted }: { me: Me; onAccepted: () => void }) {
  const t = useSection('revenda').contract;
  const c = me.contractDue;
  const [typedName, setTypedName] = useState('');
  const [agree, setAgree] = useState(false);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!c) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !c) return;
    setError(null);
    if (c.mode === 'aceite' && (!agree || typedName.trim().split(/\s+/).length < 2)) return setError('Digite seu nome completo e marque que leu e aceita o contrato.');
    if (c.mode === 'link' && !signed) return setError('Assine o contrato no link e confirme.');
    setBusy(true);
    try {
      await acceptContract({ version: c.version, ...(c.mode === 'aceite' ? { typedName } : { signedExternal: true as const }) });
      toast(t.accepted, { tone: 'success' });
      onAccepted();
    } catch (err) {
      setError(errorMessage(err));
      // A newer version may have been published meanwhile: show it.
      if (err instanceof ApiError && err.code === 'conflict') onAccepted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 rounded-[14px] border border-copper bg-champagne/40 p-4">
      <div>
        <p className="font-medium">{t.updateTitle}</p>
        {t.updateText && <p className="text-sm text-ink-muted">{t.updateText}</p>}
      </div>
      <ContractFields
        contract={c}
        heading={c.title}
        name={me.reseller.name}
        typedName={typedName}
        onTypedName={setTypedName}
        agree={agree}
        onAgree={setAgree}
        signed={signed}
        onSigned={setSigned}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button type="submit" block disabled={busy} aria-busy={busy}>
        {busy ? 'Salvando…' : 'Aceitar contrato'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function Thumb({ me, line }: { me: Me; line: { productId: string; variantId: string } }) {
  const image = me.images[`${line.productId}|${line.variantId}`];
  return image ? <Img {...productImageSources(image, true)} alt="" ratio="4 / 5" frameClassName="w-14 shrink-0 rounded-[8px]" width={56} height={70} /> : <span className="w-14 shrink-0" />;
}

function Summary({ me }: { me: Me }) {
  const section = useSection('revenda');
  const t = section.panel;
  const repasse = repasseTexts(section);
  const kit = me.kit;
  const c = me.commission;
  const days = kit ? daysLeft(kit.dueAt) : null;
  return (
    <section aria-label="Resumo" className="overflow-hidden rounded-[14px] bg-champagne/70 shadow-[var(--shadow-1)]">
      <div className="flex flex-col gap-1 px-5 pt-5">
        <p className="text-sm text-ink-muted">Vendido nesta maleta</p>
        <p className="font-display text-[2.4rem] leading-none">{formatBRL(me.soldCents)}</p>
      </div>
      {c && (
        <div className="flex flex-col gap-2 px-5 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm">
              Comissão <strong className="font-medium">{c.percent}%</strong>
            </span>
            <span className="price font-medium">{formatBRL(c.commissionCents)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Progresso até a próxima faixa de comissão" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.progress * 100)}>
            <div className="h-full rounded-full bg-copper transition-[width] duration-500" style={{ width: `${Math.round(c.progress * 100)}%` }} />
          </div>
          <p className="text-sm text-ink-muted">{c.next ? `Faltam ${formatBRL(c.next.missingCents)} para subir para ${c.next.percent}%.` : t.topTier}</p>
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-rose/30 pt-3">
            <span className="text-sm">Para a ÉKA no acerto</span>
            <span className="price font-medium">{formatBRL(Math.max(0, me.soldCents - c.commissionCents))}</span>
          </div>
          {repasse.cycleNote && <p className="text-sm text-ink-muted">{repasse.cycleNote}</p>}
        </div>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-px bg-rose/30">
        <div className="bg-champagne px-5 py-3">
          <dt className="text-xs text-ink-muted">Lucro acumulado</dt>
          <dd className="price font-medium">{formatBRL(me.earnings.totalCents)}</dd>
          <dd className="text-xs text-ink-muted">
            {formatBRL(me.earnings.receivedCents)} recebido + {formatBRL(me.earnings.projectedCents)} previsto
          </dd>
        </div>
        <div className="bg-champagne px-5 py-3">
          <dt className="text-xs text-ink-muted">Maleta</dt>
          <dd className="price font-medium">{kit ? formatBRL(kit.valueCents) : '—'}</dd>
          {days !== null && (
            <dd className={cx('flex items-center gap-1 text-xs', days <= 3 ? 'text-danger' : 'text-ink-muted')}>
              <CalendarClock size={13} strokeWidth={1.75} aria-hidden="true" />
              {days < 0 ? `Acerto atrasado ${-days} d` : days === 0 ? 'Acerto hoje' : `Acerto em ${days} ${days === 1 ? 'dia' : 'dias'}`}
            </dd>
          )}
        </div>
      </dl>
    </section>
  );
}

function KitList({ me }: { me: Me }) {
  const t = useSection('revenda').kit;
  if (!me.kit) return <p className="rounded-[12px] border border-dashed border-line px-4 py-8 text-center text-ink-muted">{t.empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-[14px] bg-white px-4 shadow-[var(--shadow-1)]">
      {me.kit.lines.map((l) => (
        <li key={lineKey(l)} className="flex items-center gap-3 py-3">
          <Thumb me={me} line={l} />
          <div className="min-w-0 flex-1">
            <p className="leading-snug">{l.name}</p>
            <p className="text-sm text-ink-muted">
              {FINISH_LABEL[l.finish]}
              {l.size && ` · ${sizeLabel(l.size)}`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="price">{formatBRL(l.unitCents)}</p>
            <p className={cx('text-sm', l.available ? 'text-ink-muted' : 'text-success')}>{l.available ? `${l.available} de ${l.qty}` : 'Tudo vendido'}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The message to her customer (summary + warranty), to her number when known. */
function SaleMessage({ sale, me }: { sale: ResellerSale; me: Me }) {
  const compose = useMessages();
  const settings = useCatalog((s) => s.data.settings);
  const months = settings.warrantyMonths;
  const text = compose(
    'venda_revendedora',
    {
      primeiro_nome: firstNameOf(sale.customer?.name),
      revendedora: me.reseller.firstName,
      total: formatBRL(sale.totalCents),
      garantia: months > 0 ? warrantyText(months) : '',
      garantia_ate: months > 0 ? warrantyUntil(sale.createdAt, months) : '',
      garantia_regras: settings.warrantyTerms ?? '',
    },
    { items: messageItems(sale.lines.map((l) => ({ name: l.name, finish: FINISH_LABEL[l.finish], ...(l.size ? { size: l.size } : {}), qty: l.qty, lineCents: l.qty * l.unitCents }))) },
  );
  const number = sale.customer?.whatsapp ? `55${sale.customer.whatsapp}` : null;
  return (
    <div className="flex flex-col gap-3">
      <pre className="max-h-64 overflow-auto rounded-[12px] border border-line bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</pre>
      <ButtonAnchor href={whatsappUrl(number, text)} block>
        <WhatsAppIcon size={19} /> {number ? 'Enviar para a cliente' : 'Enviar no WhatsApp'}
      </ButtonAnchor>
      <Button
        variant="secondary"
        block
        onClick={() =>
          void navigator.clipboard.writeText(text).then(
            () => toast('Mensagem copiada.', { tone: 'success' }),
            () => toast('Não foi possível copiar. Selecione o texto e copie.', { tone: 'error' }),
          )
        }
      >
        <Copy size={18} strokeWidth={1.5} /> Copiar
      </Button>
    </div>
  );
}

function SaleForm({ me, onDone }: { me: Me; onDone: (sale: ResellerSale) => void }) {
  const t = useSection('revenda');
  const lines = useMemo(() => (me.kit?.lines ?? []).filter((l) => l.available > 0), [me.kit]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [price, setPrice] = useState<Record<string, string>>({});
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('pix');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<{ body: string; key: string } | null>(null);
  const centsOf = (l: KitLineState) => {
    const raw = price[lineKey(l)];
    if (raw === undefined || raw.trim() === '') return l.unitCents;
    const v = parseBRL(raw); // "89,90", "89.90" and "1.089,90" all read right
    return v === null ? NaN : v;
  };
  const chosen = lines.filter((l) => (qty[lineKey(l)] ?? 0) > 0);
  const total = chosen.reduce((sum, l) => sum + (qty[lineKey(l)] ?? 0) * (centsOf(l) || 0), 0);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!chosen.length) return setError('Escolha pelo menos uma peça.');
    if (chosen.some((l) => Number.isNaN(centsOf(l)))) return setError('Confira o preço das peças.');
    if (phone && phone.replace(/\D/g, '').length < 10) return setError('WhatsApp da cliente com DDD, ou deixe em branco.');
    const sale = {
      lines: chosen.map((l) => ({ productId: l.productId, variantId: l.variantId, size: l.size, qty: qty[lineKey(l)]!, unitCents: centsOf(l) })),
      payment,
      ...(customer.trim() || phone ? { customer: { name: customer.trim(), whatsapp: phone } } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const body = JSON.stringify(sale);
    if (key.current?.body !== body) key.current = { body, key: idempotencyKey() };
    setBusy(true);
    try {
      const r = await registerSale(sale, key.current.key);
      onDone(r.sale);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!lines.length) return <p className="text-ink-muted">{t.kit.soldOut}</p>;
  return (
    <div className="flex flex-col gap-5">
      <ul className="divide-y divide-line border-y border-line" aria-label="Peças da maleta">
        {lines.map((l) => {
          const n = qty[lineKey(l)] ?? 0;
          return (
            <li key={lineKey(l)} className="flex flex-col gap-2 py-3">
              <div className="flex items-center gap-3">
                <Thumb me={me} line={l} />
                <div className="min-w-0 flex-1">
                  <p className="leading-snug">{l.name}</p>
                  <p className="text-sm text-ink-muted">
                    {FINISH_LABEL[l.finish]}
                    {l.size && ` · ${sizeLabel(l.size)}`} · {l.available} na maleta
                  </p>
                </div>
                <div role="group" aria-label={`Quantidade de ${l.name}`} className="inline-flex h-11 items-center rounded-full border border-line bg-white">
                  <button type="button" aria-label="Diminuir" className="inline-flex size-10 items-center justify-center rounded-full disabled:opacity-35" disabled={n <= 0} onClick={() => setQty((q) => ({ ...q, [lineKey(l)]: n - 1 }))}>
                    <Minus size={16} strokeWidth={1.5} />
                  </button>
                  <span className="price min-w-6 text-center">{n}</span>
                  <button type="button" aria-label="Aumentar" className="inline-flex size-10 items-center justify-center rounded-full disabled:opacity-35" disabled={n >= l.available} onClick={() => setQty((q) => ({ ...q, [lineKey(l)]: n + 1 }))}>
                    <Plus size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              {n > 0 && (
                <TextField
                  label="Preço de venda (cada)"
                  inputMode="decimal"
                  wrapperClassName="max-w-56"
                  value={price[lineKey(l)] ?? (l.unitCents / 100).toFixed(2).replace('.', ',')}
                  onChange={(e) => setPrice((p) => ({ ...p, [lineKey(l)]: e.target.value.replace(/[^\d,.]/g, '') }))}
                  hint={`Preço da maleta: ${formatBRL(l.unitCents)}`}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-baseline justify-between">
        <span>Total da venda</span>
        <span className="price font-display text-2xl">{formatBRL(total)}</span>
      </div>
      <div role="group" aria-label="Forma de pagamento" className="flex flex-wrap gap-2">
        {PAYMENT_METHODS.map((m) => (
          <Chip key={m} selected={payment === m} onClick={() => setPayment(m)}>
            {PAYMENT_LABEL[m]}
          </Chip>
        ))}
      </div>
      <TextField label="Nome da cliente" optional value={customer} maxLength={80} onChange={(e) => setCustomer(e.target.value)} />
      <TextField label="WhatsApp da cliente" optional inputMode="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} {...(t.sale.phoneHint ? { hint: t.sale.phoneHint } : {})} />
      <TextField label="Observação" optional value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      {error && <ErrorText>{error}</ErrorText>}
      <Button size="lg" block disabled={busy} aria-busy={busy} onClick={() => void submit()}>
        {busy ? 'Registrando…' : 'Registrar venda'}
      </Button>
    </div>
  );
}

function SalesList({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const t = useSection('revenda');
  const [busy, setBusy] = useState<string | null>(null);
  const [messageFor, setMessageFor] = useState<ResellerSale | null>(null);
  // "Desfazer" is offered for sales younger than 24 h (as of when the list was shown; the server decides).
  const [now] = useState(() => Date.now());
  if (!me.sales.length) return <p className="rounded-[12px] border border-dashed border-line px-4 py-8 text-center text-ink-muted">{t.history.salesEmpty}</p>;
  async function undo(sale: ResellerSale) {
    if (busy) return;
    setBusy(sale.id);
    try {
      await cancelSale(sale.id);
      toast(t.sale.undone, { tone: 'success' });
      onChanged();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <ul className="flex flex-col gap-2">
        {me.sales.map((s) => {
          const recent = now - Date.parse(s.createdAt) < 24 * 3600_000;
          return (
            <li key={s.id} className={cx('rounded-[12px] bg-white p-4 shadow-[var(--shadow-1)]', s.status === 'cancelada' && 'opacity-60')}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink-muted">{new Date(s.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="price font-medium">{formatBRL(s.totalCents)}</span>
              </div>
              <p className="mt-1 text-sm">{s.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</p>
              <p className="text-sm text-ink-muted">
                {PAYMENT_LABEL[s.payment]}
                {s.customer?.name && ` · ${s.customer.name}`}
                {s.status === 'cancelada' && ' · desfeita'}
              </p>
              {s.status === 'ativa' && (
                <div className="mt-2 flex flex-wrap gap-3">
                  <button type="button" className="min-h-9 text-sm text-copper underline underline-offset-4" onClick={() => setMessageFor(s)}>
                    Mensagem para a cliente
                  </button>
                  {recent && (
                    <button type="button" className="inline-flex min-h-9 items-center gap-1 text-sm text-ink-muted underline underline-offset-4" disabled={busy === s.id} onClick={() => void undo(s)}>
                      <Undo2 size={14} strokeWidth={1.75} /> Desfazer
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Sheet open={!!messageFor} onClose={() => setMessageFor(null)} title="Mensagem para a cliente" side="bottom" className="md-right">
        {messageFor && <SaleMessage sale={messageFor} me={me} />}
      </Sheet>
    </>
  );
}

type RevendaTexts = ReturnType<typeof useSection<'revenda'>>;
/** The repasse texts (an older saved section has none: withBuiltIn fills them, this is only for the types). */
function repasseTexts(section: RevendaTexts) {
  return (
    section.repasse ?? {
      cycleNote: '',
      title: 'Repasse do acerto',
      text: '',
      noPix: 'Combine com a ÉKA como fazer o repasse.',
      reported: 'Você avisou que pagou. Quando a ÉKA conferir, aparece aqui como recebido.',
      whatsapp: 'Oi! Aqui é {primeiro_nome}. Fiz o repasse de {total} do acerto da minha maleta. Segue o comprovante.',
    }
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** The repasse of a closed cycle, in one line (history). */
function RepasseLine({ settlement }: { settlement: NonNullable<Me['history'][number]['settlement']> }) {
  const state = repasseState(settlement);
  if (state === 'none') return <p className="text-ink-muted">Sem repasse neste acerto.</p>;
  return (
    <p className={cx(state === 'paid' ? 'text-ink-muted' : 'text-copper')}>
      Repasse <span className="price">{formatBRL(settlement.dueCents)}</span>
      {state === 'paid' ? ` · recebido em ${shortDate(settlement.paidAt!)}` : state === 'reported' ? ` · avisado em ${shortDate(settlement.reportedAt!)}` : ' · pendente'}
    </p>
  );
}

/**
 * A settled cycle whose repasse the store has not confirmed yet: the amount, the store's Pix with
 * that exact amount, "Já fiz o repasse" and the receipt through the store's WhatsApp.
 */
function RepasseCard({ me, entry, onChanged }: { me: Me; entry: Me['history'][number]; onChanged: () => void }) {
  const t = repasseTexts(useSection('revenda'));
  const biz = useBusiness();
  const [busy, setBusy] = useState(false);
  const settlement = entry.settlement!;
  const state = repasseState(settlement);
  const amount = formatBRL(settlement.dueCents);
  const code = useMemo(
    () => (me.pix ? buildPixPayload({ ...me.pix, amountCents: settlement.dueCents, txid: repassePixTxid(entry.id) }) : null),
    [me.pix, settlement.dueCents, entry.id],
  );
  const message = fillString(t.whatsapp, { primeiro_nome: me.reseller.firstName, total: amount });
  const titleId = `repasse-${entry.id}`;

  async function report() {
    if (busy) return;
    setBusy(true);
    try {
      await reportRepasse(entry.id);
      toast('Pronto! A ÉKA recebeu o seu aviso.', { tone: 'success' });
      onChanged();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-[14px] border border-copper/40 bg-white p-5 shadow-[var(--shadow-1)]">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-title">
          {t.title}
        </h2>
        <p className="font-display text-[2.2rem] leading-none">{amount}</p>
        <p className="text-sm text-ink-muted">
          Acerto de {shortDate(entry.closedAt ?? settlement.at)} · vendeu <span className="price">{formatBRL(settlement.soldCents)}</span>, comissão{' '}
          <span className="price">{formatBRL(settlement.commissionCents)}</span>
          {settlement.missingCents > 0 && (
            <>
              , peças que não voltaram <span className="price">{formatBRL(settlement.missingCents)}</span>
            </>
          )}
        </p>
      </div>

      {state === 'reported' ? (
        <p role="status" className="flex items-start gap-2 rounded-[10px] bg-champagne/60 p-3 text-sm">
          <Clock3 size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-copper" />
          <span>
            {t.reported} <span className="text-ink-muted">Avisado em {dateTime(settlement.reportedAt!)}.</span>
          </span>
        </p>
      ) : code && me.pix ? (
        <div className="flex flex-col gap-3">
          {t.text && <p className="text-sm">{t.text}</p>}
          <PixCopyField code={code} id={`pix-${entry.id}`} />
          <div className="flex flex-col items-center gap-2 border-t border-line pt-4">
            <QrCode value={code} label={`QR Code Pix de ${amount} para a ÉKA`} className="size-[168px] ring-1 ring-line" />
            <p className="text-center text-sm text-ink-muted">
              Recebedor: <span className="text-ink">{pixText(me.pix.name, 25)}</span>
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm">{t.noPix}</p>
      )}

      <div className="flex flex-col gap-2">
        {state === 'pending' && (
          <Button size="lg" block disabled={busy} aria-busy={busy} onClick={() => void report()}>
            <CheckCircle2 size={19} strokeWidth={1.5} /> {busy ? 'Enviando…' : 'Já fiz o repasse'}
          </Button>
        )}
        <ButtonAnchor href={whatsappUrl(biz.whatsapp, message)} variant={state === 'pending' ? 'secondary' : 'primary'} block>
          <WhatsAppIcon size={18} /> Enviar comprovante no WhatsApp
        </ButtonAnchor>
      </div>
    </section>
  );
}

function History({ me }: { me: Me }) {
  const t = useSection('revenda').history;
  if (!me.history.length) return <p className="rounded-[12px] border border-dashed border-line px-4 py-8 text-center text-ink-muted">{t.settlementsEmpty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {me.history.map((h) => (
        <li key={h.id} className="rounded-[12px] bg-white p-4 text-sm shadow-[var(--shadow-1)]">
          <p className="text-ink-muted">
            {new Date(h.openedAt).toLocaleDateString('pt-BR')} a {h.closedAt ? new Date(h.closedAt).toLocaleDateString('pt-BR') : '—'}
          </p>
          <p>
            Vendeu <span className="price">{formatBRL(h.settlement?.soldCents ?? 0)}</span> · comissão {h.settlement?.percent}%: <strong className="price font-medium">{formatBRL(h.settlement?.commissionCents ?? 0)}</strong>
          </p>
          {h.settlement && <RepasseLine settlement={h.settlement} />}
        </li>
      ))}
    </ul>
  );
}

type PanelTab = 'maleta' | 'vendas' | 'historico';

function PanelPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>('maleta');
  const [selling, setSelling] = useState(false);
  const [sold, setSold] = useState<ResellerSale | null>(null);
  const t = useSection('revenda');
  const textsReady = useSectionsReady();
  useDocumentTitle(me ? `Revenda · ${me.reseller.firstName}` : 'Revenda');

  const load = useCallback(() => {
    fetchMe().then(
      (data) => {
        setMe(data);
        setError(null);
        rememberPanelShowcase(data.reseller.slug);
      },
      (err: unknown) => {
        if (err instanceof ApiError && err.code === 'unauthenticated') {
          forgetPanelShowcase();
          navigate('/revenda', { replace: true });
        }
        else setError(errorMessage(err));
      },
    );
  }, [navigate]);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  async function exit() {
    await logout().catch(() => undefined);
    forgetPanelShowcase();
    navigate('/revenda', { replace: true });
  }

  if (!me || !textsReady) {
    return (
      <Shell>
        {error ? (
          <div className="flex flex-col items-center gap-3 pt-8 text-center">
            <ErrorText>{error}</ErrorText>
            <Button variant="secondary" onClick={load}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <p className="py-10 text-center text-ink-muted" aria-busy="true">
            Carregando seu painel…
          </p>
        )}
      </Shell>
    );
  }

  const showcase = `${window.location.origin}/r/${me.reseller.slug}`;
  const greeting = fillString(t.panel.greeting, { primeiro_nome: me.reseller.firstName });
  return (
    <Shell onLogout={() => void exit()}>
      <div>
        {greeting && <p className="eyebrow text-ink-muted">{greeting}</p>}
        <h1 className="font-display text-display-m">{t.panel.title}</h1>
      </div>
      <ContractUpdate key={me.contractDue?.version ?? 0} me={me} onAccepted={load} />
      {/* Settled cycles whose repasse the store has not confirmed, oldest first. */}
      {me.history
        .filter((h) => h.settlement && (repasseState(h.settlement) === 'pending' || repasseState(h.settlement) === 'reported'))
        .reverse()
        .map((h) => (
          <RepasseCard key={h.id} me={me} entry={h} onChanged={load} />
        ))}
      <Summary me={me} />
      {!me.contractDue && me.kit && me.kit.lines.some((l) => l.available > 0) && (
        <Button size="lg" block onClick={() => setSelling(true)}>
          <ShoppingBag size={19} strokeWidth={1.5} /> Registrar venda
        </Button>
      )}
      <div className="flex flex-col gap-2 rounded-[12px] border border-line bg-white p-4">
        <p className="text-sm font-medium">{t.panel.showcaseTitle}</p>
        {t.panel.showcaseText && <p className="text-sm text-ink-muted">{t.panel.showcaseText}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void navigator.clipboard.writeText(showcase).then(
                () => toast('Link copiado.', { tone: 'success' }),
                () => toast('Não foi possível copiar.', { tone: 'error' }),
              )
            }
          >
            <Copy size={16} strokeWidth={1.5} /> Copiar link
          </Button>
          {/* Same tab: the showcase has "Voltar ao meu painel" (and the browser's back works too). */}
          <ButtonLink size="sm" variant="ghost" to={`/r/${me.reseller.slug}`} state={{ fromPanel: true }}>
            <Eye size={16} strokeWidth={1.5} /> Ver mostruário
          </ButtonLink>
        </div>
      </div>
      <div role="group" aria-label="Seções" className="flex gap-2">
        <Chip selected={tab === 'maleta'} onClick={() => setTab('maleta')}>
          Maleta
        </Chip>
        <Chip selected={tab === 'vendas'} onClick={() => setTab('vendas')}>
          Vendas <span className="price text-xs">{me.sales.filter((s) => s.status === 'ativa').length}</span>
        </Chip>
        <Chip selected={tab === 'historico'} onClick={() => setTab('historico')}>
          Acertos
        </Chip>
      </div>
      {tab === 'maleta' && <KitList me={me} />}
      {tab === 'vendas' && <SalesList me={me} onChanged={load} />}
      {tab === 'historico' && <History me={me} />}
      <div className="flex justify-center">
        <InstallAppButton app="reseller" intro={t.panel.installText} />
      </div>

      <Sheet open={selling} onClose={() => setSelling(false)} title="Registrar venda" side="right">
        {selling && (
          <SaleForm
            me={me}
            onDone={(sale) => {
              setSelling(false);
              setSold(sale);
              setTab('vendas');
              toast(t.sale.registered, { tone: 'success' });
              load();
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!sold} onClose={() => setSold(null)} title="Mensagem para a cliente" side="bottom" className="md-right">
        {sold && (
          <div className="flex flex-col gap-3">
            {t.sale.done && <p className="text-sm text-ink-muted">{t.sale.done}</p>}
            <SaleMessage sale={sold} me={me} />
          </div>
        )}
      </Sheet>
    </Shell>
  );
}

export default function RevendaApp() {
  useEffect(() => applyAppHead('reseller'), []);
  return (
    <Routes>
      <Route index element={<LoginGate />} />
      <Route path="convite/:token" element={<InvitePage />} />
      <Route path="painel" element={<PanelPage />} />
      <Route path="*" element={<Navigate to="/revenda" replace />} />
    </Routes>
  );
}

/** /revenda: straight to the panel when the session is still valid, otherwise the login. */
function LoginGate() {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  useEffect(() => {
    let alive = true;
    fetchMe().then(
      () => alive && setState('in'),
      () => alive && setState('out'),
    );
    return () => {
      alive = false;
    };
  }, []);
  const textsReady = useSectionsReady();
  if (state === 'checking') return <div className="min-h-dvh bg-ivory" aria-busy="true" />;
  if (state === 'in') return <Navigate to="/revenda/painel" replace />;
  if (!textsReady) return <div className="min-h-dvh bg-ivory" aria-busy="true" />;
  return <LoginPage />;
}
