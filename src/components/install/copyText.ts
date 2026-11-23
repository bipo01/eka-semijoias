/**
 * Copies text to the clipboard. Uses the async Clipboard API, falling back to a hidden textarea and
 * `execCommand('copy')` (older in-app browsers, insecure contexts). Resolves false when both fail.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission denied or unavailable: try the fallback */
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  // Inside a modal <dialog> the rest of the page is inert, so the textarea goes into the open dialog.
  const open = document.querySelectorAll('dialog[open]');
  const host = open[open.length - 1] ?? document.body;
  host.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
