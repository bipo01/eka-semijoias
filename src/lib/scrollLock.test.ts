import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockPageScroll, pageScrollY } from './scrollLock';

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
});
