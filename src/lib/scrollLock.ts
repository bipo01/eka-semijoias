/*
 * Freezes the page under an open sheet on touch screens, and keeps the sheet above the keyboard.
 *
 * iOS Safari scrolls the document to bring a focused field above the keyboard, and the open sheet
 * (fixed, in the top layer) rode along with it: the strip between the sheet and the keyboard showed
 * the page behind ("Registrar entrada" over the Estoque list). `overflow: hidden` on the root does not
 * stop that in Safari; pinning the body with `position: fixed` does. The scroll position is kept and
 * given back when the last sheet closes. Mouse screens are left alone (their scrollbar would jump).
 *
 * With the page pinned, Safari no longer moves anything for the keyboard, and a short bottom sheet
 * (the store's search) stayed whole behind it. So while a sheet is open the part of the window the
 * keyboard leaves visible is published on the root (`keyboardArea`: `--kb` below it, `--vot` above it,
 * `--vvh` its height) and the sheets' CSS fits their content into it (src/styles/base.css). Where the
 * browser already resizes for the keyboard (Chrome on Android) `--kb`/`--vot` are 0 and only the
 * height caps the sheet, which already fits.
 */

let locks = 0;
let savedY = 0;
let stopKeyboard: (() => void) | null = null;

const isTouch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** The page's scroll position, also while a sheet holds the body pinned (window.scrollY reads 0 then). */
export function pageScrollY(): number {
  return locks > 0 ? savedY : window.scrollY;
}

export interface KeyboardArea {
  /** How much of the window (fixed-position coordinates) lies below the visible area: the keyboard. */
  kb: number;
  /** Top of the visible area in the same coordinates. */
  top: number;
  /** Height of the visible area. */
  height: number;
}

/**
 * The part of the window left visible by the on-screen keyboard, in the coordinates fixed elements
 * (the sheets) are laid out in; null while no keyboard is open. `baseline` is the visible height with
 * the keyboard closed. Safari on iOS 26 does it two ways: with the field focused as the sheet opens
 * (the search) the window keeps its height and the keyboard covers its bottom (`kb`); with a tap on a
 * field further down (the price filter) it shrinks the window itself to above the keyboard and scrolls,
 * so `kb` is 0 and only the height tells the sheet how tall it may be.
 */
export function keyboardArea(baseline: number): KeyboardArea | null {
  const vv = window.visualViewport;
  if (!vv) return null;
  // Below ~80 px it is browser chrome moving (Safari's toolbar), not a keyboard.
  if (baseline - vv.height <= 80) return null;
  const ih = window.innerHeight;
  const kb = Math.max(0, Math.round(ih - vv.height - vv.offsetTop));
  const top = Math.max(0, Math.round(ih - kb - vv.height));
  return { kb, top, height: Math.round(vv.height) };
}

function trackKeyboard(): () => void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const baseline = vv?.height ?? window.innerHeight;
  const vars = ['--kb', '--vvh', '--vot'];
  let last = '';
  const update = () => {
    const area = keyboardArea(baseline);
    const key = area ? `${area.kb}/${area.top}/${area.height}` : '';
    if (key === last) return;
    last = key;
    if (!area) {
      for (const v of vars) root.style.removeProperty(v);
      return;
    }
    root.style.setProperty('--kb', `${area.kb}px`);
    root.style.setProperty('--vvh', `${area.height}px`);
    root.style.setProperty('--vot', `${area.top}px`);
    // The sheet just got shorter: bring the focused field back into its scrolling body (Safari had
    // scrolled the window for it, which the pinned page does not show).
    const field = document.activeElement;
    if (field instanceof HTMLElement && field.closest('dialog[open] .sheet-body')) {
      requestAnimationFrame(() => field.scrollIntoView({ block: 'nearest' }));
    }
  };
  // Safari settles in steps (window shrunk and scrolled, then given back) and not every step fires a
  // visual-viewport event: measure on every viewport/window change and once more after it settles.
  let settle = 0;
  const onChange = () => {
    update();
    window.clearTimeout(settle);
    settle = window.setTimeout(update, 120);
  };
  update();
  const targets: (EventTarget | null | undefined)[] = [vv, window];
  for (const t of targets) {
    t?.addEventListener('resize', onChange);
    t?.addEventListener('scroll', onChange);
  }
  return () => {
    window.clearTimeout(settle);
    for (const t of targets) {
      t?.removeEventListener('resize', onChange);
      t?.removeEventListener('scroll', onChange);
    }
    for (const v of vars) root.style.removeProperty(v);
  };
}

/**
 * A tap on a field low in a sheet makes Safari scroll the window to reveal it, although the pinned page
 * cannot scroll; it then shrinks the window and, at the next tap, gives all of it back at once, so the
 * sheet jumped under the finger and "Ver 3 peças" was missed. Undoing that scroll at once keeps Safari in
 * its steady way (the keyboard over the window's bottom), where the sheets' padding does the lifting.
 */
function keepWindowAtTop() {
  if (window.scrollY !== 0) window.scrollTo(0, 0);
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
    stopKeyboard = trackKeyboard();
    window.addEventListener('scroll', keepWindowAtTop, { passive: true });
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks > 0) return;
    window.removeEventListener('scroll', keepWindowAtTop);
    stopKeyboard?.();
    stopKeyboard = null;
    const s = document.body.style;
    s.position = '';
    s.top = '';
    s.left = '';
    s.right = '';
    s.width = '';
    window.scrollTo({ top: savedY });
  };
}
