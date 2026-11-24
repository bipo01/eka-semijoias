/**
 * A code file that fails to load (an old tab after a deploy asks for a file the new version no longer
 * has, or a brief 404 while a deploy spreads) would leave the page blank or a section dead. Reload once
 * to get the current version; a second failure within a minute is left alone (no reload loop).
 */
const KEY = 'eka:chunk-reload-at';
const WINDOW_MS = 60_000;

export function shouldReloadAfterChunkError(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY));
    if (Number.isFinite(last) && last > 0 && now - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
    return true;
  } catch {
    // Storage blocked: without a guard a reload could loop, so let the error surface instead.
    return false;
  }
}

export function listenForChunkErrors() {
  window.addEventListener('vite:preloadError', (event) => {
    if (!shouldReloadAfterChunkError()) return;
    event.preventDefault();
    window.location.reload();
  });
}
