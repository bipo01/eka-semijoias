/**
 * What a count field keeps from what was typed or pasted: digits only, never a leading zero
 * ("025" → "25", "0" then "7" → "7"). A lone "0" stays only where zero is a valid answer.
 */
export function countInput(raw: string, { allowZero = true, maxDigits = 6 }: { allowZero?: boolean; maxDigits?: number } = {}): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, maxDigits);
  return !allowZero && digits === '0' ? '' : digits;
}
