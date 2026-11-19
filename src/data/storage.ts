import { catalogStateSchema, SCHEMA_VERSION, type CatalogState } from './schema';
import { createSeed } from './seed';

export const KEYS = {
  catalog: 'eka:catalog:v1',
  cart: 'eka:cart:v1',
  favorites: 'eka:favorites:v1',
  customer: 'eka:customer:v1',
} as const;

export const CORRUPT_PREFIX = 'eka:catalog:corrupt:';
/** Practical localStorage budget used for the meter (most browsers allow ~5 MB per origin). */
export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;

export type StorageFailure = 'quota' | 'unavailable' | 'unknown';
export type StorageResult = { ok: true } | { ok: false; reason: StorageFailure; message: string };

const MESSAGES: Record<StorageFailure, string> = {
  quota: 'Espaço do navegador cheio. Exporte um backup e remova fotos antigas para continuar salvando.',
  unavailable: 'Este navegador não permite salvar alterações (talvez esteja em modo anônimo).',
  unknown: 'Não foi possível salvar agora. Tente de novo.',
};

export function failure(reason: StorageFailure): StorageResult {
  return { ok: false, reason, message: MESSAGES[reason] };
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

// ---------------------------------------------------------------------------
// Catalog: versioned load, migrations, corrupt-data quarantine.
// ---------------------------------------------------------------------------

export type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/**
 * migrations[n] upgrades a payload from schemaVersion n to n + 1.
 * Version 1 is the first released format, so there is nothing to migrate yet.
 */
export const MIGRATIONS: Record<number, Migration> = {};

export type MigrationResult =
  | { ok: true; state: CatalogState; migratedFrom: number | null }
  | { ok: false; error: string };

export function migrateCatalog(input: unknown, migrations: Record<number, Migration> = MIGRATIONS): MigrationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'O arquivo não contém um catálogo.' };
  }
  let data = input as Record<string, unknown>;
  const startVersion = typeof data.schemaVersion === 'number' ? data.schemaVersion : NaN;
  if (!Number.isInteger(startVersion)) return { ok: false, error: 'O arquivo não informa a versão do catálogo.' };
  if (startVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'Este backup foi feito por uma versão mais nova do site.' };
  }
  let version = startVersion;
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) return { ok: false, error: `Não há como atualizar dados da versão ${version}.` };
    try {
      data = { ...step(data), schemaVersion: version + 1 };
    } catch {
      return { ok: false, error: `Falha ao atualizar dados da versão ${version}.` };
    }
    version++;
  }
  const parsed = catalogStateSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || 'catálogo';
    return { ok: false, error: `Dados inválidos em "${where}": ${issue?.message ?? 'formato inesperado'}.` };
  }
  const integrity = checkIntegrity(parsed.data);
  if (integrity) return { ok: false, error: integrity };
  return { ok: true, state: parsed.data, migratedFrom: startVersion === SCHEMA_VERSION ? null : startVersion };
}

/** Cross-reference checks zod cannot express (unique slugs, existing categories, image references). */
export function checkIntegrity(state: CatalogState): string | null {
  const categoryIds = new Set(state.categories.map((c) => c.id));
  const slugs = new Set<string>();
  const ids = new Set<string>();
  for (const p of state.products) {
    if (ids.has(p.id)) return `Produto repetido: ${p.name}.`;
    ids.add(p.id);
    if (slugs.has(p.slug)) return `Endereço de produto repetido: ${p.slug}.`;
    slugs.add(p.slug);
    if (!categoryIds.has(p.categoryId)) return `A peça "${p.name}" aponta para uma categoria que não existe.`;
    const imageIds = new Set(p.images.map((i) => i.id));
    for (const v of p.variants) {
      if (v.imageIds.some((imgId) => !imageIds.has(imgId))) return `A peça "${p.name}" tem foto de acabamento inválida.`;
    }
  }
  return null;
}

export type CatalogLoadIssue = 'none' | 'seeded' | 'corrupt-recovered' | 'unavailable' | 'seed-not-saved';

export interface CatalogLoad {
  state: CatalogState;
  issue: CatalogLoadIssue;
  corruptKey?: string;
}

export function loadCatalog(now: () => number = Date.now): CatalogLoad {
  if (!isStorageAvailable()) return { state: createSeed(), issue: 'unavailable' };
  const raw = readRaw(KEYS.catalog);
  if (raw == null) {
    const seed = createSeed();
    const saved = writeJSON(KEYS.catalog, seed);
    return { state: seed, issue: saved.ok ? 'seeded' : 'seed-not-saved' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const result = parsed === undefined ? null : migrateCatalog(parsed);
  if (result?.ok) {
    if (result.migratedFrom != null) writeJSON(KEYS.catalog, result.state);
    return { state: result.state, issue: 'none' };
  }
  // Quarantine the unreadable payload before falling back to the seed, so it can be recovered.
  const corruptKey = `${CORRUPT_PREFIX}${now()}`;
  const quarantined = writeRaw(corruptKey, raw);
  const seed = createSeed();
  if (quarantined.ok) writeJSON(KEYS.catalog, seed);
  return { state: seed, issue: 'corrupt-recovered', ...(quarantined.ok ? { corruptKey } : {}) };
}

export function saveCatalog(state: CatalogState): StorageResult {
  return writeJSON(KEYS.catalog, state);
}

export function listCorruptKeys(): string[] {
  const store = getStore();
  if (!store) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(CORRUPT_PREFIX)) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys.sort();
}
