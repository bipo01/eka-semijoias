import { createContext, useContext } from 'react';

export interface AdminSession {
  /** Ends the session and returns to the PIN gate. */
  lock: () => void;
  /** Keeps the session open after the PIN changes. */
  renew: (pinHash: string) => void;
}

export const AdminSessionContext = createContext<AdminSession>({ lock: () => undefined, renew: () => undefined });

export const useAdminSession = () => useContext(AdminSessionContext);
