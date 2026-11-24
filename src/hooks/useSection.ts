import { useEffect, useMemo, useState } from 'react';
import { defaultSections, factsOf, resolveSection, type ContentFacts } from '../content/defaults';
import type { SectionId, Sections } from '../data/content';
import { useCatalog } from '../store/catalog';

/*
 * Site content as the visitor sees it: the owner's saved section, or the
 * built-in text for the current business facts (src/content/defaults.ts).
 * Updates live when the catalog changes (WebSocket notice → refetch).
 */

/** Business facts the built-in texts depend on. */
export function useContentFacts(): ContentFacts {
  const settings = useCatalog((s) => s.data.settings);
  const content = useCatalog((s) => s.data.content);
  return useMemo(() => factsOf(settings, content), [settings, content]);
}

/** One section, ready to render. */
export function useSection<K extends SectionId>(id: K): Sections[K] {
  const content = useCatalog((s) => s.data.content);
  const facts = useContentFacts();
  return useMemo(() => resolveSection(id, content, facts), [id, content, facts]);
}

/**
 * Whether the saved texts are known, for pages opened straight from a link outside the store layout
 * (payment, reseller panel): false only while the very first catalog load is in flight, so the
 * owner's text never replaces the built-in one in front of the visitor. A failed load (built-in
 * text) or one slower than `maxWaitMs` lets the page show: a slow network never holds it.
 */
export function useSectionsReady(maxWaitMs = 4000): boolean {
  const loading = useCatalog((s) => s.status === 'loading');
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setWaited(true), maxWaitMs);
    return () => window.clearTimeout(timer);
  }, [loading, maxWaitMs]);
  return !loading || waited;
}

/** Whether the owner saved her own version of a section (false = built-in text). */
export function useSectionEdited(id: SectionId): boolean {
  return useCatalog((s) => s.data.content?.[id] !== undefined);
}

/** The built-in text of a section for the current facts ("Restaurar o original" preview, editor start). */
export function useDefaultSection<K extends SectionId>(id: K): Sections[K] {
  const facts = useContentFacts();
  return useMemo(() => defaultSections(facts)[id], [id, facts]);
}
