import { useEffect } from 'react';

export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ÉKA Semijoias` : 'ÉKA Semijoias · Semijoias com acabamento impecável';
  }, [title]);
}
