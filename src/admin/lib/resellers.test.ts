import { describe, expect, it } from 'vitest';
import type { Kit, Reseller } from '../../data/revenda';
import { erasureBlocker, settlementsCsv } from './resellers';

const reseller: Reseller = {
  id: 'r1', slug: 'lia', name: 'Lia Moraes', whatsapp: '65999990000', city: 'Cuiabá', uf: 'MT', status: 'encerrada',
  showWhatsapp: true, hasPin: true, createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z',
};
const tiers = [{ fromCents: 0, percent: 25 }];
const kit = (over: Partial<Kit> = {}): Kit => ({
  id: 'k1', resellerId: 'r1', status: 'fechada', openedAt: '2026-10-02T12:00:00.000Z', dueAt: '2026-11-01T12:00:00.000Z', closedAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z', items: [], stockMoves: [], tiers,
  settlement: { at: '2026-10-30T12:00:00.000Z', soldCents: 45_990, percent: 25, commissionCents: 11_498, missingCents: 0, dueCents: 34_492, returned: [], missing: [], paidAt: '2026-10-31T12:00:00.000Z' },
  ...over,
});

describe('erasureBlocker', () => {
  it('only lets an ended partnership with every settlement received be erased', () => {
    expect(erasureBlocker({ ...reseller, status: 'pausada' }, [])).toContain('Encerre a parceria');
    expect(erasureBlocker(reseller, [kit({ status: 'aberta' })])).toContain('acerto da maleta');
    const unpaid = kit({ settlement: { ...kit().settlement!, paidAt: undefined } as Kit['settlement'] });
    expect(erasureBlocker(reseller, [unpaid])).toMatch(/falta receber R\$\s?344,92/);
    expect(erasureBlocker(reseller, [kit(), kit({ id: 'k2', settlement: { ...kit().settlement!, dueCents: 0, paidAt: undefined } as Kit['settlement'] })])).toBeNull();
    expect(erasureBlocker(reseller, [])).toBeNull();
  });
});

describe('settlementsCsv', () => {
  it('lists her settlements for the owner, without her customers, in pt-BR Excel format', () => {
    const csv = settlementsCsv(reseller, [kit()]);
    const [header, row] = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    expect(header).toBe('Revendedora;Maleta aberta em;Acerto em;Vendido;Comissão (%);Comissão;Peças que faltaram;Valor do acerto;Repasse recebido em');
    expect(row).toContain('Lia Moraes;');
    expect(row).toContain(';459,90;25;114,98;0,00;344,92;');
  });
});
