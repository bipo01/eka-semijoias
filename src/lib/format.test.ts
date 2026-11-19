import { describe, expect, it } from 'vitest';
import { centsToInput, formatBRL, parseBRL } from './format';

describe('formatBRL', () => {
  it('formats integer centavos as BRL with a regular space', () => {
    expect(formatBRL(12990)).toBe('R$ 129,90');
    expect(formatBRL(40970)).toBe('R$ 409,70');
    expect(formatBRL(129990)).toBe('R$ 1.299,90');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
});

describe('parseBRL', () => {
  it.each([
    ['129,90', 12990],
    ['R$ 1.299,90', 129990],
    ['129.9', 12990],
    ['49', 4900],
    ['0,1', 10],
  ])('parses %s', (input, cents) => expect(parseBRL(input)).toBe(cents));

  it.each(['', 'abc', '12,345', '-5', '1.2.3'])('rejects %s', (input) => expect(parseBRL(input)).toBeNull());

  it('round-trips with centsToInput', () => {
    expect(parseBRL(centsToInput(25990))).toBe(25990);
  });
});
