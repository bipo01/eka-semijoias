import { useSyncExternalStore } from 'react';
import type { CatalogState } from '../../data/schema';
import { storageUsage, type StorageResult } from '../../data/storage';
import { formatBytes } from '../../lib/format';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';

/** Error text for a failed write; quota errors say how much is in use. */
export function saveErrorMessage(result: Extract<StorageResult, { ok: false }>): string {
  if (result.reason !== 'quota') return result.message;
  return `Espaço do navegador cheio (≈ ${formatBytes(storageUsage())} usados). Exporte um backup e remova fotos antigas.`;
}

/**
 * Commits a catalog update. On failure shows the error toast and returns
 * false; the caller keeps its local state (a form stays open with its edits).
 */
export function save(update: (data: CatalogState) => CatalogState, success?: string | { message: string; action: { label: string; onClick: () => void } }): boolean {
  const result = useCatalog.getState().commit(update);
  if (!result.ok) {
    toast(saveErrorMessage(result), { tone: 'error' });
    return false;
  }
  if (typeof success === 'string') toast(success, { tone: 'success' });
  else if (success) toast(success.message, { tone: 'success', action: success.action, duration: 10_000 }); // time to undo
  return true;
}

export function replaceCatalog(next: CatalogState, success: string): boolean {
  const result = useCatalog.getState().replace(next);
  if (!result.ok) {
    toast(saveErrorMessage(result), { tone: 'error' });
    return false;
  }
  toast(success, { tone: 'success' });
  return true;
}

let usageCache: { data: CatalogState | null; bytes: number } = { data: null, bytes: 0 };

function usageSnapshot(): number {
  const data = useCatalog.getState().data;
  if (usageCache.data !== data) usageCache = { data, bytes: storageUsage() };
  return usageCache.bytes;
}

/** Bytes used by the site's keys, re-measured whenever the catalog changes. */
export function useStorageUsage(): number {
  return useSyncExternalStore(useCatalog.subscribe, usageSnapshot, usageSnapshot);
}

/** Storage cost of a string value, measured like storageUsage() (UTF-16). */
export const stringCost = (value: string | undefined) => (value?.length ?? 0) * 2;
