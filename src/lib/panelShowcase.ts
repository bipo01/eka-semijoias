/*
 * The reseller panel remembers, on this device, which showcase is hers, so her own
 * showcase (/r/<slug>) can offer "Voltar ao meu painel". Only the slug, which is
 * already public; a customer's device never has it, so customers never see the link.
 */

const KEY = 'eka:revenda-panel:v1';

export function rememberPanelShowcase(slug: string): void {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    /* storage blocked: the showcase simply shows no back link */
  }
}

export function forgetPanelShowcase(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to forget */
  }
}

/** True when this device's reseller panel belongs to the showcase `slug`. */
export function isOwnShowcase(slug: string): boolean {
  try {
    return slug !== '' && localStorage.getItem(KEY) === slug;
  } catch {
    return false;
  }
}
