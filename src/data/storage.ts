/*
 * Browser storage helpers for per-visitor data (cart, favorites, customer
 * details) and the offline copy of the catalog. The catalog itself lives on
 * the server (see src/store/catalog.ts and worker/).
 */
export const KEYS = {
  /** Last catalog received from the server, rendered instantly on return visits. */
  catalogCache: 'eka:catalog-cache:v2',
  cart: 'eka:cart:v1',
  favorites: 'eka:favorites:v1',
  customer: 'eka:customer:v1',
} as const;

/** Where the catalog lived before the backend (edits made on one device only). */
export const LEGACY_CATALOG_KEY = 'eka:catalog:v1';
export const LEGACY_CORRUPT_PREFIX = 'eka:catalog:corrupt:';

export type StorageFailure = 'quota' | 'unavailable' | 'unknown' | 'invalid' | 'outdated' | 'blocked';
export type StorageResult = { ok: true } | { ok: false; reason: StorageFailure; message: string };

const MESSAGES: Record<StorageFailure, string> = {
  quota: 'Espaço do navegador cheio. Exporte um backup e remova fotos antigas para continuar salvando.',
  unavailable: 'Este navegador não permite salvar alterações (talvez esteja em modo anônimo).',
  unknown: 'Não foi possível salvar agora. Tente de novo.',
  invalid: 'Não foi possível salvar: os dados ficaram inconsistentes.',
  outdated: 'Esta página está com uma versão antiga do site. Recarregue para continuar salvando.',
  blocked: 'Os dados salvos neste navegador estão danificados. Baixe a cópia indicada no aviso antes de continuar.',
};

export function failure(reason: StorageFailure, message?: string): StorageResult {
  return { ok: false, reason, message: message ?? MESSAGES[reason] };
}

/** Detects quota errors across browsers (Chrome/Safari code 22, Firefox 1014 / NS_ERROR_DOM_QUOTA_REACHED). */
export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error) && !(typeof DOMException !== 'undefined' && error instanceof DOMException)) return false;
  const e = error as DOMException;
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}

function getStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // access itself can throw (blocked cookies / sandboxed iframes)
  }
}

let availabilityCache: boolean | null = null;

/** True when localStorage can be written. Cached after the first probe. */
export function isStorageAvailable(): boolean {
  if (availabilityCache != null) return availabilityCache;
  const store = getStore();
  if (!store) return (availabilityCache = false);
  try {
    const probe = 'eka:probe';
    store.setItem(probe, '1');
    store.removeItem(probe);
    availabilityCache = true;
  } catch (error) {
    // A full store still counts as available; writes will report quota.
    availabilityCache = isQuotaError(error);
  }
  return availabilityCache;
}

export function resetStorageProbe(): void {
  availabilityCache = null;
}

export function readRaw(key: string): string | null {
  try {
    return getStore()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): StorageResult {
  const store = getStore();
  if (!store) return failure('unavailable');
  try {
    store.setItem(key, value);
    return { ok: true };
  } catch (error) {
    if (isQuotaError(error)) return failure('quota');
    return failure(isStorageAvailable() ? 'unknown' : 'unavailable');
  }
}

export function writeJSON(key: string, value: unknown): StorageResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return failure('unknown');
  }
  return writeRaw(key, serialized);
}

export function removeKey(key: string): void {
  try {
    getStore()?.removeItem(key);
  } catch {
    /* nothing to clean up when storage is inaccessible */
  }
}

/** Reads and validates a JSON value. Returns null when missing, unreadable or invalid. */
export function readJSON<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  const raw = readRaw(key);
  if (raw == null) return null;
  try {
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Approximate bytes used by this site's keys (UTF-16 → 2 bytes per char). */
export function storageUsage(): number {
  const store = getStore();
  if (!store) return 0;
  let total = 0;
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith('eka:')) continue;
      total += (key.length + (store.getItem(key)?.length ?? 0)) * 2;
    }
  } catch {
    return total;
  }
  return total;
}

/** Raw payloads of the pre-backend localStorage catalog on this device, if any. */
export function listLegacyCatalogKeys(): string[] {
  const store = getStore();
  if (!store) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key === LEGACY_CATALOG_KEY || key?.startsWith(LEGACY_CORRUPT_PREFIX)) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys.sort();
}
