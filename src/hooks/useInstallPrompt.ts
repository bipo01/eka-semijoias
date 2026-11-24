import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { detectPlatform, installMethod, isDismissed, rememberDismissed, type InstallApp, type InstallMethod, type InstallPlatform } from '../lib/install';

/** Chromium's install prompt event (not in the DOM typings). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface InstallState {
  canPrompt: boolean;
  /** The browser's prompt was opened and closed without installing (it can be opened once per event). */
  promptSpent: boolean;
  installed: boolean;
  /** Bumped on every "Agora não", so every install button on the page hides at once. */
  dismissals: number;
}

// Module state: `beforeinstallprompt` can fire before any install button is on screen (the menu
// renders its content only while open), so the event is captured once for the whole page.
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let promptSpent = false;
let listening = false;
/** Dismissed this session (also covers browsers that refuse localStorage). */
const dismissedNow = new Set<InstallApp>();
let snapshot: InstallState = { canPrompt: false, promptSpent: false, installed: false, dismissals: 0 };
const subscribers = new Set<() => void>();

const STANDALONE = '(display-mode: standalone)';

/** Running as an installed app (Android/desktop display mode, or iOS home-screen web app). */
export function isStandalone(): boolean {
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia(STANDALONE).matches) return true;
  } catch {
    /* very old engines */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function refresh(dismissals = snapshot.dismissals) {
  const next = { canPrompt: deferred !== null, promptSpent, installed: installedNow || isStandalone(), dismissals };
  if (
    next.canPrompt !== snapshot.canPrompt ||
    next.promptSpent !== snapshot.promptSpent ||
    next.installed !== snapshot.installed ||
    next.dismissals !== snapshot.dismissals
  ) {
    snapshot = next;
    for (const notify of subscribers) notify();
  }
}

/** Starts capturing the install events; idempotent. Called from main.tsx before the first render. */
export function listenForInstallPrompt(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // no mini-infobar; the "Instalar o app" button opens the prompt
    deferred = event as BeforeInstallPromptEvent;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    refresh();
  });
  try {
    window.matchMedia?.(STANDALONE).addEventListener?.('change', () => refresh());
  } catch {
    /* no display-mode media query */
  }
  refresh();
}

function subscribe(notify: () => void) {
  listenForInstallPrompt();
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

const getSnapshot = () => snapshot;
const serverSnapshot: InstallState = { canPrompt: false, promptSpent: false, installed: false, dismissals: 0 };
const getServerSnapshot = () => serverSnapshot;

/** Opens the browser's install prompt (single use, as the browser allows). */
async function showBrowserPrompt(): Promise<PromptOutcome> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') installedNow = true;
    else promptSpent = true;
    return outcome;
  } catch {
    promptSpent = true;
    return 'unavailable';
  } finally {
    refresh();
  }
}

function dismissApp(app: InstallApp) {
  rememberDismissed(app); // if storage is blocked, the session set still hides it until the next visit
  dismissedNow.add(app);
  refresh(snapshot.dismissals + 1);
}

/** Test hook: forget captured events and dismissals made this session. */
export function resetInstallStateForTests(): void {
  deferred = null;
  installedNow = false;
  promptSpent = false;
  dismissedNow.clear();
  snapshot = { canPrompt: false, promptSpent: false, installed: false, dismissals: 0 };
  refresh();
}

export interface InstallPrompt {
  platform: InstallPlatform;
  /** What the button does; `none` hides it (installed, unsupported, or dismissed in the last 30 days). */
  method: InstallMethod;
  installed: boolean;
  promptInstall: () => Promise<PromptOutcome>;
  /** "Agora não": hide the invitation for 30 days. */
  dismiss: () => void;
}

export function useInstallPrompt(app: InstallApp = 'store'): InstallPrompt {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const platform = useMemo(() => detectPlatform({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when a dismissal happens anywhere on the page
  const dismissed = useMemo(() => dismissedNow.has(app) || isDismissed(app), [app, state.dismissals]);
  const dismiss = useCallback(() => dismissApp(app), [app]);

  // Closing the browser's window is not "Agora não": the button stays. Chrome usually offers the prompt
  // again right away; until it does, the button opens the step-by-step guide.
  const promptInstall = useCallback(() => showBrowserPrompt(), []);

  const method = dismissed ? ({ kind: 'none' } as const) : installMethod(platform, state);
  return { platform, method, installed: state.installed, promptInstall, dismiss };
}
