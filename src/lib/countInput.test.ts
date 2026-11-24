import { describe, expect, it } from 'vitest';
import { countInput } from './countInput';

describe('countInput', () => {
  it('drops leading zeros and anything that is not a digit', () => {
    expect(countInput('025')).toBe('25');
    expect(countInput('07')).toBe('7');
    expect(countInput('000')).toBe('0');
    expect(countInput('0')).toBe('0');
    expect(countInput('1 0a0')).toBe('100');
    expect(countInput('')).toBe('');
  });

  it('never keeps a lone zero where the count starts at 1, and caps the digits', () => {
    expect(countInput('0', { allowZero: false })).toBe('');
    expect(countInput('00', { allowZero: false })).toBe('');
    expect(countInput('05', { allowZero: false })).toBe('5');
    expect(countInput('10', { allowZero: false })).toBe('10');
    expect(countInput('0001234567', { maxDigits: 6 })).toBe('123456');
    expect(countInput('123', { maxDigits: 2 })).toBe('12');
  });
});
