import { describe, expect, it } from 'vitest';
import { buildPixPayload, crc16, formatPixKey, normalizePixKey, pixKeyKind, pixText } from './pix';

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
