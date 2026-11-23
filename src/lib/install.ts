/**
 * Installable app (PWA): platform detection, the install method for each platform and the
 * "not now" memory. Pure functions; the browser wiring lives in src/hooks/useInstallPrompt.ts.
 */

/** Which installable app a page offers: the store ("/") or the owner's panel ("/admin"). */
export type InstallApp = 'store' | 'admin';

export type InAppBrowser = 'Instagram' | 'Facebook' | 'WhatsApp' | 'LINE' | 'TikTok';

export type InstallPlatform =
  /** iPhone/iPad Safari: Share → Adicionar à Tela de Início. */
  | { kind: 'ios-safari' }
  /** Chrome on iPhone (CriOS): share icon in the address bar → Adicionar à Tela de Início. */
  | { kind: 'ios-chrome' }
  /** Firefox, Edge and other iPhone browsers (all WebKit): browser menu → Compartilhar → Adicionar à Tela de Início. */
  | { kind: 'ios-other' }
  /** Instagram/Facebook/WhatsApp/LINE/TikTok in-app browsers: cannot install; open in Safari/Chrome. */
  | { kind: 'in-app'; app: InAppBrowser; ios: boolean }
  /** Safari 17+ on macOS (Sonoma): File → Adicionar ao Dock. */
  | { kind: 'mac-safari' }
  /** Android browsers: native prompt when offered, otherwise the browser menu. */
  | { kind: 'android' }
  /** Desktop Chromium (Chrome, Edge…): native prompt only. */
  | { kind: 'desktop' }
  | { kind: 'unsupported' };

export type InstallGuide = 'ios-safari' | 'ios-chrome' | 'ios-other' | 'in-app' | 'mac-safari' | 'android-manual';

export type InstallMethod = { kind: 'prompt' } | { kind: 'guide'; guide: InstallGuide } | { kind: 'none' };

export interface DeviceInfo {
  userAgent: string;
  /** navigator.maxTouchPoints: iPadOS 13+ reports a Mac user agent but has touch. */
  maxTouchPoints?: number;
}

const IN_APP: ReadonlyArray<[RegExp, InAppBrowser]> = [
  [/\bInstagram\b/i, 'Instagram'],
  [/\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bFBIOS\b/, 'Facebook'],
  [/\bWhatsApp\b/i, 'WhatsApp'],
  [/\bLine\//, 'LINE'],
  [/\bBytedanceWebview\b|\bmusical_ly\b|\bTikTok\b/i, 'TikTok'],
];

export function detectPlatform({ userAgent: ua, maxTouchPoints = 0 }: DeviceInfo): InstallPlatform {
  const ios = /\b(iPhone|iPad|iPod)\b/.test(ua) || (/\bMacintosh\b/.test(ua) && maxTouchPoints > 1);
  const android = /\bAndroid\b/.test(ua);

  for (const [pattern, app] of IN_APP) if (pattern.test(ua)) return { kind: 'in-app', app, ios };

  if (ios) {
    if (/\bCriOS\//.test(ua)) return { kind: 'ios-chrome' };
    if (/\b(FxiOS|EdgiOS|OPiOS|OPT|GSA|YaBrowser|DuckDuckGo)\//.test(ua)) return { kind: 'ios-other' };
    if (/\bVersion\/[\d.]+.*\bSafari\//.test(ua)) return { kind: 'ios-safari' };
    return { kind: 'ios-other' };
  }
  if (android) return { kind: 'android' };

  const chromium = /\b(Chrome|Chromium|Edg|OPR|SamsungBrowser)\//.test(ua);
  if (/\bMacintosh\b/.test(ua) && !chromium && !/\bFirefox\//.test(ua)) {
    const version = /\bVersion\/(\d+)/.exec(ua);
    if (version && /\bSafari\//.test(ua) && Number(version[1]) >= 17) return { kind: 'mac-safari' };
    return { kind: 'unsupported' };
  }
  if (chromium) return { kind: 'desktop' };
  return { kind: 'unsupported' };
}

/**
 * How to offer installation. iPhone, in-app browsers and macOS Safari never fire
 * `beforeinstallprompt`, so their guide wins; elsewhere the native prompt is used when the browser
 * offered one; Android without it gets the browser-menu guide; anything else shows nothing.
 */
export function installMethod(platform: InstallPlatform, { canPrompt, installed }: { canPrompt: boolean; installed: boolean }): InstallMethod {
  if (installed) return { kind: 'none' };
  switch (platform.kind) {
    case 'ios-safari':
    case 'ios-chrome':
    case 'ios-other':
    case 'in-app':
    case 'mac-safari':
      return { kind: 'guide', guide: platform.kind };
    case 'android':
      return canPrompt ? { kind: 'prompt' } : { kind: 'guide', guide: 'android-manual' };
    case 'desktop':
    case 'unsupported':
      return canPrompt ? { kind: 'prompt' } : { kind: 'none' };
  }
}

/** "Agora não": the invitation stays hidden for this long after a dismissal. */
export const DISMISS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function dismissKey(app: InstallApp): string {
  return `eka:install-dismissed:${app}:v1`;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** True while a dismissal younger than DISMISS_DAYS is on record. Unreadable storage counts as not dismissed. */
export function isDismissed(app: InstallApp, now = Date.now(), storage: StorageLike | null = defaultStorage()): boolean {
  try {
    const raw = storage?.getItem(dismissKey(app));
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at) || at > now + DAY_MS) return false; // garbage or a clock far in the future
    return now - at < DISMISS_DAYS * DAY_MS;
  } catch {
    return false;
  }
}

/** Records a dismissal; returns false when the browser refuses storage (private mode, blocked). */
export function rememberDismissed(app: InstallApp, now = Date.now(), storage: StorageLike | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(dismissKey(app), String(now));
    return true;
  } catch {
    return false;
  }
}

export function clearDismissed(app: InstallApp, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(dismissKey(app));
  } catch {
    /* nothing to clear */
  }
}

/** Head tags that identify the installable app on a page (manifest, iOS icon and name). */
export const APP_HEAD: Record<InstallApp, { manifest: string; appleTouchIcon: string; appleTitle: string }> = {
  store: { manifest: '/manifest.webmanifest', appleTouchIcon: '/apple-touch-icon.png', appleTitle: 'ÉKA' },
  admin: { manifest: '/admin.webmanifest', appleTouchIcon: '/admin-apple-touch-icon.png', appleTitle: 'Painel ÉKA' },
};

function headElement<T extends HTMLElement>(doc: Document, selector: string, create: () => T): { el: T; created: boolean } {
  const found = doc.head.querySelector<T>(selector);
  if (found) return { el: found, created: false };
  const el = create();
  doc.head.appendChild(el);
  return { el, created: true };
}

/**
 * Points the page's manifest, apple-touch-icon and iOS home-screen title at `app`.
 * Returns a function that puts the previous values back (used when leaving /admin).
 */
export function applyAppHead(app: InstallApp, doc: Document = document): () => void {
  const target = APP_HEAD[app];
  const restores: Array<() => void> = [];

  const swapAttr = <T extends HTMLElement>(selector: string, create: () => T, attr: string, value: string) => {
    const { el, created } = headElement(doc, selector, create);
    const previous = el.getAttribute(attr);
    el.setAttribute(attr, value);
    restores.push(() => {
      if (created) el.remove();
      else if (previous === null) el.removeAttribute(attr);
      else el.setAttribute(attr, previous);
    });
  };

  swapAttr('link[rel="manifest"]', () => Object.assign(doc.createElement('link'), { rel: 'manifest' }), 'href', target.manifest);
  swapAttr('link[rel="apple-touch-icon"]', () => Object.assign(doc.createElement('link'), { rel: 'apple-touch-icon' }), 'href', target.appleTouchIcon);
  swapAttr(
    'meta[name="apple-mobile-web-app-title"]',
    () => {
      const meta = doc.createElement('meta');
      meta.name = 'apple-mobile-web-app-title';
      return meta;
    },
    'content',
    target.appleTitle,
  );

  return () => {
    for (const restore of restores.reverse()) restore();
  };
}
