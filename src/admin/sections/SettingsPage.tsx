import { useState, type FormEvent } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TextArea, TextField } from '../../components/ui/Field';
import { cx } from '../../components/ui/cx';
import { business, pendingChecklist } from '../../config/business';
import type { Settings } from '../../data/schema';
import { ApiError, errorMessage } from '../../lib/api';
import { PIN_MAX, PIN_MIN, pinProblem } from '../../lib/pin';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { useAdminSession } from '../AdminContext';
import { maskPhone, parseInstagram, parsePhone } from '../lib/contact';
import { save } from '../lib/persist';
import { changePin, signalSessionLost } from '../lib/session';

/** Checklist items completed by a settings field; the others stay open. */
// Instagram and warranty start with unconfirmed values from business.ts, so they only
// count as done once they differ from those starting values.
const DONE_WHEN: Partial<Record<string, (s: Settings) => boolean>> = {
  whatsapp: (s) => !!s.whatsapp,
  instagram: (s) => !!s.instagram && s.instagram !== business.instagram,
  city: (s) => !!s.city.trim(),
  showroom: (s) => !!s.showroom?.trim(),
  warrantyMonths: (s) => s.warrantyMonths > 0 && s.warrantyMonths !== business.warrantyMonths,
};

interface StoreForm {
  announcement: string;
  whatsapp: string;
  instagram: string;
  city: string;
  showroom: string;
  openingHours: string;
  warrantyMonths: string;
}

type StoreErrors = Partial<Record<keyof StoreForm, string>>;

const toForm = (s: Settings): StoreForm => ({
  announcement: s.announcement,
  whatsapp: maskPhone(s.whatsapp),
  instagram: s.instagram,
  city: s.city,
  showroom: s.showroom ?? '',
  openingHours: s.openingHours ?? '',
  warrantyMonths: String(s.warrantyMonths),
});

/** Validates the store form; returns the settings patch or the errors. */
export function parseStoreForm(form: StoreForm): { ok: true; patch: Settings } | { ok: false; errors: StoreErrors } {
  const errors: StoreErrors = {};
  const whatsapp = parsePhone(form.whatsapp);
  if (whatsapp == null) errors.whatsapp = 'Informe DDD + número, por exemplo (67) 99999-9999.';
  const instagram = parseInstagram(form.instagram);
  if (!/^[A-Za-z0-9._]{0,30}$/.test(instagram)) errors.instagram = 'Use só o nome do perfil: letras, números, ponto e sublinhado.';
  const warranty = form.warrantyMonths.trim() === '' ? 0 : Number(form.warrantyMonths);
  if (!Number.isInteger(warranty) || warranty < 0 || warranty > 60) errors.warrantyMonths = 'Informe um número de meses entre 0 e 60.';
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
    },
  };
}

function StoreSettings() {
  const settings = useCatalog((s) => s.data.settings);
  const [form, setForm] = useState(() => toForm(settings));
  const [errors, setErrors] = useState<StoreErrors>({});
  const [busy, setBusy] = useState(false);
  const field = (key: keyof StoreForm) => ({
    value: form[key],
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
    const ok = await save((d) => ({ ...d, settings: result.patch }), 'Informações da loja salvas.');
    setBusy(false);
    if (ok) setForm(toForm(result.patch));
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-[12px] border border-line bg-white p-4">
      <h2 className="font-display text-title">Informações da loja</h2>
      <TextField label="Aviso no topo do site" maxLength={140} hint={`${form.announcement.length}/140 caracteres`} {...field('announcement')} />
      <TextField
        label="WhatsApp que recebe os pedidos"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(67) 99999-9999"
        {...field('whatsapp')}
        onChange={(e) => setForm((f) => ({ ...f, whatsapp: maskPhone(e.target.value) }))}
      />
      <TextField
        label="Instagram"
        placeholder="nomedaloja"
        autoCapitalize="none"
        spellCheck={false}
        hint="Pode colar o link do perfil; guardamos só o nome."
        icon={<span className="text-sm">@</span>}
        {...field('instagram')}
        onBlur={() => setForm((f) => ({ ...f, instagram: parseInstagram(f.instagram) }))}
      />
      <TextField label="Cidade/UF" placeholder="Ex.: Campo Grande/MS" maxLength={80} {...field('city')} />
      <TextArea label="Showroom ou loja física" optional rows={2} maxLength={200} placeholder="Endereço" {...field('showroom')} />
      <TextField label="Horário de atendimento" optional maxLength={120} placeholder="Ex.: seg. a sex., 9h às 18h" {...field('openingHours')} />
      <TextField label="Garantia (meses)" inputMode="numeric" maxLength={2} hint="Use 0 para não mostrar garantia no site." {...field('warrantyMonths')} />
      <Button type="submit" className="self-start" disabled={busy} aria-busy={busy}>
        {busy ? 'Salvando…' : 'Salvar informações'}
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
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-[12px] border border-line bg-white p-4">
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
      <Button type="submit" variant="secondary" className="self-start" disabled={busy} aria-busy={busy}>
        {busy ? 'Alterando…' : 'Alterar PIN'}
      </Button>
    </form>
  );
}

function StoreChecklist() {
  const settings = useCatalog((s) => s.data.settings);
  const items = pendingChecklist.map((item) => ({ ...item, done: DONE_WHEN[item.key]?.(settings) ?? false }));
  const done = items.filter((i) => i.done).length;
  return (
    <section aria-labelledby="checklist-title" className="rounded-[12px] border border-line bg-champagne/50 p-4">
      <h2 id="checklist-title" className="font-display text-title">
        Complete as informações da loja
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {done} de {items.length} concluídos. Os itens ligados aos campos abaixo são marcados quando você os preenche.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
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
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <StoreChecklist />
      <StoreSettings />
      <PinSettings />
    </div>
  );
}
