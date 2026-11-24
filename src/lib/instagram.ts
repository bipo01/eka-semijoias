/*
 * One rule for every Instagram field (store settings, customers, reseller
 * applications, resellers), shared by the browser and the Worker: people type
 * the profile in any shape and we keep only the handle.
 */

/** A stored handle: what Instagram allows in a username (always lowercase there). */
export const INSTAGRAM_HANDLE = /^[a-z0-9._]{1,30}$/;

export const INSTAGRAM_ERROR = 'Confira o Instagram: use só letras, números, ponto e sublinhado.';
export const INSTAGRAM_HINT = 'Pode ser com ou sem @, ou o link do perfil.';

/**
 * "@Ana.Semi", " ana.semi ", "@@ana.semi", "@ ana.semi", "instagram.com/ana.semi",
 * "https://www.instagram.com/ana.semi/?hl=pt-br" → "ana.semi". Instagram usernames
 * are lowercase, so a capital letter from the phone's keyboard never breaks the link.
 * Anything else comes back as typed (trimmed) for `isInstagramHandle` to refuse.
 */
export function normalizeInstagram(value: string): string {
  const trimmed = value.trim();
  const fromUrl = trimmed.match(/(?:^|[/.\s])(?:instagram\.com|instagr\.am)\/(?:_u\/)?([^/?#\s]*)/i);
  const handle = fromUrl ? fromUrl[1]! : trimmed;
  return handle.replace(/^@+\s*/, '').replace(/\/+$/, '').toLowerCase();
}

/** Empty (no Instagram) or a valid handle, after `normalizeInstagram`. */
export function isInstagramHandle(handle: string): boolean {
  return handle === '' || INSTAGRAM_HANDLE.test(handle);
}
