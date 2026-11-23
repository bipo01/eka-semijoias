import { Suspense, useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { BagSheet } from '../bag/BagSheet';
import { CatalogGate } from './CatalogGate';
import { Toaster } from '../ui/Toaster';
import { Footer } from './Footer';
import { Header } from './Header';
import { MenuDrawer } from './MenuDrawer';
import { SearchSheet } from './SearchSheet';
import { WhatsAppFab } from './WhatsAppFab';
import { useUi } from '../../store/ui';

export function PageFallback() {
  return <div className="min-h-[60dvh]" aria-busy="true" />;
}

export function Layout() {
  const { pathname } = useLocation();
  const closePanel = useUi((s) => s.closePanel);
  const isProduct = pathname.startsWith('/produto/');

  // Close drawers on navigation; move focus to the main landmark for screen readers.
  useEffect(() => {
    closePanel();
  }, [pathname, closePanel]);

  return (
    <>
      <a href="#conteudo" onClick={(e) => { e.preventDefault(); document.getElementById('conteudo')?.focus(); }} className="sr-only z-[70] rounded-full bg-copper px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo" tabIndex={-1} className="min-h-[70dvh] outline-none">
        <CatalogGate>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </CatalogGate>
      </main>
      <Footer />
      {!isProduct && <WhatsAppFab />}
      <MenuDrawer />
      <SearchSheet />
      <BagSheet />
      <Toaster raised={isProduct} />
      <ScrollRestoration getKey={(location) => location.pathname + location.search} />
    </>
  );
}
