import { describe, expect, it } from 'vitest';
import { createCatalogSeed } from '../../data/seed';
import { setupStatus } from './setup';

const seed = createCatalogSeed();
const loja = { hypoallergenic: null, shipsNationwide: null, installments: 0, plating: '', consignment: null, noUpfrontInvestment: null };
const item = (s: ReturnType<typeof setupStatus>, key: string) => s.items.find((i) => i.key === key)!;

describe('store meter', () => {
  it('groups every item by the place where it is answered', () => {
    const s = setupStatus(seed);
    expect(s.areas.map((a) => [a.id, a.total])).toEqual([
      ['loja', 5],
      ['oferta', 5],
      ['pix', 1],
      ['produtos', 1],
      ['site', 2],
    ]);
    expect(s.total).toBe(14);
    expect(s.next?.id).toBe('loja');
  });

  it('parcelamento is answered once she saved “O que a loja oferece”, even with “Não mostrar”', () => {
    expect(item(setupStatus(seed), 'payment').done).toBe(false);
    const s = setupStatus({ ...seed, content: { loja } });
    expect(item(s, 'payment')).toMatchObject({ done: true, value: 'Não mostrar' });
    expect(item(setupStatus({ ...seed, content: { loja: { ...loja, installments: 3 } } }), 'payment').value).toBe('Até 3x');
  });

  it('the starting Instagram, warranty and an empty showroom count once she saved Informações da loja', () => {
    const before = setupStatus(seed);
    expect(['instagram', 'warrantyMonths', 'showroom'].map((k) => item(before, k).done)).toEqual([false, false, false]);
    const after = setupStatus({ ...seed, settings: { ...seed.settings, confirmedAt: '2026-11-25T12:00:00.000Z' } });
    expect(item(after, 'instagram')).toMatchObject({ done: true, value: '@ekasemijoias' });
    expect(item(after, 'warrantyMonths')).toMatchObject({ done: true, value: '6 meses' });
    expect(item(after, 'showroom')).toMatchObject({ done: true, value: 'Não tem' });
    // Required facts still need a value.
    expect(item(after, 'whatsapp').done).toBe(false);
    expect(item(after, 'city').done).toBe(false);
  });

  it('counts the pieces still on a stand-in photo', () => {
    const [first, ...rest] = seed.products;
    const real = { ...first!, images: first!.images.map(({ placeholder: _p, ...img }) => img) };
    const s = setupStatus({ ...seed, products: [real, ...rest] });
    expect(item(s, 'photos')).toMatchObject({ done: false, progress: `1 de ${seed.products.length} peças com foto real` });
    const all = setupStatus({ ...seed, products: seed.products.map((p) => ({ ...p, images: p.images.map(({ placeholder: _p, ...img }) => img) })) });
    expect(item(all, 'photos')).toMatchObject({ done: true, value: `${seed.products.length} de ${seed.products.length} peças` });
  });

  it('is complete when every place is', () => {
    const settings = { ...seed.settings, whatsapp: '5565999998888', city: 'Cuiabá/MT', confirmedAt: '2026-11-25T12:00:00.000Z', pix: { key: 'loja@eka.com.br', name: 'EKA', city: 'CUIABA' } };
    const content = {
      loja: { ...loja, shipsNationwide: true, hypoallergenic: true, plating: 'ouro 18k', consignment: true, noUpfrontInvestment: true },
      sobre: { header: { eyebrow: '', title: 'Oi', highlight: '', intro: '' }, story: 'História', signature: '', image: null, valuesTitle: 'Valores', values: [] },
      depoimentos: { items: [{ id: 'd1', text: 'Amei', name: 'Ana', city: '', authorized: true as const }] },
    };
    const products = seed.products.map((p) => ({ ...p, images: p.images.map(({ placeholder: _p, ...img }) => img) }));
    const s = setupStatus({ settings, content, products });
    expect(s.done).toBe(s.total);
    expect(s.next).toBeNull();
  });
});
