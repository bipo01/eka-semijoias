/*
 * The site used hash routes (/#/produto/x) until it moved to clean paths
 * (/produto/x). Old links shared on WhatsApp/Instagram still arrive with the
 * hash: turn them into the clean path before the router reads the URL.
 * Imported first in main.tsx so it runs before the router is created.
 */
const { hash } = window.location;
if (hash.startsWith('#/')) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.history.replaceState(window.history.state, '', `${base}${hash.slice(1)}`);
}

export {};
