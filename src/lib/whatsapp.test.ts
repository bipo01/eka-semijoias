import { describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import { buildChargeMessage, buildOrderMessage, COMPACT_THRESHOLD, orderTotal, resolveCart, whatsappUrl, type OrderLine } from './whatsapp';

const lines: OrderLine[] = [
  { name: 'Brinco Gota Cristal', finish: 'Rosé', qty: 1, unitCents: 12990 },
  { name: 'Anel Solitário Delicado', finish: 'Dourado', size: '16', qty: 2, unitCents: 13990 },
];

describe('buildOrderMessage', () => {
  it('names the registered order (payment is agreed in the chat)', () => {
    const msg = buildOrderMessage({ lines, name: 'Ana', city: 'Dourados', number: 1024 });
    expect(msg.split('\n')[0]).toBe('Olá! Fiz o pedido nº 1024 pelo site:');
    expect(msg).toContain('Total: R$ 409,70\nNome: Ana · Cidade: Dourados');
    expect(msg).not.toContain('Pagamento');
  });

  it('builds the charge message with the payment link and the Pix code', () => {
    const msg = buildChargeMessage({
      number: 1024,
      firstName: 'Ana',
      items: [{ name: 'Kit Riviera', finish: 'Rosé', qty: 1, lineCents: 28990 }, { name: 'Anel', finish: 'Dourado', size: '16', qty: 2, lineCents: 27980 }],
      shippingCents: 2000,
      discountCents: 1000,
      amountCents: 57970,
      link: 'https://eka.example/pagamento/abc',
      pixCode: '000201PIX',
    });
    expect(msg).toBe(
      [
        'Oi, Ana! Seu pedido nº 1024 está confirmado.',
        '',
        '• Kit Riviera — Rosé — 1 un. — R$ 289,90',
        '• Anel — Dourado — aro 16 — 2 un. — R$ 279,80',
        'Frete: R$ 20,00',
        'Desconto: −R$ 10,00',
        '*Total: R$ 579,70*',
        '',
        'Para pagar com Pix e enviar o comprovante, é só abrir:',
        'https://eka.example/pagamento/abc',
        '',
        'Se preferir, use o Pix Copia e Cola:',
        '000201PIX',
      ].join('\n'),
    );
  });


  it('matches the agreed format exactly', () => {
    const msg = buildOrderMessage({ lines, name: 'Ana', city: 'Campo Grande/MS', note: 'é para presente' });
    expect(msg).toBe(
      [
        'Olá! Gostaria de fazer este pedido:',
        '',
        '1) Brinco Gota Cristal — Rosé — 1 un. — R$ 129,90',
        '2) Anel Solitário Delicado — Dourado — aro 16 — 2 un. — R$ 279,80',
        '',
        'Total: R$ 409,70',
        'Nome: Ana · Cidade: Campo Grande/MS',
        'Obs.: é para presente',
      ].join('\n'),
    );
  });

  it('omits empty customer lines', () => {
    const msg = buildOrderMessage({ lines, name: '  ', city: '', note: '' });
    expect(msg).not.toContain('Nome');
    expect(msg).not.toContain('Cidade');
    expect(msg).not.toContain('Obs.');
    expect(msg.endsWith('Total: R$ 409,70')).toBe(true);
  });

  it('keeps only the city when the name is missing', () => {
    expect(buildOrderMessage({ lines, city: 'Dourados/MS' })).toContain('\nCidade: Dourados/MS');
  });

  it('switches to the compact format for long orders', () => {
    const many: OrderLine[] = Array.from({ length: 40 }, (_, i) => ({ name: `Colar Medalha Sol Edição ${i}`, finish: 'Prateado', qty: 1, unitCents: 15990 }));
    const msg = buildOrderMessage({ lines: many, name: 'Ana' });
    expect(msg).not.toContain('\n\n');
    expect(msg).toContain('1) Colar Medalha Sol Edição 0 · Prat · 1x · R$ 159,90');
    expect(msg).toContain('Total: R$ 6.396,00');
    expect(msg.length).toBeLessThan(40 * 60 + 200);
    expect(buildOrderMessage({ lines }).length).toBeLessThan(COMPACT_THRESHOLD);
  });

  it('sums totals in integer centavos', () => {
    expect(orderTotal([{ name: 'a', finish: 'Rosé', qty: 3, unitCents: 3333 }])).toBe(9999);
  });
});

describe('whatsappUrl', () => {
  it('uses the contact picker while the number is not set', () => {
    expect(whatsappUrl(null, 'Olá & tchau')).toBe('https://wa.me/?text=Ol%C3%A1%20%26%20tchau');
  });
  it('strips non-digits from the number', () => {
    expect(whatsappUrl('+55 (67) 99999-0000', 'oi')).toBe('https://wa.me/5567999990000?text=oi');
  });
});

describe('resolveCart', () => {
  it('prices with the promo price and separates unavailable items', () => {
    const data = createSeed();
    const gota = data.products.find((p) => p.slug === 'brinco-gota-cristal')!;
    const esgotada = data.products.find((p) => !p.available)!;
    const { lines: resolved, unavailable } = resolveCart(
      [
        { productId: gota.id, variantId: gota.variants[0]!.id, qty: 2 },
        { productId: esgotada.id, variantId: esgotada.variants[0]!.id, qty: 1 },
        { productId: 'gone', variantId: 'gone', qty: 1 },
      ],
      data,
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.unitCents).toBe(12990);
    expect(unavailable).toHaveLength(2);
  });
});
