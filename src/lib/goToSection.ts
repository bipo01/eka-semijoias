/**
 * Scrolls to a section of the current page from a button or link, without touching the URL.
 *
 * A plain `href="#id"` changes the hash, the router treats that as a navigation and its scroll
 * restoration puts the page back where it was: the first tap "blinks" and nothing happens (the
 * second works because the hash no longer changes). This scrolls directly instead, smoothly unless
 * the visitor prefers reduced motion, and moves focus to the section's heading (not to a field, so
 * the phone keyboard does not pop up over the form). Returns false when the section is not there.
 */
export function goToSection(id: string): boolean {
  const section = document.getElementById(id);
  if (!section) return false;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const target = section.querySelector<HTMLElement>('h1, h2, h3') ?? section;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  return true;
}
