import { describe, expect, it } from 'vitest';
import { matches, normalize } from './search';
import { slugify, uniqueSlug } from './slug';

describe('search', () => {
  it('is accent-insensitive', () => {
    expect(normalize('Anéis Rosé')).toBe('aneis rose');
    expect(matches('Anéis', 'anel')).toBe(true);
    expect(matches('Brinco Pérola Clássico', 'perola classico')).toBe(true);
    expect(matches('Colar Ponto de Luz', 'gota')).toBe(false);
  });
});

describe('slug', () => {
  it('slugifies pt-BR names', () => {
    expect(slugify('Anel Solitário Delicado')).toBe('anel-solitario-delicado');
    expect(slugify('  Ear Cuff — Folhagem! ')).toBe('ear-cuff-folhagem');
  });
  it('avoids collisions', () => {
    expect(uniqueSlug('Brinco Gota', ['brinco-gota', 'brinco-gota-2'])).toBe('brinco-gota-3');
  });
});
