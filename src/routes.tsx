import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { RouteError } from './components/layout/RouteError';
import { HomePage } from './pages/Home';
import { CatalogPage } from './pages/Catalog';
import { ProductPage } from './pages/Product';
import { BagPage } from './pages/Bag';
import { FavoritesPage } from './pages/Favorites';
import { ResellersPage } from './pages/Resellers';
import { CarePage } from './pages/Care';
import { WarrantyPage } from './pages/Warranty';
import { AboutPage } from './pages/About';
import { ContactPage } from './pages/Contact';
import { PrivacyPage } from './pages/Privacy';
import { NotFoundPage } from './pages/NotFound';
import { trackNavHistory } from './lib/navHistory';

// Clean paths (/catalogo, /produto/<slug>, /admin): the Worker serves index.html for every page route.
export const router = createBrowserRouter([
  {
    path: '/admin/*',
    // Code-split: the admin chunk only loads on /admin.
    lazy: () => import('./admin/AdminApp').then((m) => ({ Component: m.default })),
    hydrateFallbackElement: <div className="min-h-dvh bg-ivory" aria-busy="true" />,
    errorElement: <RouteError />,
  },
  {
    // The payment link sent on WhatsApp: standalone (no store navigation), its own chunk.
    path: '/pagamento/:token',
    lazy: () => import('./pages/Payment').then((m) => ({ Component: m.default })),
    hydrateFallbackElement: <div className="min-h-dvh bg-ivory" aria-busy="true" />,
    errorElement: <RouteError />,
  },
  {
    // The reseller's own panel (login, first access, panel): its own chunk, outside the store layout.
    path: '/revenda/*',
    lazy: () => import('./revenda/RevendaApp').then((m) => ({ Component: m.default })),
    hydrateFallbackElement: <div className="min-h-dvh bg-ivory" aria-busy="true" />,
    errorElement: <RouteError />,
  },
  {
    // A reseller's public showcase: standalone, its own chunk.
    path: '/r/:slug',
    lazy: () => import('./pages/Showcase').then((m) => ({ Component: m.default })),
    hydrateFallbackElement: <div className="min-h-dvh bg-ivory" aria-busy="true" />,
    errorElement: <RouteError />,
  },
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      {
        // Route-level boundary: a page crash keeps the header and footer.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'catalogo', element: <CatalogPage /> },
          { path: 'catalogo/:categoria', element: <CatalogPage /> },
          { path: 'produto/:slug', element: <ProductPage /> },
          // Collections were retired from the site; old links land on the catalog.
          { path: 'colecao/*', element: <Navigate to="/catalogo" replace /> },
          { path: 'sacola', element: <BagPage /> },
          { path: 'favoritos', element: <FavoritesPage /> },
          { path: 'revendedoras', element: <ResellersPage /> },
          { path: 'como-cuidar', element: <CarePage /> },
          { path: 'garantia', element: <WarrantyPage /> },
          { path: 'sobre', element: <AboutPage /> },
          { path: 'contato', element: <ContactPage /> },
          { path: 'privacidade', element: <PrivacyPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });

// Note every navigation before the app renders, so "Voltar" knows where the visitor came from.
trackNavHistory(router);
