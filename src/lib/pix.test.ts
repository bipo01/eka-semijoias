import { describe, expect, it } from 'vitest';
import { buildPixPayload, crc16, formatPixKey, guessPixKeyKind, maskPixKey, normalizePixKey, pixKeyChars, pixKeyKind, pixText } from './pix';

/** Parses a BR Code into its top-level EMV fields (id → value). */
function fields(payload: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    out.set(id, payload.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

describe('crc16', () => {
  it('matches the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('matches the example of the Banco Central manual', () => {
    const body = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
    expect(crc16(body)).toBe('1D3D');
  });
});

describe('buildPixPayload', () => {
  it('reproduces the manual example byte for byte', () => {
    expect(buildPixPayload({ key: '123e4567-e12b-12d1-a456-426655440000', name: 'Fulano de Tal', city: 'BRASILIA' })).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );
  });

  it('carries amount, ASCII name/city within limits, txid and a valid CRC', () => {
    const payload = buildPixPayload({ key: '+5565999998888', name: 'Érika Semijoias Acessórios Ltda', city: 'São José do Rio Preto', amountCents: 25990, txid: 'EKA1024' });
    const f = fields(payload);
    expect(f.get('00')).toBe('01');
    expect(f.get('26')).toBe('0014br.gov.bcb.pix0114+5565999998888');
    expect(f.get('52')).toBe('0000');
    expect(f.get('53')).toBe('986');
    expect(f.get('54')).toBe('259.90');
    expect(f.get('58')).toBe('BR');
    expect(f.get('59')).toBe('Erika Semijoias Acessorio');
    expect(f.get('59')!.length).toBeLessThanOrEqual(25);
    expect(f.get('60')).toBe('Sao Jose do Rio');
    expect(f.get('62')).toBe('0507EKA1024');
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it('omits the amount when there is none', () => {
    expect(fields(buildPixPayload({ key: 'a@b.co', name: 'Ana', city: 'Rio' })).has('54')).toBe(false);
  });
});

describe('Pix keys', () => {
  it('validates and normalizes each kind', () => {
    expect(normalizePixKey('cpf', '529.982.247-25')).toEqual({ ok: true, key: '52998224725' });
    expect(normalizePixKey('cpf', '111.111.111-11').ok).toBe(false);
    expect(normalizePixKey('cnpj', '11.222.333/0001-81')).toEqual({ ok: true, key: '11222333000181' });
    expect(normalizePixKey('cnpj', '11.222.333/0001-82').ok).toBe(false);
    expect(normalizePixKey('phone', '(65) 99999-8888')).toEqual({ ok: true, key: '+5565999998888' });
    expect(normalizePixKey('phone', '+55 65 99999-8888')).toEqual({ ok: true, key: '+5565999998888' });
    expect(normalizePixKey('phone', '6533334444').ok).toBe(false);
    expect(normalizePixKey('email', ' Loja@Eka.com.br ')).toEqual({ ok: true, key: 'loja@eka.com.br' });
    expect(normalizePixKey('random', '123E4567-E12B-12D1-A456-426655440000')).toEqual({ ok: true, key: '123e4567-e12b-12d1-a456-426655440000' });
  });

  it('round-trips the kind and the display format', () => {
    expect(pixKeyKind('52998224725')).toBe('cpf');
    expect(formatPixKey('52998224725')).toBe('529.982.247-25');
    expect(formatPixKey('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatPixKey('+5565999998888')).toBe('(65) 99999-8888');
    expect(pixKeyKind('loja@eka.com.br')).toBe('email');
  });

  it('strips accents and unsupported characters', () => {
    expect(pixText('  Conceição   d’Ávila ', 25)).toBe('Conceicao dAvila');
  });
});

describe('alphanumeric CNPJ (since July 2026)', () => {
  it('validates the Receita Federal example and keeps the all-digit rule', () => {
    expect(normalizePixKey('cnpj', '12.abc.345/01de-35')).toEqual({ ok: true, key: '12ABC34501DE35' });
    expect(normalizePixKey('cnpj', '12.ABC.345/01DE-36').ok).toBe(false);
    expect(pixKeyKind('12ABC34501DE35')).toBe('cnpj');
    expect(formatPixKey('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });
});

describe('typing a Pix key', () => {
  it('formats each kind as it is typed', () => {
    expect(maskPixKey('cpf', '5299')).toBe('529.9');
    expect(maskPixKey('cpf', '529982247')).toBe('529.982.247');
    expect(maskPixKey('cpf', '52998224725')).toBe('529.982.247-25');
    expect(maskPixKey('cnpj', '11222333000181')).toBe('11.222.333/0001-81');
    expect(maskPixKey('cnpj', '12abc34501de35')).toBe('12.ABC.345/01DE-35');
    expect(maskPixKey('phone', '65')).toBe('(65');
    expect(maskPixKey('phone', '659')).toBe('(65) 9');
    expect(maskPixKey('phone', '65999998888')).toBe('(65) 99999-8888');
    expect(maskPixKey('email', ' Loja @Eka.com.BR')).toBe('loja@eka.com.br');
    expect(maskPixKey('random', '123E4567E12B12D1A456426655440000')).toBe('123e4567-e12b-12d1-a456-426655440000');
  });

  it('never takes more characters than the kind has, nor ones it cannot have', () => {
    expect(maskPixKey('cpf', '529.982.247-25999')).toBe('529.982.247-25');
    expect(maskPixKey('cpf', 'abc1')).toBe('1');
    expect(pixKeyChars('cnpj', '12ABC34501DEXY35')).toBe('12ABC34501DE35'); // letters only in the first 12
    expect(maskPixKey('phone', '+55 (65) 99999-8888')).toBe('(65) 99999-8888');
    expect(maskPixKey('phone', '659999988889')).toBe('(65) 99999-8888');
    expect(maskPixKey('random', '123e4567-e12b-12d1-a456-426655440000ffff')).toBe('123e4567-e12b-12d1-a456-426655440000');
    expect(maskPixKey('random', 'xyz')).toBe('');
  });

  it('keeps a formatted key the same when it is formatted again', () => {
    for (const [kind, key] of [['cpf', '529.982.247-25'], ['cnpj', '12.ABC.345/01DE-35'], ['phone', '(65) 99999-8888'], ['random', '123e4567-e12b-12d1-a456-426655440000']] as const) {
      expect(maskPixKey(kind, key)).toBe(key);
      expect(normalizePixKey(kind, maskPixKey(kind, key)).ok).toBe(true);
    }
  });

  it('recognizes the kind of a pasted key', () => {
    expect(guessPixKeyKind('loja@eka.com.br')).toBe('email');
    expect(guessPixKeyKind('123e4567-e12b-12d1-a456-426655440000')).toBe('random');
    expect(guessPixKeyKind('+55 65 99999-8888')).toBe('phone');
    expect(guessPixKeyKind('529.982.247-25')).toBe('cpf');
    expect(guessPixKeyKind('65999998888')).toBe('phone'); // not a valid CPF
    expect(guessPixKeyKind('11.222.333/0001-81')).toBe('cnpj');
    expect(guessPixKeyKind('12.ABC.345/01DE-35')).toBe('cnpj');
    expect(guessPixKeyKind('1234')).toBeNull();
    expect(guessPixKeyKind('')).toBeNull();
  });
});
