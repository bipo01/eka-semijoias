import { create } from 'zustand';
import type { CatalogState } from '../data/schema';
import {
  failure,
  KEYS,
  loadCatalog,
  saveCatalog,
  type CatalogLoadIssue,
  type StorageResult,
} from '../data/storage';

interface CatalogStore {
  data: CatalogState;
  issue: CatalogLoadIssue;
  corruptKey?: string;
  /** Bumps when another tab changed the catalog underneath this one. */
  externalVersion: number;
  /**
   * Applies an immutable update and persists it. The in-memory state only
   * changes when the write succeeds, so a failed save never loses the form.
   */
  commit: (update: (data: CatalogState) => CatalogState) => StorageResult;
  /** Replaces the whole catalog (import / reset). */
  replace: (next: CatalogState) => StorageResult;
  reload: () => void;
}

const initial = loadCatalog();

export const useCatalog = create<CatalogStore>()((set, get) => ({
  data: initial.state,
  issue: initial.issue,
  ...(initial.corruptKey ? { corruptKey: initial.corruptKey } : {}),
  externalVersion: 0,
  commit: (update) => {
    if (get().issue === 'unavailable') return failure('unavailable');
    const next = update(get().data);
    const result = saveCatalog(next);
    if (result.ok) set({ data: next });
    return result;
  },
  replace: (next) => {
    if (get().issue === 'unavailable') return failure('unavailable');
    const result = saveCatalog(next);
    if (result.ok) set({ data: next });
    return result;
  },
  reload: () => {
    const loaded = loadCatalog();
    set((s) => ({ data: loaded.state, externalVersion: s.externalVersion + 1 }));
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEYS.catalog && event.newValue != null) useCatalog.getState().reload();
  });
}
