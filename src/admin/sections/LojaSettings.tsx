import { useMemo, useState, type FormEvent } from 'react';
import { SelectField, TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { defaultLoja } from '../../content/defaults';
import { jsonEqual } from '../../data/changes';
import type { Sections } from '../../data/content';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { save } from '../lib/persist';
import { overLimit, putSection, validateSection } from './site/sectionDraft';

/*
 * Configurações → "O que a loja oferece": the business facts the site may
 * claim (content section "loja"). Saved apart from "Informações da loja",
 * which rebuilds the settings from its own fields.
 */

type Loja = Sections['loja'];
type Fact = 'hypoallergenic' | 'shipsNationwide' | 'consignment' | 'noUpfrontInvestment';

export const FACTS: { key: Fact; label: string; where: string }[] = [
  { key: 'hypoallergenic', label: 'Peças antialérgicas', where: 'Com “Sim”, o site mostra “Peças antialérgicas” nos destaques da página inicial.' },
  { key: 'shipsNationwide', label: 'Envio para todo o Brasil', where: 'Com “Sim”, aparece nos destaques da página inicial, nas perguntas frequentes e na página de revendedoras.' },
  { key: 'consignment', label: 'Revenda em consignado', where: 'Com “Sim”, a página Seja revendedora explica que as peças vão em consignado e ela acerta só o que vender.' },
  { key: 'noUpfrontInvestment', label: 'Sem investimento inicial para revender', where: 'Com “Sim”, a página Seja revendedora mostra “Sem investimento inicial”.' },
];

const CHOICES: { value: boolean | null; label: string }[] = [
  { value: true, label: 'Sim' },
  { value: false, label: 'Não' },
  { value: null, label: 'Não informar' },
];

/** Installment options: none, then 2x … 12x (plus a stored value outside that range). */
export function installmentOptions(current: number): number[] {
  const base = [0, ...Array.from({ length: 11 }, (_, i) => i + 2)];
  return base.includes(current) ? base : [...base, current].sort((a, b) => a - b);
}

/** The facts without the save stamp, for comparing. */
const facts = ({ updatedAt: _at, ...rest }: Loja): Omit<Loja, 'updatedAt'> => rest;

function TriState({ name, label, where, value, onChange }: { name: string; label: string; where: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <fieldset id={`oferta-${name.replace(/^loja-/, '')}`} className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <label
            key={String(c.value)}
            className={cx(
              'relative inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors duration-[160ms]',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-copper',
              value === c.value ? 'border-copper bg-copper text-white' : 'border-line bg-white text-ink hover:border-copper',
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={value === c.value} onChange={() => onChange(c.value)} />
            {c.label}
          </label>
        ))}
      </div>
      <p className="text-sm text-ink-muted">{where} Com “Não” ou “Não informar”, o site não afirma isso.</p>
    </fieldset>
  );
}

export function LojaSettings() {
  const stored = useCatalog((s) => s.data.content?.loja);
  const current = useMemo(() => stored ?? defaultLoja(), [stored]);
  const [form, setForm] = useState<Loja>(current);
  const [base, setBase] = useState<Loja>(current);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const dirty = !jsonEqual(facts(form), facts(base));

  // Saved on another device while nothing was changed here: show it (state adjusted during render).
  if (!dirty && !busy && !jsonEqual(current, base)) {
    setBase(current);
    setForm(current);
  }

  const set = <K extends keyof Loja>(key: K, value: Loja[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !dirty) return;
    const result = validateSection('loja', form);
    if (!result.ok) return setError(Object.values(result.errors)[0]);
    // Saved on another device while this form had changes: never overwrite it silently.
    if (!jsonEqual(current, base)) {
      setBase(current);
      setForm(current);
      toast('Outro aparelho salvou estas respostas agora há pouco. Mostramos a versão atual: confira e salve de novo se quiser mudar.', { tone: 'error', duration: 9000 });
      return;
    }
    setError(undefined);
    setBusy(true);
    const ok = await save((d) => putSection(d, 'loja', result.data), 'Pronto: o site já mostra o que a loja oferece.');
    setBusy(false);
    if (!ok) return;
    const saved = useCatalog.getState().data.content?.loja ?? result.data;
    setBase(saved);
    setForm(saved);
  }

  const platingError = error ?? overLimit(form.plating, 120);
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
      <div>
        <h2 className="font-display text-title">O que a loja oferece</h2>
        <p className="mt-1 text-sm text-ink-muted">
          O site só afirma o que você confirmar aqui. Os textos que você já editou na aba Site não mudam sozinhos: confira se eles combinam com estas respostas.
        </p>
      </div>
      {!stored && (
        <p role="note" className="rounded-[10px] bg-champagne px-3 py-2 text-sm">
          Você ainda não confirmou estas respostas. Hoje o site segue as que estão marcadas abaixo: confira cada uma e salve.
        </p>
      )}
      {FACTS.map((f) => (
        <TriState key={f.key} name={`loja-${f.key}`} label={f.label} where={f.where} value={form[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
      <SelectField
        id="oferta-installments"
        label="Parcelamento sem juros"
        value={String(form.installments)}
        hint="Aparece nos destaques da página inicial, por exemplo “Parcelamento em até 3x”."
        onChange={(e) => set('installments', Number(e.target.value))}
      >
        {installmentOptions(form.installments).map((n) => (
          <option key={n} value={n}>
            {n === 0 ? 'Não mostrar' : `${n}x sem juros`}
          </option>
        ))}
      </SelectField>
      <TextField
        id="oferta-plating"
        label="Banho das peças"
        optional
        placeholder="Ex.: banho de ouro 18k"
        value={form.plating}
        error={platingError}
        hint={`Com o banho preenchido, a página inicial fala do banho de qualidade das peças. Vazio, o site não fala do banho. ${form.plating.trim().length}/120`}
        onChange={(e) => {
          setError(undefined);
          set('plating', e.target.value);
        }}
      />
      <Button type="submit" className="self-start" disabled={busy || !dirty} aria-busy={busy}>
        {busy ? 'Salvando…' : 'Salvar o que a loja oferece'}
      </Button>
    </form>
  );
}
