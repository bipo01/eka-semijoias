/*
 * Freezes the page under an open sheet on touch screens.
 *
 * iOS Safari scrolls the document to bring a focused field above the keyboard, and the open sheet
 * (fixed, in the top layer) rode along with it: the strip between the sheet and the keyboard showed
 * the page behind ("Registrar entrada" over the Estoque list). `overflow: hidden` on the root does not
 * stop that in Safari; pinning the body with `position: fixed` does. The scroll position is kept and
 * given back when the last sheet closes. Mouse screens are left alone (their scrollbar would jump).
 */

let locks = 0;
let savedY = 0;

const isTouch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** The page's scroll position, also while a sheet holds the body pinned (window.scrollY reads 0 then). */
export function pageScrollY(): number {
  return locks > 0 ? savedY : window.scrollY;
}

/** Pins the page; call the returned function to release it (safe to call twice). */
export function lockPageScroll(): () => void {
  if (!isTouch()) return () => {};
  if (locks === 0) {
    savedY = window.scrollY;
    const s = document.body.style;
    s.position = 'fixed';
    s.top = `-${savedY}px`;
    s.left = '0';
    s.right = '0';
    s.width = '100%';
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks > 0) return;
    const s = document.body.style;
    s.position = '';
    s.top = '';
    s.left = '';
    s.right = '';
    s.width = '';
    window.scrollTo({ top: savedY });
  };
}
