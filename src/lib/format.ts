const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formats integer centavos as BRL ("R$ 129,90"). Normalizes the NBSP Intl emits. */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/[\u00a0\u202f]/g, ' ');
}

/** Parses user input like "129,90", "R$ 1.299,90" or "129.9" into centavos. Returns null if invalid. */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/[R$\s]/g, '');
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(',')) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** "129,90" style value (no currency symbol) for inputs. */
export function centsToInput(cents: number | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
