import { readJSON, writeJSON, type StorageResult } from '../data/storage';
import { toast } from './ui';

const warned = new Set<string>();

/**
 * Saves a small per-visitor value (cart, favorites, customer). Failures are
 * surfaced once per key with a toast; the in-memory state keeps working.
 */
export function persistVisitorValue(key: string, value: unknown, what: string): StorageResult {
  const result = writeJSON(key, value);
  if (!result.ok && !warned.has(key)) {
    warned.add(key);
    toast(`Não foi possível guardar ${what} neste navegador. Ela continua aqui enquanto a página estiver aberta.`, { tone: 'error' });
  }
  if (result.ok) warned.delete(key);
  return result;
}

export { readJSON };
