import { create } from 'zustand';
import { business } from '../config/business';
import { chunkChanges, diffCatalog, type Change } from '../data/changes';
import { validateCatalog } from '../data/integrity';
import { catalogSchema, isDataUrl, SCHEMA_VERSION, type Catalog } from '../data/schema';
import { readMessageSettings } from '../data/messages';
import { KEYS, readJSON, writeJSON } from '../data/storage';
import { api, ApiError, errorMessage, idempotencyKey } from '../lib/api';
import { connectLive, type LiveConnection } from '../lib/live';

/*
 * The catalog comes from the server (GET /api/catalog). A copy is kept in
 * localStorage so return visits render instantly, then revalidated. Live
 * updates arrive over WebSocket. Admin edits go through `commit`, which
 * uploads new photos, sends the diff as one change set and only then updates
 * the in-memory catalog: a failed save never shows as saved.
 */

export type CatalogStatus = 'loading' | 'ready' | 'error';

export type SaveResult = { ok: true; version: number } | { ok: false; message: string; code: string; conflict: boolean };

interface CatalogStore {
  data: Catalog;
  /** Server version of `data` (0 before the first load). */
  version: number;
  status: CatalogStatus;
  /** True while showing the cached copy because the server could not be reached. */
  offline: boolean;
  /** Bumps when a newer catalog arrived from another device. */
  externalVersion: number;
  /** Bumps when reseller leads changed (admin live channel). */
  leadsVersion: number;
  /** Bumps when orders changed (admin live channel). */
  ordersVersion: number;
  load: () => Promise<void>;
  /**
   * Fetches `version` (or the latest) when it is newer than what is shown.
   * `force` accepts the server's latest even at the same version (used when a
   * local save may have applied an incomplete picture of that version).
   */
  refresh: (version?: number, opts?: { force?: boolean }) => Promise<void>;
  commit: (update: (data: Catalog) => Catalog, opts?: { onProgress?: (message: string) => void }) => Promise<SaveResult>;
}

interface Snapshot extends Catalog {
  version: number;
}

export function emptyCatalog(): Catalog {
  return {
    schemaVersion: SCHEMA_VERSION,
    products: [],
    categories: [],
    collections: [],
    settings: {
      announcement: '',
      whatsapp: business.whatsapp ?? '',
      instagram: business.instagram ?? '',
      city: business.city ?? '',
      showroom: '',
      openingHours: '',
      warrantyMonths: business.warrantyMonths ?? 0,
    },
  };
}

function parseSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const version = (raw as { version?: unknown }).version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  // Message templates never take the site down: invalid ones (another version's) fall back to the defaults.
  const settings = (raw as { settings?: Record<string, unknown> }).settings;
  if (settings && 'messages' in settings && !readMessageSettings(settings.messages)) {
    const { messages: _messages, ...rest } = settings;
    raw = { ...(raw as object), settings: rest };
  }
  const parsed = catalogSchema.safeParse(raw);
  return parsed.success ? { ...parsed.data, version } : null;
}

function readCache(): Snapshot | null {
  return readJSON(KEYS.catalogCache, parseSnapshot);
}

function writeCache(data: Catalog, version: number): void {
  // Best effort: a full or blocked storage only costs the instant render on the next visit.
  writeJSON(KEYS.catalogCache, { ...data, version });
}

const cached = typeof window !== 'undefined' ? readCache() : null;

/** Latest-wins guard for concurrent fetches. */
let fetchSeq = 0;
/** Bumps whenever a save or a live refresh moves the catalog forward, so a slower, older load cannot roll it back. */
let commitSeq = 0;
/** Commits run one at a time, each on top of the previous result. */
let commitQueue: Promise<unknown> = Promise.resolve();
let live: LiveConnection | null = null;
/** Admin writes in flight that bump the catalog version (stock, orders), and the versions they produced. */
let ownWritesPending = 0;
const ownVersions = new Set<number>();

/**
 * Wraps an admin write that moves the catalog version outside `commit` (stock edits, order status
 * changes), so the version it produces is not reported as "updated on another device".
 */
export async function ownWrite<T>(run: () => Promise<T>, versionOf: (result: T) => number | undefined): Promise<T> {
  ownWritesPending++;
  try {
    const result = await run();
    const version = versionOf(result);
    if (version !== undefined) {
      ownVersions.add(version);
      void useCatalog.getState().refresh(version);
    }
    return result;
  } finally {
    ownWritesPending--;
  }
}

async function fetchSnapshot(path: string): Promise<Snapshot> {
  const raw = await api<unknown>(path, { retries: 2, timeoutMs: 12_000 });
  const snapshot = parseSnapshot(raw);
  if (!snapshot) throw new ApiError(500, 'invalid_catalog', 'O catálogo recebido está incompleto. Tente de novo.');
  return snapshot;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, base64 = ''] = dataUrl.split(',');
  const type = /data:([^;]+);/.exec(head ?? '')?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Uploads every new photo (data URL) and returns the catalog pointing at the stored copies. */
async function uploadPhotos(catalog: Catalog, onProgress?: (message: string) => void): Promise<Catalog> {
  const pending = new Set<string>();
  for (const p of catalog.products) for (const img of p.images) for (const src of [img.src, img.thumb]) if (src && isDataUrl(src)) pending.add(src);
  for (const c of catalog.collections) if (c.heroImage && isDataUrl(c.heroImage)) pending.add(c.heroImage);
  if (!pending.size) return catalog;
  const uploaded = new Map<string, string>();
  let done = 0;
  for (const src of pending) {
    onProgress?.(`Enviando fotos (${done + 1} de ${pending.size})…`);
    const blob = dataUrlToBlob(src);
    const { key } = await api<{ key: string }>('/api/admin/media', { body: blob, headers: { 'Content-Type': blob.type }, retries: 2, timeoutMs: 60_000 });
    uploaded.set(src, key);
    done++;
  }
  const swap = (src: string) => uploaded.get(src) ?? src;
  return {
    ...catalog,
    products: catalog.products.map((p) =>
      p.images.some((i) => uploaded.has(i.src) || (i.thumb && uploaded.has(i.thumb)))
        ? { ...p, images: p.images.map((i) => ({ ...i, src: swap(i.src), ...(i.thumb ? { thumb: swap(i.thumb) } : {}) })) }
        : p,
    ),
    collections: catalog.collections.map((c) => (c.heroImage && uploaded.has(c.heroImage) ? { ...c, heroImage: swap(c.heroImage) } : c)),
  };
}

/**
 * Sends the change set (one request: the server accepts a whole catalog).
 * Returns the new version and whether it directly follows `baseVersion`; if
 * another device wrote in between, the merged result has to be fetched.
 */
async function sendChanges(baseVersion: number, changes: Change[]): Promise<{ version: number; contiguous: boolean }> {
  let version = baseVersion;
  let contiguous = true;
  for (const chunk of chunkChanges(changes)) {
    const result = await api<{ version: number; from: number }>('/api/admin/changes', {
      json: { baseVersion: version, changes: chunk },
      headers: { 'Idempotency-Key': idempotencyKey() },
      retries: 2, // safe: the same key is reused on every attempt of this request
      timeoutMs: 45_000,
    });
    if (result.from !== version) contiguous = false;
    version = result.version;
  }
  return { version, contiguous };
}

export const useCatalog = create<CatalogStore>()((set, get) => ({
  data: cached ?? emptyCatalog(),
  version: cached?.version ?? 0,
  status: cached ? 'ready' : 'loading',
  offline: false,
  externalVersion: 0,
  leadsVersion: 0,
  ordersVersion: 0,

  load: async () => {
    const seq = ++fetchSeq;
    const commitsBefore = commitSeq;
    if (get().status === 'error') set({ status: 'loading' });
    try {
      const snapshot = await fetchSnapshot('/api/catalog');
      // The server is the truth (it may even be behind the cache after a restore), unless a local
      // save confirmed meanwhile or a newer fetch already answered.
      if (snapshot.version < get().version && (commitSeq !== commitsBefore || seq !== fetchSeq)) return;
      if (seq !== fetchSeq && snapshot.version <= get().version) return;
      const { version: _version, ...data } = snapshot;
      if (snapshot.version !== get().version || get().status !== 'ready') {
        const external = get().status === 'ready' && get().version > 0 && snapshot.version > get().version;
        set((s) => ({ data, version: snapshot.version, status: 'ready', offline: false, externalVersion: s.externalVersion + (external ? 1 : 0) }));
        writeCache(data, snapshot.version);
      } else {
        set({ offline: false });
      }
    } catch {
      if (get().status === 'ready') set({ offline: true });
      else set({ status: 'error' });
    }
  },

  refresh: async (version, opts = {}) => {
    const current = get().version;
    if (!opts.force && version !== undefined && version <= current) return;
    const status = get().status;
    if (status === 'loading') return; // the first load is in flight and brings the latest anyway
    if (status === 'error') return get().load();
    try {
      // A known version is fetched by its own URL: the answer is that version or newer, never older.
      const snapshot = await fetchSnapshot(version !== undefined ? `/api/catalog/v/${version}` : '/api/catalog');
      set({ offline: false });
      // Never go backwards: not behind the version asked for, not behind what is shown now.
      if (version !== undefined && snapshot.version < version) return;
      if (snapshot.version < get().version || (snapshot.version === get().version && !opts.force)) return;
      const { version: v, ...data } = snapshot;
      commitSeq++;
      // Our own stock/order writes (finished or still in flight) are not news from another device.
      const own = ownVersions.has(v) || ownWritesPending > 0;
      set((s) => ({ data, version: v, offline: false, externalVersion: s.externalVersion + (own ? 0 : 1) }));
      writeCache(data, v);
    } catch {
      set({ offline: true });
    }
  },

  commit: (update, opts = {}) => {
    const run = async (): Promise<SaveResult> => {
      const { data, version, status } = get();
      if (status !== 'ready' || version < 1) return { ok: false, code: 'not_ready', conflict: false, message: 'O catálogo ainda está carregando. Tente de novo em instantes.' };
      let next = update(data);
      const problem = validateCatalog(next);
      if (problem) return { ok: false, code: 'invalid', conflict: false, message: `Não foi possível salvar: ${problem}` };
      try {
        next = await uploadPhotos(next, opts.onProgress);
        const changes = diffCatalog(data, next);
        if (!changes.length) return { ok: true, version };
        opts.onProgress?.('Salvando…');
        const { version: newVersion, contiguous } = await sendChanges(version, changes);
        commitSeq++;
        if (contiguous) {
          // Nobody else wrote in between: what we sent is exactly the new version.
          if (newVersion > get().version) {
            set({ data: next, version: newVersion, offline: false });
            writeCache(next, newVersion);
          }
        } else {
          // Another device wrote in between (other items): show the server's merged catalog.
          await get().refresh(newVersion, { force: true });
        }
        return { ok: true, version: newVersion };
      } catch (error) {
        const conflict = error instanceof ApiError && error.status === 409;
        const code = error instanceof ApiError ? error.code : 'unknown';
        return { ok: false, code, conflict, message: errorMessage(error) };
      }
    };
    const result = commitQueue.then(run, run);
    commitQueue = result.catch(() => undefined);
    return result;
  },
}));

/** Starts loading the catalog and the live connection (once). */
export function startCatalog(): void {
  if (live || typeof window === 'undefined') return;
  void useCatalog.getState().load();
  let connections = 0;
  live = connectLive({
    onVersion: (version) => void useCatalog.getState().refresh(version),
    onLeads: () => useCatalog.setState((s) => ({ leadsVersion: s.leadsVersion + 1 })),
    onOrders: () => useCatalog.setState((s) => ({ ordersVersion: s.ordersVersion + 1 })),
    onConnected: () => {
      // After a reconnection, heal anything missed while disconnected (a 304 when nothing changed).
      // The first connection needs nothing: `hello` reports the version and the first load is fresh.
      if (connections++ > 0 && useCatalog.getState().status === 'ready') void useCatalog.getState().refresh();
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && useCatalog.getState().status === 'ready') void useCatalog.getState().refresh();
  });
}

/** Re-opens the live socket so the server sees the new admin session. */
export function reconnectLive(): void {
  live?.reconnect();
}
