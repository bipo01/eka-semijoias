/** Brazilian phone helpers. Stored form: "55" + DDD + number (12–13 digits). */

const digitsOf = (value: string) => value.replace(/\D/g, '');

/** Local part (DDD + number) of a stored or typed number. */
export function localDigits(value: string): string {
  const d = digitsOf(value);
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
}

/** Formats while typing: "(65) 99999-9999" / "(65) 9999-9999". */
export function maskPhone(value: string): string {
  const d = localDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  const split = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** Typed number → stored digits ("" when empty), or null when incomplete. */
export function parsePhone(value: string): string | null {
  const d = localDigits(value);
  if (!d) return '';
  if (d.length !== 10 && d.length !== 11) return null;
  return `55${d}`;
}

/** Digits for wa.me from whatever a lead typed; prefixes 55 to local numbers. */
export function whatsappDigits(value: string): string {
  const d = digitsOf(value);
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export function formatPhone(value: string): string {
  const d = localDigits(value);
  return d.length === 10 || d.length === 11 ? maskPhone(d) : value;
}

/** "@eka", "instagram.com/eka/?hl=pt" or "eka" → "eka" (the shared rule in src/lib/instagram.ts). */
export { normalizeInstagram as parseInstagram } from '../../lib/instagram';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function formatDateTime(iso: string | number): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateTime.format(date);
}
