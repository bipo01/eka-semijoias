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
  commit: (update: (data: CatalogState) => CatalogState, opts?: { customize?: boolean }) => StorageResult;
  /** Replaces the whole catalog (import / reset). */
  replace: (next: CatalogState) => StorageResult;
  reload: () => void;
}

function writeBlock(issue: CatalogLoadIssue): StorageResult | null {
  if (issue === 'unavailable') return failure('unavailable');
  if (issue === 'outdated') return failure('outdated');
  if (issue === 'corrupt-unsaved') return failure('blocked');
  return null;
}

const initial = loadCatalog();

export const useCatalog = create<CatalogStore>()((set, get) => ({
  data: initial.state,
  issue: initial.issue,
  ...(initial.corruptKey ? { corruptKey: initial.corruptKey } : {}),
  externalVersion: 0,
  commit: (update, opts = {}) => {
    const blocked = writeBlock(get().issue);
    if (blocked) return blocked;
    const updated = update(get().data);
    // Lead-only writes from the public site keep the catalog "uncustomized" so it follows the deployed seed.
    const next = opts.customize === false ? updated : { ...updated, customized: true };
    const result = saveCatalog(next);
    if (result.ok) set({ data: next, issue: get().issue === 'seeded' ? 'none' : get().issue });
    return result;
  },
  replace: (next) => {
    const blocked = writeBlock(get().issue);
    if (blocked) return blocked;
    const stored = { ...next, customized: true };
    const result = saveCatalog(stored);
    if (result.ok) set({ data: stored });
    return result;
  },
  reload: () => {
    const loaded = loadCatalog();
    set((s) => ({
      data: loaded.state,
      externalVersion: s.externalVersion + 1,
      ...(loaded.issue === 'outdated' || loaded.issue === 'corrupt-unsaved' ? { issue: loaded.issue } : {}),
    }));
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEYS.catalog && event.newValue != null) useCatalog.getState().reload();
  });
}
