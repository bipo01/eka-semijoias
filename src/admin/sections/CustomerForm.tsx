import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { TextArea, TextField } from '../../components/ui/Field';
import { phoneDigits, type CustomerInput } from '../../data/customers';
import { idempotencyKey } from '../../lib/api';
import { toast } from '../../store/ui';
import { maskPhone, parseInstagram } from '../lib/contact';
import { birthdayProblem, createCustomer, maskBirthday, updateCustomer, type Customer, type CustomerFailure } from '../lib/customers';

/*
 * The customer form: "Nova cliente", "Editar" in her record, and the short
 * version (name, WhatsApp, city) inside "Novo pedido". The server validates
 * again and refuses a WhatsApp that already belongs to someone else.
 */

export interface CustomerDraft {
  name: string;
  whatsapp: string;
  city: string;
  uf: string;
  instagram: string;
  birthday: string;
  note: string;
}

export type DraftErrors = Partial<Record<keyof CustomerDraft, string>>;

export const emptyDraft = (from: Partial<CustomerDraft> = {}): CustomerDraft => ({ name: '', whatsapp: '', city: '', uf: '', instagram: '', birthday: '', note: '', ...from });

export const draftOf = (c: Customer): CustomerDraft => ({
  name: c.name,
  whatsapp: maskPhone(c.whatsapp),
  city: c.city,
  uf: c.uf,
  instagram: c.instagram ?? '',
  birthday: c.birthday ?? '',
  note: c.note ?? '',
});

/** Checks the draft in the browser (instant feedback); the server checks again. */
export function parseDraft(draft: CustomerDraft): { ok: true; input: CustomerInput } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const name = draft.name.replace(/\s+/g, ' ').trim();
  if (name.length < 2) errors.name = 'Informe o nome da cliente.';
  const whatsapp = phoneDigits(draft.whatsapp);
  if (whatsapp && whatsapp.length !== 10 && whatsapp.length !== 11) errors.whatsapp = 'WhatsApp com DDD, ex.: (65) 99999-9999';
  const uf = draft.uf.trim().toUpperCase();
  if (uf && !/^[A-Z]{2}$/.test(uf)) errors.uf = 'Use a sigla, ex.: MT';
  const instagram = parseInstagram(draft.instagram);
  if (!/^[A-Za-z0-9._]{0,30}$/.test(instagram)) errors.instagram = 'Digite só o @ do Instagram';
  const birthday = birthdayProblem(draft.birthday);
  if (birthday) errors.birthday = birthday;
  if (draft.note.length > 600) errors.note = 'Observação longa demais.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      name,
      whatsapp,
      city: draft.city.replace(/\s+/g, ' ').trim(),
      uf,
      ...(instagram ? { instagram } : {}),
      ...(draft.birthday ? { birthday: draft.birthday } : {}),
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    },
  };
}

/** The fields. `short`: name, WhatsApp and city only (registering her in the middle of an order). */
export function CustomerFields({ draft, errors, onChange, short }: { draft: CustomerDraft; errors: DraftErrors; onChange: (d: CustomerDraft) => void; short?: boolean }) {
  const set = (key: keyof CustomerDraft, value: string) => onChange({ ...draft, [key]: value });
  return (
    <>
      <TextField label="Nome da cliente" required autoComplete="off" maxLength={80} value={draft.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
      <TextField
        label="WhatsApp"
        optional
        inputMode="tel"
        autoComplete="off"
        placeholder="(65) 99999-9999"
        value={draft.whatsapp}
        error={errors.whatsapp}
        hint={short ? 'Com o número, a mensagem da compra abre direto na conversa dela.' : undefined}
        onChange={(e) => set('whatsapp', maskPhone(e.target.value))}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
        <TextField label="Cidade" optional autoComplete="off" maxLength={80} value={draft.city} error={errors.city} onChange={(e) => set('city', e.target.value)} />
        {!short && (
          <TextField
            label="UF"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={2}
            value={draft.uf}
            error={errors.uf}
            onChange={(e) => set('uf', e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())}
          />
        )}
      </div>
      {!short && (
        <>
          <TextField
            label="Instagram"
            optional
            autoCapitalize="none"
            spellCheck={false}
            maxLength={80}
            placeholder="perfil"
            icon={<span className="text-sm">@</span>}
            value={draft.instagram}
            error={errors.instagram}
            onChange={(e) => set('instagram', e.target.value)}
            onBlur={() => set('instagram', parseInstagram(draft.instagram))}
          />
          <TextField
            label="Aniversário"
            optional
            inputMode="numeric"
            placeholder="DD/MM"
            maxLength={5}
            value={draft.birthday}
            error={errors.birthday}
            hint="Só dia e mês."
            wrapperClassName="max-w-[12rem]"
            onChange={(e) => set('birthday', maskBirthday(e.target.value))}
          />
          <TextArea label="Observação" optional rows={3} maxLength={600} value={draft.note} error={errors.note} onChange={(e) => set('note', e.target.value)} />
        </>
      )}
    </>
  );
}

/** Error box; for a WhatsApp already registered, offers that customer instead. */
export function CustomerFailureBox({ failure, existingLabel, onExisting }: { failure: CustomerFailure; existingLabel: string; onExisting?: ((c: Customer) => void) | undefined }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
      <p>{failure.error}</p>
      {failure.existing && onExisting && (
        <button type="button" className="min-h-9 text-copper underline underline-offset-4" onClick={() => onExisting(failure.existing!)}>
          {existingLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Create (no `customer`) or edit. Mounted per opening. `onExisting`: what to do with the customer that
 * already has this WhatsApp (open her record, or use her in the order).
 */
export function CustomerForm({
  customer,
  initial,
  submitLabel,
  existingLabel = 'Abrir a ficha dela',
  onDone,
  onExisting,
}: {
  customer?: Customer;
  initial?: Partial<CustomerDraft>;
  submitLabel?: string;
  existingLabel?: string;
  onDone: (c: Customer) => void;
  onExisting?: (c: Customer) => void;
}) {
  const [draft, setDraft] = useState(() => (customer ? draftOf(customer) : emptyDraft(initial)));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [problem, setProblem] = useState<CustomerFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef<{ body: string; key: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = parseDraft(draft);
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    setProblem(null);
    setBusy(true);
    let result: { customer: Customer } | CustomerFailure;
    if (customer) {
      result = await updateCustomer(customer, parsed.input);
    } else {
      const body = JSON.stringify(parsed.input);
      if (key.current?.body !== body) key.current = { body, key: idempotencyKey() };
      result = await createCustomer(parsed.input, key.current.key);
    }
    setBusy(false);
    if ('error' in result) {
      if (result.field && result.field in draft && !result.existing) setErrors({ [result.field]: result.error });
      else setProblem(result);
      return;
    }
    toast(customer ? 'Dados da cliente salvos.' : 'Cliente cadastrada.', { tone: 'success' });
    onDone(result.customer);
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <CustomerFields draft={draft} errors={errors} onChange={setDraft} />
      {problem && <CustomerFailureBox failure={problem} existingLabel={existingLabel} onExisting={onExisting} />}
      <Button type="submit" size="lg" block disabled={busy} aria-busy={busy}>
        {busy ? 'Salvando…' : (submitLabel ?? (customer ? 'Salvar' : 'Cadastrar cliente'))}
      </Button>
    </form>
  );
}
