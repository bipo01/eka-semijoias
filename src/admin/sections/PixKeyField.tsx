import { useLayoutEffect, useRef, type ChangeEvent, type ClipboardEvent } from 'react';
import { SelectField, TextField } from '../../components/ui/Field';
import { guessPixKeyKind, maskPixKey, normalizePixKey, PIX_KEY_HINT, PIX_KEY_KIND_LABEL, PIX_KEY_LENGTH, pixKeyChars, type PixKeyKind } from '../../lib/pix';

/*
 * The store's Pix key, typed in the shape of its kind: punctuation appears by itself
 * (123.456.789-09, 12.ABC.345/01DE-35, (65) 99999-8888, 8-4-4-4-12), nothing longer than
 * the kind allows is taken, and a pasted key of another kind switches the kind.
 */

const KINDS = Object.keys(PIX_KEY_KIND_LABEL) as PixKeyKind[];

/** Characters that count for the kind (the rest is punctuation the mask adds). */
const SIGNIFICANT: Record<PixKeyKind, RegExp> = { cpf: /\d/, phone: /\d/, cnpj: /[0-9A-Z]/, random: /[0-9a-f]/, email: /[^\s]/ };

/** Position in `masked` right after its n-th significant character. */
function caretAfter(kind: PixKeyKind, masked: string, n: number): number {
  if (n <= 0) return kind === 'phone' && masked.startsWith('(') ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < masked.length; i++) {
    if (SIGNIFICANT[kind].test(masked[i]!) && ++seen === n) return i + 1;
  }
  return masked.length;
}

const INPUT_MODE: Record<PixKeyKind, 'numeric' | 'tel' | 'email' | 'text'> = { cpf: 'numeric', phone: 'tel', cnpj: 'text', email: 'email', random: 'text' };
/** Longest formatted value of each kind (maxLength of the field). */
const MAX_LENGTH: Record<PixKeyKind, number> = { cpf: 14, cnpj: 18, phone: 15, email: 77, random: 36 };

const DONE: Record<PixKeyKind, string> = { cpf: 'CPF completo.', cnpj: 'CNPJ completo.', phone: 'Celular completo.', email: 'E-mail completo.', random: 'Chave aleatória completa.' };

/** What to say under the field: the format, how much is missing, or that it is right. */
export function pixKeyStatus(kind: PixKeyKind, value: string): { error?: string; hint: string } {
  const count = pixKeyChars(kind, value).length;
  const total = PIX_KEY_LENGTH[kind];
  if (!count) return { hint: PIX_KEY_HINT[kind] };
  if (total !== null && count < total) {
    const left = total - count;
    const unit = kind === 'cpf' || kind === 'phone' ? (left === 1 ? 'número' : 'números') : left === 1 ? 'caractere' : 'caracteres';
    return { hint: `Faltam ${left} ${unit}.` };
  }
  const checked = normalizePixKey(kind, value);
  if (!checked.ok) return kind === 'email' && !value.includes('@') ? { hint: PIX_KEY_HINT.email } : { error: checked.error, hint: '' };
  return { hint: DONE[kind] };
}

export function PixKeyField({
  kind,
  value,
  error,
  onChange,
}: {
  kind: PixKeyKind;
  value: string;
  /** Error from the last save attempt (shown over the live status). */
  error?: string | undefined;
  onChange: (kind: PixKeyKind, value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  // Formatting moves characters: put the caret back after the same significant character.
  useLayoutEffect(() => {
    if (caret.current === null || !input.current || document.activeElement !== input.current) return;
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  function change(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const at = e.target.selectionStart ?? raw.length;
    let typed = raw;
    let before = pixKeyChars(kind, raw.slice(0, at)).length;
    // Backspace on a separator ("123.|456" → "123|456"): delete the character before it instead.
    if (raw.length < value.length && pixKeyChars(kind, raw) === pixKeyChars(kind, value) && before > 0) {
      const chars = pixKeyChars(kind, raw);
      typed = chars.slice(0, before - 1) + chars.slice(before);
      before -= 1;
    }
    const masked = maskPixKey(kind, typed);
    caret.current = caretAfter(kind, masked, before);
    onChange(kind, masked);
  }

  // Every paste is handled here: the browser would cut it at maxLength before the mask sees it
  // ("+55 (65) 99999-8888" is longer than "(65) 99999-8888").
  function paste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const replacesAll = !value || (start === 0 && end === value.length);
    // A whole key of another kind switches the kind.
    const guess = replacesAll ? guessPixKeyKind(text) : null;
    const next = guess ?? kind;
    const raw = replacesAll ? text : value.slice(0, start) + text + value.slice(end);
    const masked = maskPixKey(next, raw);
    caret.current = replacesAll ? masked.length : caretAfter(next, masked, pixKeyChars(next, value.slice(0, start) + text).length);
    onChange(next, masked);
  }

  const status = pixKeyStatus(kind, value);
  const shown = error ?? status.error;
  return (
    <>
      <SelectField label="Tipo de chave" value={kind} onChange={(e) => onChange(e.target.value as PixKeyKind, maskPixKey(e.target.value as PixKeyKind, value))}>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {PIX_KEY_KIND_LABEL[k]}
          </option>
        ))}
      </SelectField>
      <TextField
        ref={input}
        label="Chave Pix"
        value={value}
        error={shown}
        hint={status.hint}
        onChange={change}
        onPaste={paste}
        inputMode={INPUT_MODE[kind]}
        autoCapitalize={kind === 'cnpj' ? 'characters' : 'none'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={MAX_LENGTH[kind]}
        placeholder={kind === 'cpf' ? '000.000.000-00' : kind === 'cnpj' ? '00.000.000/0000-00' : kind === 'phone' ? '(65) 99999-9999' : kind === 'random' ? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' : 'nome@exemplo.com.br'}
      />
    </>
  );
}
