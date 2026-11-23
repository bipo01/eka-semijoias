/* Admin PIN policy, shared by the admin UI and the Worker (which enforces it). */

export const PIN_MIN = 6;
export const PIN_MAX = 8;

/** Returns a pt-BR problem when a new PIN is weak or malformed, else null. */
export function pinProblem(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin)) return `O PIN precisa ter de ${PIN_MIN} a ${PIN_MAX} números.`;
  if (/^(\d)\1+$/.test(pin)) return 'Escolha um PIN com números diferentes.';
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => (d - digits[i]! + 10) % 10);
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return 'Evite sequências como 123456. Escolha um PIN difícil de adivinhar.';
  if (/^(\d\d)\1+$/.test(pin)) return 'Evite repetir o mesmo par de números.';
  const half = pin.length / 2;
  if (pin.length % 2 === 0 && pin.slice(0, half) === pin.slice(half)) return 'Evite repetir o mesmo trecho, como 123123.';
  return null;
}
