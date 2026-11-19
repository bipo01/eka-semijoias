import { create } from 'zustand';

export type ToastTone = 'neutral' | 'success' | 'error';
export interface ToastAction {
  label: string;
  /** Route to navigate to, or a callback. */
  to?: string;
  onClick?: () => void;
}
export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  duration: number;
}

export type Panel = 'menu' | 'bag' | 'search' | null;

interface UiState {
  toasts: Toast[];
  panel: Panel;
  /** Count of open dialogs (sheets, modals) so floating UI can step aside. */
  openDialogs: number;
  toast: (message: string, opts?: { tone?: ToastTone; action?: ToastAction; duration?: number }) => number;
  dismissToast: (id: number) => void;
  openPanel: (panel: Exclude<Panel, null>) => void;
  closePanel: () => void;
  dialogOpened: () => void;
  dialogClosed: () => void;
}

let nextToastId = 1;

export const useUi = create<UiState>()((set) => ({
  toasts: [],
  panel: null,
  openDialogs: 0,
  toast: (message, opts = {}) => {
    const id = nextToastId++;
    const toast: Toast = {
      id,
      message,
      tone: opts.tone ?? 'neutral',
      duration: opts.duration ?? (opts.tone === 'error' ? 8000 : opts.action ? 6000 : 3500),
      ...(opts.action ? { action: opts.action } : {}),
    };
    set((s) => ({ toasts: [...s.toasts.slice(-2), toast] }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
  dialogOpened: () => set((s) => ({ openDialogs: s.openDialogs + 1 })),
  dialogClosed: () => set((s) => ({ openDialogs: Math.max(0, s.openDialogs - 1) })),
}));

export const toast = (...args: Parameters<UiState['toast']>) => useUi.getState().toast(...args);
