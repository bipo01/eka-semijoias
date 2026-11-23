import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useUi } from '../../store/ui';
import { IconButton } from './Button';
import { cx } from './cx';

export type SheetSide = 'bottom' | 'left' | 'right' | 'center' | 'full';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Visually hide the title (it still labels the dialog). */
  hideTitle?: boolean;
  side?: SheetSide;
  /** Extra class on the dialog, e.g. 'md-right' to become a drawer on tablets/desktop. */
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  /** Element to focus on open (defaults to the dialog's first focusable). */
  initialFocus?: React.RefObject<HTMLElement | null>;
}

/**
 * Modal sheet on top of the native <dialog> element: it provides the focus
 * trap, inert background, Esc handling and focus return.
 */
export function Sheet({ open, onClose, title, hideTitle, side = 'bottom', className, children, footer, headerExtra, initialFocus }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dialogOpened = useUi((s) => s.dialogOpened);
  const dialogClosed = useUi((s) => s.dialogClosed);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  // Keep the content mounted while the exit transition plays.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      dialog.showModal();
      dialogOpened();
      // showModal() focuses the first button (the close X), which Safari draws with a focus ring.
      // Focus the requested field, or the sheet itself; Tab still reaches the controls.
      (initialFocus?.current ?? contentRef.current)?.focus({ preventScroll: true });
      return () => {
        dialog.close();
        dialogClosed();
        if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
      };
    }
  }, [open, dialogOpened, dialogClosed, initialFocus]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cx('sheet', `sheet-${side}`, className)}
      onCancel={(e) => {
        // Esc closes the topmost sheet only: React propagates `cancel` through the component tree,
        // so a sheet opened from inside another would otherwise close its parent too.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onCloseRef.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      {(open || mounted) && (
        <div ref={contentRef} tabIndex={-1} className={cx('flex max-h-[inherit] flex-col outline-none', side !== 'center' && 'h-full')} style={side === 'center' ? { maxHeight: 'calc(100dvh - 32px)' } : undefined}>
          {side === 'bottom' && <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line md:hidden" />}
          <div className={cx('flex shrink-0 items-center gap-2 px-5 pt-3 pb-2', hideTitle && 'justify-end')}>
            <h2 id={titleId} className={cx('font-display text-display-m flex-1', hideTitle && 'sr-only')}>
              {title}
            </h2>
            {headerExtra}
            <IconButton label="Fechar" onClick={() => onCloseRef.current()} className="-mr-2">
              <X size={22} strokeWidth={1.5} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
          {footer && <div className="shrink-0 border-t border-line bg-ivory px-5 pt-3 pb-[calc(12px+var(--safe-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
