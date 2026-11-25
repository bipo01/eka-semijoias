/*
 * What lies behind the current page in this tab's history, so "Voltar" can really go back (the
 * catalog comes back with its filters and scroll) and say where it goes. The browser does not
 * expose its history, so the app notes every navigation: each history entry (keyed by the
 * router's location key) remembers the entry before it. Entries from before a reload are unknown;
 * the back link then goes up the page's hierarchy instead.
 */

export type HistoryAction = 'PUSH' | 'REPLACE' | 'POP';

interface Entry {
  pathname: string;
  search: string;
  /** The key of the entry before this one in the tab's history, when known. */
  prev: string | null;
}

export interface BackStep {
  /** How many history entries to go back (filter changes on the same page are skipped). */
  steps: number;
  pathname: string;
  search: string;
}

interface Loc {
  key: string;
  pathname: string;
  search: string;
}

const MAX_ENTRIES = 200;
/** Never walk further than this through same-page entries (filters, variants). */
const MAX_STEPS = 30;

export function createNavHistory(initial: Loc) {
  const entries = new Map<string, Entry>();
  let current = initial.key;
  entries.set(initial.key, { pathname: initial.pathname, search: initial.search, prev: null });

  function remember(key: string, entry: Entry) {
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  }

  return {
    /** Called for every router state change; only a new location counts. */
    record(action: HistoryAction, loc: Loc) {
      if (loc.key === current) return;
      const at = { pathname: loc.pathname, search: loc.search };
      if (action === 'PUSH') remember(loc.key, { ...at, prev: current });
      // A replaced entry takes the place of the current one: same entry behind it.
      else if (action === 'REPLACE') remember(loc.key, { ...at, prev: entries.get(current)?.prev ?? null });
      // Back/forward: the entry was noted when it was created (unknown after a reload).
      else if (!entries.has(loc.key)) remember(loc.key, { ...at, prev: null });
      current = loc.key;
    },

    /** The first entry behind `key` on another page, or null when it is not known. */
    backFrom(key: string): BackStep | null {
      const here = entries.get(key);
      if (!here) return null;
      let prevKey = here.prev;
      for (let steps = 1; prevKey && steps <= MAX_STEPS; steps++) {
        const prev = entries.get(prevKey);
        if (!prev) return null;
        if (prev.pathname !== here.pathname) return { steps, pathname: prev.pathname, search: prev.search };
        prevKey = prev.prev;
      }
      return null;
    },
  };
}

export type NavHistory = ReturnType<typeof createNavHistory>;

let tracker: NavHistory | null = null;

interface RouterLike {
  state: { location: Loc; historyAction: HistoryAction | string };
  subscribe: (fn: (state: { location: Loc; historyAction: HistoryAction | string }) => void) => unknown;
}

/** Starts noting navigations. Subscribed before the app renders, so a page reads an up-to-date history. */
export function trackNavHistory(router: RouterLike) {
  const nav = createNavHistory(router.state.location);
  router.subscribe((state) => nav.record(state.historyAction as HistoryAction, state.location));
  tracker = nav;
}

export function backStepFrom(key: string): BackStep | null {
  return tracker?.backFrom(key) ?? null;
}
