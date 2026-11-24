/**
 * The three installable apps and the head tags that name them (manifest, iOS icon and home-screen
 * title). No DOM here: the Worker writes these tags into the panel documents and the app swaps them
 * on in-app navigation (src/lib/install.ts).
 */

/** Which installable app a page offers: the store ("/"), the owner's panel ("/admin") or the reseller panel ("/revenda"). */
export type InstallApp = 'store' | 'admin' | 'reseller';

/** Head tags that identify the installable app on a page (manifest, iOS icon and name). */
export const APP_HEAD: Record<InstallApp, { manifest: string; appleTouchIcon: string; appleTitle: string }> = {
  store: { manifest: '/manifest.webmanifest', appleTouchIcon: '/apple-touch-icon.png', appleTitle: 'ÉKA' },
  admin: { manifest: '/admin.webmanifest', appleTouchIcon: '/admin-apple-touch-icon.png', appleTitle: 'Painel ÉKA' },
  reseller: { manifest: '/revenda.webmanifest', appleTouchIcon: '/apple-touch-icon.png', appleTitle: 'ÉKA Revenda' },
};

/** The installable app a page belongs to: the owner's panel, the reseller panel or the store. */
export function appForPath(pathname: string): InstallApp {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  if (p === '/revenda' || p.startsWith('/revenda/')) return 'reseller';
  return 'store';
}
