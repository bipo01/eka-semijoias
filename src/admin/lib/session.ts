import { api } from '../../lib/api';

/*
 * Admin session, kept by the server in an HttpOnly cookie. The browser never
 * sees the PIN hash or the session token.
 */

export interface SessionStatus {
  authenticated: boolean;
  /** Digits of the current PIN, so the keypad can submit as soon as it is complete. */
  pinLength: number;
}

export const fetchSession = () => api<SessionStatus>('/api/admin/session', { retries: 2 });

export const login = (pin: string) => api<SessionStatus>('/api/admin/login', { json: { pin } });

export const logout = () => api<SessionStatus>('/api/admin/logout', { method: 'POST' });

export const changePin = (currentPin: string, newPin: string) => api<{ ok: true; pinLength: number }>('/api/admin/pin', { json: { currentPin, newPin } });

/** Fired when any admin request finds the session gone; AdminApp returns to the PIN gate. */
export const SESSION_LOST_EVENT = 'eka:admin-session-lost';

export function signalSessionLost(): void {
  window.dispatchEvent(new Event(SESSION_LOST_EVENT));
}
