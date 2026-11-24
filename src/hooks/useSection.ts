import { useMemo } from 'react';
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

/** Whether the owner saved her own version of a section (false = built-in text). */
export function useSectionEdited(id: SectionId): boolean {
  return useCatalog((s) => s.data.content?.[id] !== undefined);
}

/** The built-in text of a section for the current facts ("Restaurar o original" preview, editor start). */
export function useDefaultSection<K extends SectionId>(id: K): Sections[K] {
  const facts = useContentFacts();
  return useMemo(() => defaultSections(facts)[id], [id, facts]);
}
