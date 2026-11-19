export type CsvCell = string | number | boolean | null | undefined;

/** UTF-8 byte order mark: makes Excel read accents correctly. */
export const BOM = '﻿';

/**
 * Cells starting with these characters are interpreted as formulas by
 * spreadsheet apps (CSV/formula injection), so they get a leading apostrophe.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCell(value: CsvCell, delimiter = ','): string {
  if (value == null) return '';
  let text = typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  // RFC 4180: quote fields containing the delimiter, quotes or line breaks; double inner quotes.
  if (text.includes(delimiter) || /["\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Builds a CSV document (RFC 4180 quoting, CRLF line endings, BOM for Excel).
 * `delimiter` defaults to a comma; pt-BR Excel expects a semicolon.
 */
export function toCSV(header: string[], rows: CsvCell[][], { delimiter = ',', bom = true }: { delimiter?: string; bom?: boolean } = {}): string {
  const line = (cells: CsvCell[]) => cells.map((c) => escapeCell(c, delimiter)).join(delimiter);
  return (bom ? BOM : '') + [line(header), ...rows.map(line)].join('\r\n') + '\r\n';
}
