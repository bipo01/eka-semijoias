import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../components/ui/cx';
import { pageScrollY } from '../lib/scrollLock';

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

/**
 * Publishes the pinned footer's height as `--detail-footer` on the root while it is shown: toasts
 * (src/components/ui/Toaster.tsx) rise above it, so "Foto removida · Desfazer" never covers "Salvar".
 */
function useFooterHeight(footer: HTMLDivElement | null) {
  useLayoutEffect(() => {
    if (!footer) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--detail-footer', `${Math.round(footer.getBoundingClientRect().height)}px`);
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(footer);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--detail-footer');
    };
  }, [footer]);
}

/** `label` names the page region for assistive tech (defaults to the title). */
export function DetailPage({ header, label, children, footer, className }: { header: DetailHeader; label?: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  useDetailHeader(header);
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  useFooterHeight(footerEl);
  return (
    <section aria-label={label ?? header.title} className={cx('mx-auto w-full max-w-[760px]', className)}>
      {children}
      {footer && (
        // Pinned above the phone's bottom bar (64 px) and at the bottom of the window on desktop.
        <div ref={setFooterEl} className="sticky bottom-[calc(64px+var(--safe-bottom))] z-10 -mx-4 mt-6 border-t border-line bg-ivory px-4 py-3 shadow-[0_-8px_20px_-14px_rgb(48_33_28/0.35)] lg:bottom-0 lg:-mx-6 lg:px-6">
          {footer}
        </div>
      )}
    </section>
  );
}

/**
 * Keeps a list's place while one of its items is open: the window scroll is noted on every scroll and
 * at the very tap that opens an item (a capturing click listener runs before the app navigates, so
 * the page has not shrunk yet), the detail starts at the top, and the list comes back where it was.
 * Reading it in an effect was too late: a short detail had already shrunk the page and clamped it.
 */
export function useListPlace(detailOpen: boolean) {
  const saved = useRef(0);
  const open = useRef(detailOpen);
  useEffect(() => {
    // pageScrollY: while a sheet pins the body (touch screens) window.scrollY reads 0.
    const note = () => {
      if (!open.current) saved.current = pageScrollY();
    };
    window.addEventListener('scroll', note, { passive: true });
    window.addEventListener('click', note, true);
    return () => {
      window.removeEventListener('scroll', note);
      window.removeEventListener('click', note, true);
    };
  }, []);
  const first = useRef(true);
  useLayoutEffect(() => {
    open.current = detailOpen;
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: detailOpen ? 0 : saved.current });
  }, [detailOpen]);
}
