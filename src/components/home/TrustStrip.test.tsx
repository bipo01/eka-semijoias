import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { defaultLoja } from '../../content/defaults';
import { createCatalogSeed } from '../../data/seed';
import { useCatalog } from '../../store/catalog';
import { useTrustItems } from './TrustStrip';

const withLoja = (loja: Partial<ReturnType<typeof defaultLoja>>, warrantyMonths = 6) => {
  const seed = createCatalogSeed();
  useCatalog.setState({ data: { ...seed, settings: { ...seed.settings, warrantyMonths }, content: { loja: { ...defaultLoja(), ...loja } } } });
};
const labels = (context: 'home' | 'product') => renderHook(() => useTrustItems(context)).result.current.map((i) => i.label);

describe('trust items', () => {
  it('show only confirmed facts, with the WhatsApp line in a free slot', () => {
    withLoja({ shipsNationwide: null, hypoallergenic: null, installments: 0 });
    expect(labels('home')).toEqual(['Garantia de 6 meses', 'Pedido pelo WhatsApp']);
    expect(labels('product')).toEqual(['Garantia de 6 meses', 'Atendimento pelo WhatsApp']);
  });

  it('give every confirmed fact a place before the WhatsApp line', () => {
    withLoja({ shipsNationwide: true, hypoallergenic: true, installments: 3 });
    expect(labels('home')).toEqual(['Garantia de 6 meses', 'Envio para todo o Brasil', 'Peças antialérgicas', 'Parcelamento em até 3x']);
    withLoja({ shipsNationwide: true, hypoallergenic: true, installments: 0 });
    expect(labels('home')).toEqual(['Garantia de 6 meses', 'Pedido pelo WhatsApp', 'Envio para todo o Brasil', 'Peças antialérgicas']);
  });

  it('never claim a fact answered "Não"', () => {
    withLoja({ shipsNationwide: false, hypoallergenic: false, installments: 0 }, 0);
    expect(labels('home')).toEqual(['Pedido pelo WhatsApp']);
  });
});
