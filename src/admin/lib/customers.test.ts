import { describe, expect, it } from 'vitest';
import { composeMessage } from '../../data/messages';
import type { Order } from '../../data/orders';
import { parseDraft, emptyDraft } from '../sections/CustomerForm';
import { orderMessageTypes } from '../sections/OrderMessages';
import { parseStoreForm } from '../sections/SettingsPage';
import { birthdayProblem, maskBirthday, matchesCustomer, purchaseDate, warrantyVars } from './customers';

const ana = { name: 'Ana Júlia Conceição', city: 'São Gabriel do Oeste', whatsapp: '67999991234', instagram: 'ana.joias' };

describe('customer search', () => {
  it('ignores accents and case in name and city', () => {
    expect(matchesCustomer(ana, 'julia')).toBe(true);
    expect(matchesCustomer(ana, 'CONCEICAO')).toBe(true);
    expect(matchesCustomer(ana, 'sao gabriel')).toBe(true);
    expect(matchesCustomer(ana, 'Bia')).toBe(false);
  });
  it('matches the WhatsApp by digits, however it is typed', () => {
    expect(matchesCustomer(ana, '(67) 99999-1234')).toBe(true);
    expect(matchesCustomer(ana, '1234')).toBe(true);
    expect(matchesCustomer(ana, '5555')).toBe(false);
  });
  it('matches the Instagram with or without @, and an empty query matches everyone', () => {
    expect(matchesCustomer(ana, '@ana.joias')).toBe(true);
    expect(matchesCustomer(ana, '   ')).toBe(true);
  });
});

describe('birthday', () => {
  it('masks while typing', () => {
    expect(maskBirthday('2')).toBe('2');
    expect(maskBirthday('250')).toBe('25/0');
    expect(maskBirthday('25/03/1990')).toBe('25/03');
  });
  it('accepts real days only', () => {
    expect(birthdayProblem('')).toBeNull();
    expect(birthdayProblem('29/02')).toBeNull();
    expect(birthdayProblem('31/12')).toBeNull();
    expect(birthdayProblem('31/04')).not.toBeNull();
    expect(birthdayProblem('00/05')).not.toBeNull();
    expect(birthdayProblem('12/13')).not.toBeNull();
    expect(birthdayProblem('1/5')).not.toBeNull();
  });
});

const order = (history: Order['history'], createdAt = '2026-01-10T15:00:00.000Z') => ({ createdAt, history });

describe('warranty of a purchase', () => {
  it('counts from the first confirmation, not from an items edit or the negotiation', () => {
    const o = order([
      { at: '2026-01-10T15:00:00.000Z', status: 'enviado' },
      { at: '2026-01-31T15:00:00.000Z', status: 'confirmado' },
      { at: '2026-02-05T15:00:00.000Z', status: 'confirmado', event: 'itens' },
      { at: '2026-02-06T15:00:00.000Z', status: 'pago' },
    ]);
    expect(purchaseDate(o)).toBe('2026-01-31T15:00:00.000Z');
    // 31/01 + 1 month ends on the last day of February.
    expect(warrantyVars(o, { warrantyMonths: 1 })).toEqual({ garantia: '1 mês', garantia_ate: '28/02/2026', garantia_regras: '' });
  });
  it('falls back to the creation date and carries the rules', () => {
    const o = order([{ at: '2026-01-10T15:00:00.000Z', status: 'enviado' }]);
    expect(purchaseDate(o)).toBe('2026-01-10T15:00:00.000Z');
    expect(warrantyVars(o, { warrantyMonths: 12, warrantyTerms: '  Cobre o banho.  ' })).toEqual({ garantia: '1 ano', garantia_ate: '10/01/2027', garantia_regras: 'Cobre o banho.' });
  });
  it('leaves every warranty line out of the message when there is no warranty', () => {
    const o = order([{ at: '2026-01-10T15:00:00.000Z', status: 'confirmado' }]);
    const items = [{ name: 'Brinco Gota', finish: 'Dourado', qty: 1, lineTotal: 'R$ 89,90' }];
    const none = composeMessage(undefined, 'compra', { primeiro_nome: 'Ana', pedido: '1001', total: 'R$ 89,90', loja: 'ÉKA', ...warrantyVars(o, { warrantyMonths: 0, warrantyTerms: 'Cobre o banho.' }) }, { items });
    expect(none).not.toMatch(/Garantia|Cobre o banho/);
    expect(none).toContain('• Brinco Gota');
    const six = composeMessage(undefined, 'compra', { primeiro_nome: 'Ana', pedido: '1001', total: 'R$ 89,90', loja: 'ÉKA', ...warrantyVars(o, { warrantyMonths: 6, warrantyTerms: 'Cobre o banho.' }) }, { items });
    expect(six).toContain('Garantia: 6 meses, até 10/07/2026.');
    expect(six).toContain('Cobre o banho.');
  });
});

describe('order messages', () => {
  const base = { charge: undefined } as unknown as Order;
  it('offers "Compra registrada" once the order is a sale', () => {
    expect(orderMessageTypes({ ...base, status: 'enviado' })).not.toContain('compra');
    expect(orderMessageTypes({ ...base, status: 'confirmado' })).toEqual(['compra']);
    expect(orderMessageTypes({ ...base, status: 'pago' })).toContain('compra');
    expect(orderMessageTypes({ ...base, status: 'entregue' })).toContain('compra');
    expect(orderMessageTypes({ ...base, status: 'cancelado' })).toEqual([]);
  });
});

describe('customer form', () => {
  it('normalizes the fields and leaves empty ones out', () => {
    const r = parseDraft(emptyDraft({ name: '  Ana   Souza ', whatsapp: '(67) 99999-1234', city: ' Dourados ', uf: 'ms', instagram: 'https://instagram.com/ana.joias/', birthday: '25/03' }));
    expect(r).toEqual({ ok: true, input: { name: 'Ana Souza', whatsapp: '67999991234', city: 'Dourados', uf: 'MS', instagram: 'ana.joias', birthday: '25/03' } });
  });
  it('reports each problem on its field', () => {
    const r = parseDraft(emptyDraft({ name: 'A', whatsapp: '(67) 9999', uf: 'M', birthday: '31/02' }));
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['birthday', 'name', 'uf', 'whatsapp']);
  });
});

describe('settings: warranty rules', () => {
  const base = { announcement: '', whatsapp: '', instagram: '', city: '', showroom: '', openingHours: '', warrantyMonths: '6' };
  it('stores the trimmed rules, and nothing when empty', () => {
    const filled = parseStoreForm({ ...base, warrantyTerms: '  Cobre o banho.\nNão cobre pedras.  ' });
    expect(filled.ok && filled.patch.warrantyTerms).toBe('Cobre o banho.\nNão cobre pedras.');
    const empty = parseStoreForm({ ...base, warrantyTerms: '   ' });
    expect(empty.ok && 'warrantyTerms' in empty.patch).toBe(false);
  });
  it('refuses rules over 600 characters', () => {
    const r = parseStoreForm({ ...base, warrantyTerms: 'x'.repeat(601) });
    expect(!r.ok && Object.keys(r.errors)).toEqual(['warrantyTerms']);
  });
});
