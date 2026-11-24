import { useEffect } from 'react';
import { useSection } from './useSection';

/** "<title> · ÉKA Semijoias"; without a title (home), the site title from Painel → Site → Google e compartilhamento. */
export function useDocumentTitle(title: string | null) {
  const siteTitle = useSection('compartilhar').title;
  useEffect(() => {
    document.title = title ? `${title} · ÉKA Semijoias` : siteTitle;
  }, [title, siteTitle]);
}
