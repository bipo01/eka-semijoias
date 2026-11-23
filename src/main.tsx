import './legacyHashRedirect';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/latin-500.css';
import './styles/base.css';
import { App } from './App';
import { listenForInstallPrompt } from './hooks/useInstallPrompt';
import { startCatalog } from './store/catalog';

// Start fetching the catalog (and the live connection) before the first render.
startCatalog();
// The browser's install prompt can fire before any "Instalar o app" button is on screen.
listenForInstallPrompt();

// Service worker (installability + Web Push; it caches nothing). Production only, after the page
// has loaded so it never competes with the first render; a failure only costs those features.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      console.warn('Service worker registration failed', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
