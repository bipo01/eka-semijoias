import { createHashRouter } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { RouteError } from './components/layout/RouteError';
import { HomePage } from './pages/Home';
import { CatalogPage } from './pages/Catalog';
import { ProductPage } from './pages/Product';
import { CollectionPage } from './pages/Collection';
import { BagPage } from './pages/Bag';
import { FavoritesPage } from './pages/Favorites';
import { ResellersPage } from './pages/Resellers';
import { CarePage } from './pages/Care';
import { WarrantyPage } from './pages/Warranty';
import { AboutPage } from './pages/About';
import { ContactPage } from './pages/Contact';
import { NotFoundPage } from './pages/NotFound';

export const router = createHashRouter([
  {
    path: '/admin/*',
    // Code-split: the admin chunk only loads on /#/admin.
    lazy: () => import('./admin/AdminApp').then((m) => ({ Component: m.default })),
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
          { path: 'colecao/:slug', element: <CollectionPage /> },
          { path: 'sacola', element: <BagPage /> },
          { path: 'favoritos', element: <FavoritesPage /> },
          { path: 'revendedoras', element: <ResellersPage /> },
          { path: 'como-cuidar', element: <CarePage /> },
          { path: 'garantia', element: <WarrantyPage /> },
          { path: 'sobre', element: <AboutPage /> },
          { path: 'contato', element: <ContactPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
