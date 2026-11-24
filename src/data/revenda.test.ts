import { describe, expect, it } from 'vitest';
import { commissionFor, DEFAULT_PROGRAM, earnings, kitState, programSchema, readProgram, settle, uniqueSlug, type Kit, type ResellerSale } from './revenda';
import { warrantyText, warrantyUntil } from './customers';

const tiers = DEFAULT_PROGRAM.tiers;
const item = (productId: string, qty: number, unitCents: number) => ({ productId, variantId: 'v', size: '', qty, unitCents, name: productId, finish: 'dourado' as const });
const sale = (lines: [string, number, number][], status: 'ativa' | 'cancelada' = 'ativa'): Pick<ResellerSale, 'status' | 'lines' | 'totalCents'> => ({
  status,
  lines: lines.map(([p, qty, unit]) => ({ productId: p, variantId: 'v', size: '', qty, unitCents: unit, name: p, finish: 'dourado' })),
  totalCents: lines.reduce((s, [, q, u]) => s + q * u, 0),
});

describe('commission tiers', () => {
  it('applies the tier reached to the whole cycle and shows the way to the next', () => {
    expect(commissionFor(0, tiers)).toMatchObject({ percent: 25, commissionCents: 0, next: { percent: 30, missingCents: 100_000 }, progress: 0 });
    expect(commissionFor(50_000, tiers)).toMatchObject({ percent: 25, commissionCents: 12_500, progress: 0.5 });
    expect(commissionFor(100_000, tiers)).toMatchObject({ percent: 30, commissionCents: 30_000, next: { percent: 35, missingCents: 100_000 } });
    expect(commissionFor(250_000, tiers)).toMatchObject({ percent: 35, commissionCents: 87_500, next: null, progress: 1 });
    expect(commissionFor(12_345, [{ fromCents: 0, percent: 30 }])).toMatchObject({ percent: 30, commissionCents: 3704, next: null });
  });

  it('validates the program: first tier at zero, increasing tiers, contract text or link', () => {
    expect(programSchema.safeParse(DEFAULT_PROGRAM).success).toBe(true);
    expect(programSchema.safeParse({ ...DEFAULT_PROGRAM, tiers: [{ fromCents: 100, percent: 20 }] }).success).toBe(false);
    expect(programSchema.safeParse({ ...DEFAULT_PROGRAM, tiers: [{ fromCents: 0, percent: 20 }, { fromCents: 0, percent: 30 }] }).success).toBe(false);
    expect(programSchema.safeParse({ ...DEFAULT_PROGRAM, contract: { ...DEFAULT_PROGRAM.contract, mode: 'link' } }).success).toBe(false);
    expect(readProgram({ nonsense: true })).toEqual(DEFAULT_PROGRAM);
  });
});

describe('kits and settlement', () => {
  const kit: Pick<Kit, 'items' | 'tiers'> = { items: [item('a', 3, 10_000), item('b', 2, 50_000)], tiers };

  it('counts sold and available units from active sales only', () => {
    const state = kitState(kit, [sale([['a', 1, 9_000]]), sale([['a', 1, 10_000]], 'cancelada'), sale([['b', 2, 50_000]])]);
    expect(state.map((l) => [l.productId, l.sold, l.available])).toEqual([
      ['a', 1, 2],
      ['b', 2, 0],
    ]);
  });

  it('settles: commission on what was sold, missing pieces at full price, the rest comes back', () => {
    const sales = [sale([['a', 1, 9_000]]), sale([['b', 2, 50_000]])]; // 109.000 sold → 30%
    const result = settle(kit, sales, [{ productId: 'a', variantId: 'v', size: '', qty: 1 }]);
    expect(result).toMatchObject({ soldCents: 109_000, percent: 30, commissionCents: 32_700, missingCents: 10_000, dueCents: 109_000 - 32_700 + 10_000 });
    if ('error' in result) throw new Error(result.error);
    expect(result.missing).toEqual([{ productId: 'a', variantId: 'v', size: '', qty: 1, name: 'a' }]);
    expect(result.returned).toEqual([
      { productId: 'a', variantId: 'v', size: '', qty: 1 },
      { productId: 'b', variantId: 'v', size: '', qty: 0 },
    ]);
    // Without a list, everything not sold comes back.
    expect(settle(kit, sales, [])).toMatchObject({ missingCents: 0, dueCents: 109_000 - 32_700 });
    expect(settle(kit, sales, [{ productId: 'a', variantId: 'v', size: '', qty: 3 }])).toEqual({ error: 'a: devolvidas 3, mas só 2 não foram vendidas.' });
    expect('error' in settle(kit, sales, [{ productId: 'zz', variantId: 'v', size: '', qty: 1 }])).toBe(true);
  });

  it('sums earnings: received from closed cycles plus the projected commission now', () => {
    expect(earnings({ soldCents: 50_000, tiers }, [{ commissionCents: 30_000 }, { commissionCents: 1_000 }])).toEqual({ receivedCents: 31_000, projectedCents: 12_500, totalCents: 43_500 });
    expect(earnings(null, [])).toEqual({ receivedCents: 0, projectedCents: 0, totalCents: 0 });
  });

  it('builds unique showcase slugs from the name', () => {
    expect(uniqueSlug('Ana Júlia Souza', new Set())).toBe('ana');
    expect(uniqueSlug('Ana Júlia Souza', new Set(['ana']))).toBe('ana-julia');
    expect(uniqueSlug('Ana Júlia Souza', new Set(['ana', 'ana-julia', 'ana-julia-souza']))).toBe('ana-2');
    expect(uniqueSlug('É', new Set())).toBe('revendedora');
  });
});

describe('warranty helpers', () => {
  it('formats the period and the end date (month ends stay inside the month)', () => {
    expect(warrantyText(6)).toBe('6 meses');
    expect(warrantyText(12)).toBe('1 ano');
    expect(warrantyText(1)).toBe('1 mês');
    expect(warrantyText(24)).toBe('2 anos');
    expect(warrantyUntil('2026-11-23T12:00:00', 6)).toBe('23/05/2027');
    expect(warrantyUntil('2027-01-31T12:00:00', 1)).toBe('28/02/2027');
  });
});

describe('reseller message templates', () => {
  it('never leave an optional part across lines (it would show its brackets)', async () => {
    const { PRESET_TEMPLATES } = await import('./messages');
    for (const t of PRESET_TEMPLATES) expect(/\[[^\]]*\n[^\]]*\]/.test(t.text), t.id).toBe(false);
  });
});
