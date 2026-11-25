import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyboardArea, lockPageScroll, pageScrollY } from './scrollLock';

function pointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }));
}

describe('page scroll lock under sheets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pins the body on touch screens and gives the scroll back when the last sheet closes', () => {
    pointer(true);
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const first = lockPageScroll();
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-640px');
    // While pinned, window.scrollY reads 0 in the browser: the page's real place is still known.
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    expect(pageScrollY()).toBe(640);
    const second = lockPageScroll(); // a sheet over a sheet
    second();
    expect(document.body.style.position).toBe('fixed');
    first();
    first(); // twice is harmless
    expect(document.body.style.position).toBe('');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 640 });
  });

  it('leaves mouse screens alone (their scrollbar would jump)', () => {
    pointer(false);
    const release = lockPageScroll();
    expect(document.body.style.position).toBe('');
    release();
  });

  it('publishes the area the keyboard leaves visible while a sheet is open, and clears it after', () => {
    pointer(true);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const listeners = new Map<string, () => void>();
    const vv = { height: 714, offsetTop: 0, addEventListener: (t: string, f: () => void) => listeners.set(t, f), removeEventListener: (t: string) => listeners.delete(t) };
    vi.stubGlobal('visualViewport', vv);
    const setInner = (h: number) => Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
    setInner(714);
    const release = lockPageScroll();
    const root = document.documentElement.style;
    const vars = () => [root.getPropertyValue('--kb'), root.getPropertyValue('--vot'), root.getPropertyValue('--vvh')];
    expect(vars()).toEqual(['', '', '']);
    // Measured on iPhone 17 (iOS 26.5). The search opens focused: the window keeps its height and the
    // keyboard covers its bottom.
    vv.height = 377;
    listeners.get('resize')!();
    expect(vars()).toEqual(['337px', '0px', '377px']);
    // A tap on the price filter: Safari shrinks the window to 438 and scrolls (offsetTop 276).
    setInner(438);
    vv.height = 404;
    vv.offsetTop = 276;
    listeners.get('scroll')!();
    expect(vars()).toEqual(['0px', '34px', '404px']);
    // Only Safari's toolbar moving is not a keyboard.
    setInner(714);
    vv.height = 670;
    vv.offsetTop = 0;
    listeners.get('resize')!();
    expect(vars()).toEqual(['', '', '']);
    expect(keyboardArea(714)).toBeNull();
    vv.height = 377;
    listeners.get('resize')!();
    release();
    expect(vars()).toEqual(['', '', '']);
    expect(listeners.size).toBe(0);
  });
});
