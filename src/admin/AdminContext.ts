import { createContext, useContext } from 'react';

export interface AdminSession {
  /** Ends the session on the server and returns to the PIN gate. */
  lock: () => Promise<void>;
  /** Records the new PIN length after a PIN change (the session stays open). */
  pinChanged: (pinLength: number) => void;
}

export const AdminSessionContext = createContext<AdminSession>({ lock: async () => undefined, pinChanged: () => undefined });

export const useAdminSession = () => useContext(AdminSessionContext);
