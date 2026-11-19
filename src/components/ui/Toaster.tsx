import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useUi, type Toast } from '../../store/ui';
import { cx } from './cx';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  const closePanel = useUi((s) => s.closePanel);
  const navigate = useNavigate();
  useEffect(() => {
    const t = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.duration, dismiss]);
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'pointer-events-auto flex min-h-12 w-full items-center gap-3 rounded-[12px] py-2 pr-2 pl-4 text-sm shadow-[var(--shadow-1)]',
        toast.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-on-dark',
      )}
    >
      <p className="flex-1 py-1">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-full px-3 font-medium text-rose-light underline underline-offset-4 hover:bg-white/10"
          onClick={() => {
            dismiss(toast.id);
            toast.action?.onClick?.();
            if (toast.action?.to) {
              closePanel();
              navigate(toast.action.to);
            }
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label="Fechar aviso" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10" onClick={() => dismiss(toast.id)}>
        <X size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/** Toasts live in a polite live region above floating UI (FAB, sticky buy bar). */
export function Toaster({ raised }: { raised?: boolean }) {
  const toasts = useUi((s) => s.toasts);
  const openDialogs = useUi((s) => s.openDialogs);
  // A modal <dialog> makes the rest of the page inert, so toasts render inside the topmost open one.
  const container = useMemo(() => {
    const open = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
    return openDialogs > 0 && open.length ? open[open.length - 1]! : document.body;
  }, [openDialogs]);
  return createPortal(
    <div
      aria-live="polite"
      className={cx(
        'pointer-events-none fixed inset-x-0 z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4',
        raised ? 'bottom-[calc(80px+var(--safe-bottom))]' : 'bottom-[calc(16px+var(--safe-bottom))]',
      )}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>,
    container,
  );
}
