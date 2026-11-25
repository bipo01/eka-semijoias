/*
 * Static Pix (BR Code, EMV QRCPS-MPM) as specified by the Banco Central do
 * Brasil "Manual de Padrões para Iniciação do Pix". The same string is the
 * QR Code content and the "Pix Copia e Cola" code. A malformed code is
 * refused by the bank apps, so every field is normalized and the CRC16 is
 * unit-tested against the manual's example.
 */

export type PixKeyKind = 'cpf' | 'cnpj' | 'phone' | 'email' | 'random';

export const PIX_KEY_KIND_LABEL: Record<PixKeyKind, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  phone: 'Celular',
  email: 'E-mail',
  random: 'Chave aleatória',
};

const digits = (v: string) => v.replace(/\D/g, '');

function validCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

/**
 * CNPJ check digits. Since July 2026 a CNPJ may be alphanumeric: the first 12 positions take
 * 0–9 and A–Z, the last 2 are digits; each character is worth its ASCII code minus 48 (Receita
 * Federal, e.g. 12.ABC.345/01DE-35). An all-digit CNPJ gives the same result as before.
 */
function validCnpj(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const value = (c: string) => c.charCodeAt(0) - 48;
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + w * value(cnpj[i]!), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}

/** The characters of a CNPJ as typed: A–Z and digits in the first 12 positions, digits in the last 2. */
function cnpjChars(raw: string): string {
  let out = '';
  for (const c of raw.toUpperCase()) {
    if (out.length >= 14) break;
    if (out.length < 12 ? /[0-9A-Z]/.test(c) : /\d/.test(c)) out += c;
  }
  return out;
}

/**
 * Normalizes a Pix key of the given kind into the format the payload needs,
 * or returns a pt-BR problem.
 */
export function normalizePixKey(kind: PixKeyKind, raw: string): { ok: true; key: string } | { ok: false; error: string } {
  const value = raw.trim();
  switch (kind) {
    case 'cpf': {
      const d = digits(value);
      return validCpf(d) ? { ok: true, key: d } : { ok: false, error: 'CPF inválido. Confira os 11 números.' };
    }
    case 'cnpj': {
      const d = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
      return validCnpj(d) ? { ok: true, key: d } : { ok: false, error: 'CNPJ inválido. Confira os 14 caracteres.' };
    }
    case 'phone': {
      let d = digits(value);
      if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
      return /^[1-9]{2}9\d{8}$/.test(d) ? { ok: true, key: `+55${d}` } : { ok: false, error: 'Informe o celular com DDD, por exemplo (65) 99999-9999.' };
    }
    case 'email': {
      const email = value.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 77 ? { ok: true, key: email } : { ok: false, error: 'E-mail inválido.' };
    }
    case 'random': {
      const evp = value.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(evp)
        ? { ok: true, key: evp }
        : { ok: false, error: 'A chave aleatória tem 32 letras e números separados por hífens.' };
    }
  }
}

/** Guesses the kind of a stored (normalized) key, to show it back in the form. */
export function pixKeyKind(key: string): PixKeyKind {
  if (key.startsWith('+')) return 'phone';
  if (key.includes('@')) return 'email';
  if (/^[0-9A-Z]{12}\d{2}$/.test(key)) return 'cnpj';
  if (/^\d{11}$/.test(key)) return 'cpf';
  return 'random';
}

/** Formats a stored key for people (CPF/CNPJ/phone punctuation). */
export function formatPixKey(key: string): string {
  const kind = pixKeyKind(key);
  if (kind === 'cpf') return key.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (kind === 'cnpj') return key.replace(/^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (kind === 'phone') return key.replace(/^\+55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  return key;
}

// ---------------------------------------------------------------------------
// Typing a key: each kind formatted as it is typed, never longer than it can be
// ---------------------------------------------------------------------------

/** Puts `seps[i]` before the character at position i (progressive mask). */
function withSeparators(chars: string, seps: Record<number, string>): string {
  let out = '';
  for (let i = 0; i < chars.length; i++) out += (seps[i] ?? '') + chars[i];
  return out;
}

/** The characters that count in a key of this kind (punctuation and spaces do not). */
export function pixKeyChars(kind: PixKeyKind, raw: string): string {
  switch (kind) {
    case 'cpf':
      return digits(raw).slice(0, 11);
    case 'cnpj':
      return cnpjChars(raw);
    case 'phone': {
      let d = digits(raw);
      // Pasted with the country code: +55 65 99999-8888.
      if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
      return d.slice(0, 11);
    }
    case 'email':
      return raw.replace(/\s/g, '').toLowerCase().slice(0, 77);
    case 'random':
      return raw.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 32);
  }
}

/** Formats what was typed so far: 123.456.789-09, 12.ABC.345/01DE-35, (65) 99999-8888, 8-4-4-4-12. */
export function maskPixKey(kind: PixKeyKind, raw: string): string {
  const c = pixKeyChars(kind, raw);
  switch (kind) {
    case 'cpf':
      return withSeparators(c, { 3: '.', 6: '.', 9: '-' });
    case 'cnpj':
      return withSeparators(c, { 2: '.', 5: '.', 8: '/', 12: '-' });
    case 'phone':
      return c ? `(${c.slice(0, 2)}${c.length > 2 ? `) ${c.slice(2, 7)}` : ''}${c.length > 7 ? `-${c.slice(7)}` : ''}` : '';
    case 'email':
      return c;
    case 'random':
      return withSeparators(c, { 8: '-', 12: '-', 16: '-', 20: '-' });
  }
}

/** How many characters a complete key of this kind has (null: free length). */
export const PIX_KEY_LENGTH: Record<PixKeyKind, number | null> = { cpf: 11, cnpj: 14, phone: 11, email: null, random: 32 };

/** How to type each kind (shown under the field while it is not complete). */
export const PIX_KEY_HINT: Record<PixKeyKind, string> = {
  cpf: '11 números: 000.000.000-00.',
  cnpj: '14 caracteres: 00.000.000/0000-00 (o CNPJ novo pode ter letras).',
  phone: 'Celular com DDD: (65) 99999-9999.',
  email: 'O e-mail cadastrado como chave no banco.',
  random: 'Os 32 caracteres da chave aleatória, como aparecem no app do banco.',
};

/**
 * The kind a pasted key most likely is, or null when it says nothing new. An 11-digit number is a
 * CPF when its check digits match, otherwise a mobile number.
 */
export function guessPixKeyKind(raw: string): PixKeyKind | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.includes('@')) return 'email';
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value)) return 'random';
  if (/^\+/.test(value)) return 'phone';
  const compact = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (compact.length === 14 && validCnpj(compact)) return 'cnpj';
  const d = digits(value);
  if (/^\d{11}$/.test(compact)) return validCpf(d) ? 'cpf' : /^[1-9]{2}9\d{8}$/.test(d) ? 'phone' : null;
  if (/^55[1-9]{2}9\d{8}$/.test(compact)) return 'phone';
  return null;
}

/** Plain ASCII for the name and city fields (bank apps reject or mangle accents). */
export function pixText(value: string, max: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .\-/&]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT-FALSE (polynomial 0x1021, initial 0xFFFF), as required by the BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(payload);
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PixPayloadInput {
  key: string;
  name: string;
  city: string;
  /** Amount in centavos; omitted means the payer types it. */
  amountCents?: number;
  /** Reference shown in the bank statement (letters and numbers, up to 25). */
  txid?: string;
}

/** Builds the "copia e cola" string (also the QR Code content). */
export function buildPixPayload(input: PixPayloadInput): string {
  const txid = (input.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const name = pixText(input.name, 25) || 'RECEBEDOR';
  const city = pixText(input.city, 15) || 'BRASIL';
  const account = field('00', 'br.gov.bcb.pix') + field('01', input.key);
  const body = [
    field('00', '01'),
    field('26', account),
    field('52', '0000'),
    field('53', '986'),
    ...(input.amountCents != null && input.amountCents > 0 ? [field('54', (input.amountCents / 100).toFixed(2))] : []),
    field('58', 'BR'),
    field('59', name),
    field('60', city),
    field('62', field('05', txid)),
  ].join('');
  const withCrcId = `${body}6304`;
  return withCrcId + crc16(withCrcId);
}

/** The order reference used as txid. */
export const pixTxid = (orderNumber: number) => `EKA${orderNumber}`;
