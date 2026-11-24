import { describe, expect, it } from 'vitest';
import { BOM, escapeCell, toCSV } from './csv';

describe('escapeCell', () => {
  it('leaves plain text untouched', () => {
    expect(escapeCell('Ana Souza')).toBe('Ana Souza');
    expect(escapeCell(42)).toBe('42');
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
  });

  it('writes booleans in Portuguese', () => {
    expect(escapeCell(true)).toBe('Sim');
    expect(escapeCell(false)).toBe('Não');
  });

  it('quotes cells with the delimiter, quotes or line breaks (RFC 4180)', () => {
    expect(escapeCell('Cuiabá, MT')).toBe('"Cuiabá, MT"');
    expect(escapeCell('ela disse "oi"')).toBe('"ela disse ""oi"""');
    expect(escapeCell('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    expect(escapeCell('a;b', ';')).toBe('"a;b"');
    expect(escapeCell('a,b', ';')).toBe('a,b');
  });

  it('neutralizes formula injection', () => {
    expect(escapeCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(escapeCell('+5565999')).toBe("'+5565999");
    expect(escapeCell('-1+1')).toBe("'-1+1");
    expect(escapeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCell('\tcmd')).toBe("'\tcmd");
    expect(escapeCell('a=b')).toBe('a=b');
  });
});

describe('toCSV', () => {
  it('starts with a BOM and uses CRLF line endings', () => {
    const csv = toCSV(['Nome', 'Cidade'], [['Ana', 'Várzea Grande'], ['Bia', 'Cuiabá, MT']]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(1)).toBe('Nome,Cidade\r\nAna,Várzea Grande\r\nBia,"Cuiabá, MT"\r\n');
  });

  it('supports a semicolon delimiter and no BOM', () => {
    expect(toCSV(['a', 'b'], [['1;2', '3']], { delimiter: ';', bom: false })).toBe('a;b\r\n"1;2";3\r\n');
  });
});
