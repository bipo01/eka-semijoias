import { sha256Hex } from '../../lib/hash';

export const SESSION_KEY = 'eka:admin:session';

/*
 * The session flag holds the PIN hash it was opened with, so changing the PIN
 * (here or in another tab) ends sessions opened with the old one.
 */
export function readSession(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Returns false when sessionStorage is blocked; the caller keeps the session in memory. */
export function writeSession(pinHash: string | null): boolean {
  try {
    if (pinHash) window.sessionStorage.setItem(SESSION_KEY, pinHash);
    else window.sessionStorage.removeItem(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  return (await sha256Hex(pin)) === pinHash;
}

export const PIN_PATTERN = /^\d{4,6}$/;
