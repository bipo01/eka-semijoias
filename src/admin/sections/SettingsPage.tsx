import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Circle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TextArea, TextField } from '../../components/ui/Field';
import { cx } from '../../components/ui/cx';
import { business, pendingChecklist } from '../../config/business';
import type { SiteContent } from '../../data/content';
import type { Settings } from '../../data/schema';
import { DEFAULT_LOW_STOCK } from '../../data/stock';
import { formatPixKey, normalizePixKey, pixKeyKind, pixText, type PixKeyKind } from '../../lib/pix';
import { ApiError, errorMessage } from '../../lib/api';
import { INSTAGRAM_ERROR, INSTAGRAM_HINT, isInstagramHandle } from '../../lib/instagram';
import { PIN_MAX, PIN_MIN, pinProblem } from '../../lib/pin';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { useAdminSession } from '../AdminContext';
import { maskPhone, parseInstagram, parsePhone } from '../lib/contact';
import { adminPath } from '../lib/paths';
import { Tabs } from '../ui';
import { save } from '../lib/persist';
import { LojaSettings } from './LojaSettings';
import { PixKeyField } from './PixKeyField';
import { PushSettings } from './PushSettings';
import { changePin, signalSessionLost } from '../lib/session';
import { countInput } from '../../lib/countInput';

/** Checklist items completed by a settings field or a site section; the others stay open. */
// Instagram and warranty start with unconfirmed values from business.ts, so they only
// count as done once they differ from those starting values. The store facts start from
// business.ts too, so they count only once she answered them ("O que a loja oferece" saved).
export const DONE_WHEN: Partial<Record<string, (s: Settings, content: SiteContent | undefined) => boolean>> = {
  whatsapp: (s) => !!s.whatsapp,
  instagram: (s) => !!s.instagram && s.instagram !== business.instagram,
  city: (s) => !!s.city.trim(),
  showroom: (s) => !!s.showroom?.trim(),
  warrantyMonths: (s) => s.warrantyMonths > 0 && s.warrantyMonths !== business.warrantyMonths,
  pix: (s) => !!s.pix,
  shipping: (_s, c) => c?.loja != null && c.loja.shipsNationwide !== null,
  plating: (_s, c) => !!c?.loja?.plating.trim(),
  hypoallergenic: (_s, c) => c?.loja != null && c.loja.hypoallergenic !== null,
  reseller: (_s, c) => c?.loja != null && c.loja.consignment !== null && c.loja.noUpfrontInvestment !== null,
  about: (_s, c) => c?.sobre !== undefined,
  testimonials: (_s, c) => !!c?.depoimentos?.items.length,
};

interface StoreForm {
  announcement: string;
  whatsapp: string;
  instagram: string;
  city: string;
  showroom: string;
  openingHours: string;
  warrantyMonths: string;
  /** What the warranty covers (optional in the type: absent means empty). */
  warrantyTerms?: string;
}

export const WARRANTY_TERMS_MAX = 600;

type StoreErrors = Partial<Record<keyof StoreForm, string>>;

const toForm = (s: Settings): StoreForm => ({
  announcement: s.announcement,
  whatsapp: maskPhone(s.whatsapp),
  instagram: s.instagram,
  city: s.city,
  showroom: s.showroom ?? '',
  openingHours: s.openingHours ?? '',
  warrantyMonths: String(s.warrantyMonths),
  warrantyTerms: s.warrantyTerms ?? '',
});

/** Validates the store form; returns the settings patch or the errors. */
export function parseStoreForm(form: StoreForm): { ok: true; patch: Settings } | { ok: false; errors: StoreErrors } {
  const errors: StoreErrors = {};
  const whatsapp = parsePhone(form.whatsapp);
  if (whatsapp == null) errors.whatsapp = 'Informe DDD + número, por exemplo (65) 99999-9999.';
  const instagram = parseInstagram(form.instagram);
  if (!isInstagramHandle(instagram)) errors.instagram = INSTAGRAM_ERROR;
  const warranty = form.warrantyMonths.trim() === '' ? 0 : Number(form.warrantyMonths);
  if (!Number.isInteger(warranty) || warranty < 0 || warranty > 60) errors.warrantyMonths = 'Informe um número de meses entre 0 e 60.';
  const warrantyTerms = (form.warrantyTerms ?? '').trim();
  if (warrantyTerms.length > WARRANTY_TERMS_MAX) errors.warrantyTerms = `Use até ${WARRANTY_TERMS_MAX} caracteres.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  const showroom = form.showroom.trim();
  const openingHours = form.openingHours.trim();
  return {
    ok: true,
    patch: {
      announcement: form.announcement.trim(),
      whatsapp: whatsapp!,
      instagram,
      city: form.city.trim(),
      ...(showroom ? { showroom } : {}),
      ...(openingHours ? { openingHours } : {}),
      warrantyMonths: warranty,
      ...(warrantyTerms ? { warrantyTerms } : {}),
    },
  };
}

function StoreSettings() {
  const settings = useCatalog((s) => s.data.settings);
  const [form, setForm] = useState(() => toForm(settings));
  const [errors, setErrors] = useState<StoreErrors>({});
  const [busy, setBusy] = useState(false);
  const field = (key: keyof StoreForm) => ({
    value: form[key] ?? '',
    error: errors[key],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const result = parseStoreForm(form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setBusy(true);
    // Keep the settings edited elsewhere on this page (Pix, stock).
    const ok = await save(
      (d) => ({
        ...d,
        settings: {
          ...result.patch,
          ...(d.settings.pix ? { pix: d.settings.pix } : {}),
          ...(d.settings.lowStockThreshold !== undefined ? { lowStockThreshold: d.settings.lowStockThreshold } : {}),
          ...(d.settings.messages ? { messages: d.settings.messages } : {}),
        },
      }),
      'Informações da loja salvas.',
    );
    setBusy(false);
    if (ok) setForm(toForm(result.patch));
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
      <h2 className="font-display text-title">Informações da loja</h2>
      <TextField label="Aviso no topo do site" maxLength={140} hint={`${form.announcement.length}/140 caracteres`} {...field('announcement')} />
      <TextField
        label="WhatsApp que recebe os pedidos"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(65) 99999-9999"
        {...field('whatsapp')}
        onChange={(e) => setForm((f) => ({ ...f, whatsapp: maskPhone(e.target.value) }))}
      />
      <TextField
        label="Instagram"
        placeholder="nomedaloja"
        autoCapitalize="none"
        spellCheck={false}
        hint={INSTAGRAM_HINT}
        icon={<span className="text-sm">@</span>}
        {...field('instagram')}
        onBlur={() => setForm((f) => ({ ...f, instagram: parseInstagram(f.instagram) }))}
      />
      <TextField label="Cidade/UF" placeholder="Ex.: Cuiabá/MT" maxLength={80} {...field('city')} />
      <TextArea label="Showroom ou loja física" optional rows={2} maxLength={200} placeholder="Endereço" {...field('showroom')} />
      <TextField label="Horário de atendimento" optional maxLength={120} placeholder="Ex.: seg. a sex., 9h às 18h" {...field('openingHours')} />
      <TextField label="Garantia (meses)" inputMode="numeric" maxLength={2} hint="Use 0 para não mostrar garantia no site." {...field('warrantyMonths')} />
      <TextArea
        label="Regras da garantia"
        optional
        rows={4}
        maxLength={WARRANTY_TERMS_MAX}
        placeholder="Ex.: cobre defeitos no banho com uso normal. Não cobre peças amassadas, quebradas ou com pedras perdidas."
        hint={`O que a garantia cobre e como funciona a troca. Aparece na página Garantia e na mensagem “Compra registrada”. ${(form.warrantyTerms ?? '').length}/${WARRANTY_TERMS_MAX}`}
        {...field('warrantyTerms')}
      />
      <Button type="submit" className="self-start" disabled={busy} aria-busy={busy}>
        {busy ? 'Salvando…' : 'Salvar informações'}
      </Button>
    </form>
  );
}

/** Validates the Pix form; returns the settings value or the errors. */
export function parsePixForm(form: { kind: PixKeyKind; key: string; name: string; city: string }):
  | { ok: true; pix: NonNullable<Settings['pix']> }
  | { ok: false; errors: Partial<Record<'key' | 'name' | 'city', string>> } {
  const errors: Partial<Record<'key' | 'name' | 'city', string>> = {};
  const key = normalizePixKey(form.kind, form.key);
  if (!key.ok) errors.key = key.error;
  const name = pixText(form.name, 25);
  if (name.length < 2) errors.name = 'Informe o nome como aparece no banco.';
  const city = pixText(form.city, 15);
  if (city.length < 2) errors.city = 'Informe a cidade da conta.';
  if (!key.ok || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, pix: { key: key.key, name, city } };
}

function PixSettings() {
  const pix = useCatalog((s) => s.data.settings.pix);
  const [form, setForm] = useState(() => ({
    kind: pix ? pixKeyKind(pix.key) : ('cpf' as PixKeyKind),
    key: pix ? formatPixKey(pix.key) : '',
    name: pix?.name ?? '',
    city: pix?.city ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<'key' | 'name' | 'city', string>>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const result = parsePixForm(form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setBusy(true);
    const ok = await save((d) => ({ ...d, settings: { ...d.settings, pix: result.pix } }), 'Pix salvo. Ele vai nos links de pagamento que você gera em “Cobrar por Pix”.');
    setBusy(false);
    if (ok) setForm((f) => ({ ...f, key: formatPixKey(result.pix.key), name: result.pix.name, city: result.pix.city }));
  }

  async function removePix() {
    if (busy) return;
    setBusy(true);
    const ok = await save(
      (d) => {
        const { pix: _pix, ...rest } = d.settings;
        return { ...d, settings: rest };
      },
      'Pix removido do site.',
    );
    setBusy(false);
    if (ok) setForm({ kind: 'cpf', key: '', name: '', city: '' });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
      <div>
        <h2 className="font-display text-title">Pix para receber os pedidos</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Usado nos links de pagamento: no pedido, toque em “Cobrar por Pix” e envie a mensagem pronta para a cliente. Ela paga com o QR Code ou o Pix Copia e Cola e envia o comprovante pelo link.
        </p>
      </div>
      <PixKeyField
        kind={form.kind}
        value={form.key}
        error={errors.key}
        onChange={(kind, key) => {
          setForm((f) => ({ ...f, kind, key }));
          setErrors((er) => ({ ...er, key: undefined }));
        }}
      />
      <TextField label="Nome do recebedor" hint="Como aparece no banco. Vai sem acento no Pix (até 25 letras)." maxLength={60} value={form.name} error={errors.name} onChange={set('name')} />
      <TextField label="Cidade da conta" hint="Até 15 letras, sem acento." maxLength={40} value={form.city} error={errors.city} onChange={set('city')} />
      {pix && (
        <p className="rounded-[10px] bg-champagne px-3 py-2 text-sm">
          No site agora: <span className="font-medium">{formatPixKey(pix.key)}</span> · {pix.name} · {pix.city}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? 'Salvando…' : 'Salvar Pix'}
        </Button>
        {pix && (
          <Button variant="ghost" disabled={busy} onClick={() => void removePix()}>
            Tirar Pix do site
          </Button>
        )}
      </div>
    </form>
  );
}

function StockSettings() {
  const threshold = useCatalog((s) => s.data.settings.lowStockThreshold ?? DEFAULT_LOW_STOCK);
  const [value, setValue] = useState(String(threshold));
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = value.trim() === '' ? NaN : Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 20) return setError('Use um número de 0 a 20.');
    setError(undefined);
    setBusy(true);
    await save((d) => ({ ...d, settings: { ...d.settings, lowStockThreshold: n } }), 'Aviso de últimas unidades salvo.');
    setBusy(false);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
      <h2 className="font-display text-title">Estoque</h2>
      <TextField
        label="Mostrar “Últimas unidades” quando restarem até"
        inputMode="numeric"
        maxLength={2}
        value={value}
        error={error}
        hint="Unidades. Vale para peças com controle de estoque; use 0 para nunca mostrar."
        wrapperClassName="max-w-xs"
        onChange={(e) => setValue(countInput(e.target.value, { maxDigits: 2 }))}
      />
      <Button type="submit" className="self-start" disabled={busy} aria-busy={busy}>
        {busy ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  );
}

function PinSettings() {
  const { pinChanged } = useAdminSession();
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; pin?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (!/^\d+$/.test(current)) next.current = 'Digite o PIN que você usa hoje.';
    const problem = pinProblem(pin);
    if (problem) next.pin = problem;
    else if (pin !== confirm) next.confirm = 'Os PINs não são iguais.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const result = await changePin(current, pin);
      pinChanged(result.pinLength);
      setCurrent('');
      setPin('');
      setConfirm('');
      toast('PIN alterado. Os outros aparelhos conectados ao painel precisarão do novo PIN.', { tone: 'success' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
      else if (error instanceof ApiError && error.code === 'invalid_pin') setErrors({ current: error.message });
      else if (error instanceof ApiError && error.status === 400) setErrors({ pin: error.message });
      else toast(errorMessage(error), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, PIN_MAX);
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
      <h2 className="font-display text-title">Alterar PIN</h2>
      <TextField
        label="PIN atual"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(digitsOnly(e.target.value))}
        error={errors.current}
      />
      <TextField
        label="Novo PIN"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        hint={`De ${PIN_MIN} a ${PIN_MAX} números, sem sequências como 123456.`}
        value={pin}
        onChange={(e) => setPin(digitsOnly(e.target.value))}
        error={errors.pin}
      />
      <TextField
        label="Repita o novo PIN"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(digitsOnly(e.target.value))}
        error={errors.confirm}
      />
      <Button type="submit" className="self-start" disabled={busy} aria-busy={busy}>
        {busy ? 'Alterando…' : 'Alterar PIN'}
      </Button>
    </form>
  );
}

/** Checklist items filled in on the Site tab: a link opens that editor. */
const EDITED_IN_SITE: Partial<Record<string, string>> = { about: 'sobre', testimonials: 'depoimentos' };
/** Checklist items filled in another tab of Configurações (the rest are on the Loja tab itself). */
const EDITED_IN_TAB: Partial<Record<string, Exclude<SettingsTab, 'loja'>>> = {
  pix: 'pix',
  shipping: 'oferta',
  payment: 'oferta',
  plating: 'oferta',
  hypoallergenic: 'oferta',
  reseller: 'oferta',
};

function StoreChecklist() {
  const settings = useCatalog((s) => s.data.settings);
  const content = useCatalog((s) => s.data.content);
  const items = pendingChecklist.map((item) => ({ ...item, done: DONE_WHEN[item.key]?.(settings, content) ?? false }));
  const done = items.filter((i) => i.done).length;
  return (
    <section aria-labelledby="checklist-title" className="rounded-2xl border border-line bg-white p-4 shadow-[0_2px_8px_rgb(48_33_28/0.04)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="checklist-title" className="font-display text-title">
          Complete as informações da loja
        </h2>
        <span className="price shrink-0 text-sm text-ink-muted">
          {done} de {items.length}
        </span>
      </div>
      <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efe4dc]">
        <div className="h-full rounded-full bg-gradient-to-r from-rose to-copper" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <details className="group mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-copper [&::-webkit-details-marker]:hidden">
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" className="transition-transform group-open:rotate-90" /> Ver o que falta
        </summary>
      <ul className="mt-1 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2.5 text-sm">
            {item.done ? (
              <CheckCircle2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Circle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            )}
            <span className={cx(item.done && 'text-ink-muted')}>
              <span className="sr-only">{item.done ? 'Feito: ' : 'A fazer: '}</span>
              {item.label}
              {!item.done && EDITED_IN_TAB[item.key] && (
                <>
                  {' · '}
                  <Link to={settingsTabPath(EDITED_IN_TAB[item.key]!)} className="text-copper underline underline-offset-4">
                    Preencher em {SETTINGS_TABS.find((t) => t.id === EDITED_IN_TAB[item.key])!.label}
                  </Link>
                </>
              )}
              {!item.done && EDITED_IN_SITE[item.key] && (
                <>
                  {' · '}
                  <Link to={`${adminPath('site')}?secao=${EDITED_IN_SITE[item.key]}`} className="text-copper underline underline-offset-4">
                    Preencher na aba Site
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      </details>
    </section>
  );
}

/** The tabs of Configurações (`?aba=`): one subject each, so nothing has to be searched for. */
export const SETTINGS_TABS = [
  { id: 'loja', label: 'Loja' },
  { id: 'oferta', label: 'O que oferecemos' },
  { id: 'pix', label: 'Pix' },
  { id: 'avisos', label: 'Avisos no celular' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'pin', label: 'PIN' },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

/** Link to a tab of Configurações. */
export const settingsTabPath = (tab: SettingsTab) => (tab === 'loja' ? adminPath('configuracoes') : `${adminPath('configuracoes')}?aba=${tab}`);

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('aba');
  const tab: SettingsTab = SETTINGS_TABS.some((t) => t.id === asked) ? (asked as SettingsTab) : 'loja';
  const go = (next: SettingsTab) =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        if (next === 'loja') out.delete('aba');
        else out.set('aba', next);
        return out;
      },
      { replace: true },
    );
  return (
    <div className="flex flex-col gap-4">
      <Tabs label="Assunto" value={tab} onChange={go} items={SETTINGS_TABS.map((t) => ({ id: t.id, label: t.label }))} />
      {tab === 'loja' && (
        <>
          <StoreChecklist />
          <StoreSettings />
        </>
      )}
      {tab === 'oferta' && <LojaSettings />}
      {tab === 'pix' && <PixSettings />}
      {tab === 'avisos' && <PushSettings />}
      {tab === 'estoque' && <StockSettings />}
      {tab === 'pin' && <PinSettings />}
    </div>
  );
}
