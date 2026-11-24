import { afterEach, describe, expect, it } from 'vitest';
import { appForPath, applyAppHead, DISMISS_DAYS, detectPlatform, dismissKey, installMethod, isDismissed, rememberDismissed } from './install';

/** Real user agents (2025–2026 builds). */
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/138.3351.83 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.36.83 (iPhone15,3; iOS 18_5; pt_BR; pt; scale=3.00; 1290x2796; 761469043)',
  iphoneFacebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/123;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBID/phone;FBLC/pt_BR;FBOP/5]',
  androidInstagram:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.63 Mobile Safari/537.36 Instagram 389.0.0.49.87 Android (34/14; 450dpi; 1080x2340; samsung; SM-A546E; a54x; s5e8835; pt_BR; 761469043)',
  androidFacebook: 'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.63 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/520.0.0.47.109;]',
  androidWhatsApp: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 WhatsApp/2.25.20.80',
  androidLine: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 Line/15.10.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macSafari18: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macSafari16: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.3351.83',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
};

describe('detectPlatform', () => {
  it.each([
    ['iphoneSafari', 'ios-safari'],
    ['iphoneChrome', 'ios-chrome'],
    ['iphoneFirefox', 'ios-other'],
    ['iphoneEdge', 'ios-other'],
    ['androidChrome', 'android'],
    ['androidSamsung', 'android'],
    ['macSafari18', 'mac-safari'],
    ['macSafari16', 'unsupported'],
    ['macChrome', 'desktop'],
    ['windowsEdge', 'desktop'],
    ['macFirefox', 'unsupported'],
    ['windowsFirefox', 'unsupported'],
  ] as const)('%s → %s', (name, kind) => {
    expect(detectPlatform({ userAgent: UA[name], maxTouchPoints: name.startsWith('iphone') || name.startsWith('android') ? 5 : 0 }).kind).toBe(kind);
  });

  it('treats an iPad asking for the desktop site (Mac user agent with touch) as iOS Safari', () => {
    expect(detectPlatform({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 }).kind).toBe('ios-safari');
    expect(detectPlatform({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 0 }).kind).toBe('mac-safari');
  });

  it.each([
    ['iphoneInstagram', 'Instagram', true],
    ['iphoneFacebook', 'Facebook', true],
    ['androidInstagram', 'Instagram', false],
    ['androidFacebook', 'Facebook', false],
    ['androidWhatsApp', 'WhatsApp', false],
    ['androidLine', 'LINE', false],
  ] as const)('%s is an in-app browser (%s)', (name, app, ios) => {
    expect(detectPlatform({ userAgent: UA[name], maxTouchPoints: 5 })).toEqual({ kind: 'in-app', app, ios });
  });
});

describe('installMethod', () => {
  const ready = { canPrompt: true, installed: false };
  const noPrompt = { canPrompt: false, installed: false };

  it('shows nothing once installed', () => {
    expect(installMethod({ kind: 'android' }, { canPrompt: true, installed: true })).toEqual({ kind: 'none' });
    expect(installMethod({ kind: 'ios-safari' }, { canPrompt: false, installed: true })).toEqual({ kind: 'none' });
  });

  it('uses the native prompt on Android and desktop Chromium when the browser offers it', () => {
    expect(installMethod({ kind: 'android' }, ready)).toEqual({ kind: 'prompt' });
    expect(installMethod({ kind: 'desktop' }, ready)).toEqual({ kind: 'prompt' });
  });

  it('falls back to the browser menu on Android and hides on desktop without a prompt', () => {
    expect(installMethod({ kind: 'android' }, noPrompt)).toEqual({ kind: 'guide', guide: 'android-manual' });
    expect(installMethod({ kind: 'desktop' }, noPrompt)).toEqual({ kind: 'none' });
    expect(installMethod({ kind: 'unsupported' }, noPrompt)).toEqual({ kind: 'none' });
  });

  it('always guides on iPhone, in-app browsers and Safari on Mac (they never prompt)', () => {
    expect(installMethod({ kind: 'ios-safari' }, ready)).toEqual({ kind: 'guide', guide: 'ios-safari' });
    expect(installMethod({ kind: 'ios-chrome' }, noPrompt)).toEqual({ kind: 'guide', guide: 'ios-chrome' });
    expect(installMethod({ kind: 'ios-other' }, noPrompt)).toEqual({ kind: 'guide', guide: 'ios-other' });
    expect(installMethod({ kind: 'in-app', app: 'Instagram', ios: false }, ready)).toEqual({ kind: 'guide', guide: 'in-app' });
    expect(installMethod({ kind: 'mac-safari' }, noPrompt)).toEqual({ kind: 'guide', guide: 'mac-safari' });
  });
});

describe('dismissal memory', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 23, 12);

  it('hides the invitation for 30 days after "Agora não", per app', () => {
    expect(isDismissed('store', now)).toBe(false);
    expect(rememberDismissed('store', now)).toBe(true);
    expect(localStorage.getItem(dismissKey('store'))).toBe(String(now));
    expect(isDismissed('store', now + DAY)).toBe(true);
    expect(isDismissed('store', now + (DISMISS_DAYS - 1) * DAY)).toBe(true);
    expect(isDismissed('store', now + DISMISS_DAYS * DAY)).toBe(false);
    expect(isDismissed('admin', now + DAY)).toBe(false);
  });

  it('ignores garbage and far-future timestamps', () => {
    localStorage.setItem(dismissKey('store'), 'banana');
    expect(isDismissed('store', now)).toBe(false);
    localStorage.setItem(dismissKey('store'), String(now + 365 * DAY));
    expect(isDismissed('store', now)).toBe(false);
  });

  it('survives storage that throws (private mode, blocked site data)', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(isDismissed('store', now, broken)).toBe(false);
    expect(rememberDismissed('store', now, broken)).toBe(false);
    expect(rememberDismissed('store', now, null)).toBe(false);
  });
});

describe('applyAppHead', () => {
  const head = () => ({
    manifest: document.head.querySelector('link[rel="manifest"]')?.getAttribute('href'),
    icon: document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
    title: document.head.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content'),
  });

  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('leaving a panel served with its own tags (by the Worker) names the page after the store again', () => {
    document.head.innerHTML =
      '<link rel="manifest" href="/admin.webmanifest"><link rel="apple-touch-icon" href="/admin-apple-touch-icon.png"><meta name="apple-mobile-web-app-title" content="Painel ÉKA">';
    const restore = applyAppHead('admin');
    expect(head()).toEqual({ manifest: '/admin.webmanifest', icon: '/admin-apple-touch-icon.png', title: 'Painel ÉKA' });
    restore();
    expect(head()).toEqual({ manifest: '/manifest.webmanifest', icon: '/apple-touch-icon.png', title: 'ÉKA' });
  });

  it('points the page at the panel app and restores the store tags on leaving', () => {
    document.head.innerHTML =
      '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="apple-mobile-web-app-title" content="ÉKA">';
    const restore = applyAppHead('admin');
    expect(head()).toEqual({ manifest: '/admin.webmanifest', icon: '/admin-apple-touch-icon.png', title: 'Painel ÉKA' });
    restore();
    expect(head()).toEqual({ manifest: '/manifest.webmanifest', icon: '/apple-touch-icon.png', title: 'ÉKA' });
  });

  it('creates missing tags and removes them again', () => {
    const restore = applyAppHead('admin');
    expect(head()).toEqual({ manifest: '/admin.webmanifest', icon: '/admin-apple-touch-icon.png', title: 'Painel ÉKA' });
    restore();
    expect(document.head.children).toHaveLength(0);
  });

  it('is safe to apply twice and undo in order (React StrictMode re-runs effects)', () => {
    document.head.innerHTML = '<link rel="manifest" href="/manifest.webmanifest">';
    const first = applyAppHead('admin');
    first();
    const second = applyAppHead('admin');
    expect(head().manifest).toBe('/admin.webmanifest');
    second();
    expect(head()).toEqual({ manifest: '/manifest.webmanifest', icon: undefined, title: undefined });
  });
});

describe('appForPath', () => {
  it('maps each page to its installable app', () => {
    expect(appForPath('/')).toBe('store');
    expect(appForPath('/catalogo')).toBe('store');
    expect(appForPath('/admin')).toBe('admin');
    expect(appForPath('/admin/')).toBe('admin');
    expect(appForPath('/admin/pedidos')).toBe('admin');
    expect(appForPath('/administrar')).toBe('store');
    expect(appForPath('/revenda')).toBe('reseller');
    expect(appForPath('/revenda/convite/abc')).toBe('reseller');
    expect(appForPath('/r/bruna')).toBe('store');
  });
});
