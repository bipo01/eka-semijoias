import { useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from '../components/ui/Toaster';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useCatalog } from '../store/catalog';
import { AdminSessionContext, type AdminSession } from './AdminContext';
import { AdminShell } from './AdminShell';
import { ADMIN_BASE } from './lib/paths';
import { PinGate } from './PinGate';
import { readSession, writeSession } from './lib/session';
import { ProductsPage } from './products/ProductsPage';
import { ProductFormRoute } from './products/ProductFormRoute';
import { CategoriesPage } from './sections/CategoriesPage';
import { CollectionsPage } from './sections/CollectionsPage';
import { LeadsPage } from './sections/LeadsPage';
import { SettingsPage } from './sections/SettingsPage';
import { BackupPage } from './sections/BackupPage';

/** Catalog admin, mounted at /admin/* outside the public layout (lazy-loaded). */
export default function AdminApp() {
  useDocumentTitle('Painel');
  const pinHash = useCatalog((s) => s.data.settings.pinHash);
  // Kept in memory too, so the session works when sessionStorage is blocked.
  const [sessionHash, setSessionHash] = useState<string | null>(readSession);
  const unlocked = sessionHash === pinHash;

  const session = useMemo<AdminSession>(
    () => ({
      lock: () => {
        writeSession(null);
        setSessionHash(null);
      },
      renew: (hash) => {
        writeSession(hash);
        setSessionHash(hash);
      },
    }),
    [],
  );

  return (
    <AdminSessionContext.Provider value={session}>
      {unlocked ? (
        <Routes>
          <Route element={<AdminShell />}>
            <Route index element={<Navigate to={`${ADMIN_BASE}/produtos`} replace />} />
            <Route path="produtos" element={<ProductsPage />}>
              <Route path=":productId" element={<ProductFormRoute />} />
            </Route>
            <Route path="categorias" element={<CategoriesPage />} />
            <Route path="colecoes" element={<CollectionsPage />} />
            <Route path="revendedoras" element={<LeadsPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="backup" element={<BackupPage />} />
            <Route path="*" element={<Navigate to={`${ADMIN_BASE}/produtos`} replace />} />
          </Route>
        </Routes>
      ) : (
        <PinGate pinHash={pinHash} onUnlock={() => session.renew(pinHash)} />
      )}
      <Toaster />
    </AdminSessionContext.Provider>
  );
}
