import { createContext, useContext, useInsertionEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx } from '../components/ui/cx';

/*
 * A detail screen (a piece, an order, a reseller…) is a page inside the panel, never a layer over it:
 * the sidebar (desktop) and the bottom bar (phone) stay, and the panel's header turns into
 * "← <parent>" + the detail's title. Pages declare that header with <DetailPage>; the list behind it
 * stays mounted (hidden) so its filters, search and scroll survive the round trip.
 */

export interface DetailHeader {
  title: string;
  /** Where "Voltar" goes: the parent route. */
  backTo: string;
  /** The parent's name ("Produtos"). */
  backLabel: string;
}

type Setter = (header: DetailHeader | null) => void;
export const DetailHeaderContext = createContext<Setter>(() => {});

/** Puts this detail's title and back link in the panel header while it is shown. */
export function useDetailHeader(header: DetailHeader) {
  const set = useContext(DetailHeaderContext);
  const { title, backTo, backLabel } = header;
  useLayoutEffect(() => {
    set({ title, backTo, backLabel });
  }, [set, title, backTo, backLabel]);
  useLayoutEffect(() => () => set(null), [set]);
}

/** `label` names the page region for assistive tech (defaults to the title). */
export function DetailPage({ header, label, children, footer, className }: { header: DetailHeader; label?: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  useDetailHeader(header);
  return (
    <section aria-label={label ?? header.title} className={cx('mx-auto w-full max-w-[760px]', className)}>
      {children}
      {footer && (
        // Pinned above the phone's bottom bar (64 px) and at the bottom of the window on desktop.
        <div className="sticky bottom-[calc(64px+var(--safe-bottom))] z-10 -mx-4 mt-6 border-t border-line bg-ivory px-4 py-3 shadow-[0_-8px_20px_-14px_rgb(48_33_28/0.35)] lg:bottom-0 lg:-mx-6 lg:px-6">
          {footer}
        </div>
      )}
    </section>
  );
}

/**
 * Keeps a list's place while one of its items is open: the window scroll is read right before the
 * detail replaces the list (an insertion effect runs before the DOM changes), the detail starts at
 * the top, and the list comes back where it was.
 */
export function useListPlace(detailOpen: boolean) {
  const saved = useRef(0);
  const first = useRef(true);
  useInsertionEffect(() => {
    if (detailOpen) saved.current = window.scrollY;
  }, [detailOpen]);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (detailOpen) {
      window.scrollTo({ top: 0 });
      return;
    }
    window.scrollTo({ top: saved.current });
  }, [detailOpen]);
}
