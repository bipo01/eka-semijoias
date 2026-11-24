import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Sheet } from '../components/ui/Sheet';
import { Toaster } from '../components/ui/Toaster';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { errorMessage } from '../lib/api';
import { applyAppHead } from '../lib/install';
import { reconnectLive } from '../store/catalog';
import { toast } from '../store/ui';
import { AdminSessionContext, type AdminSession } from './AdminContext';
import { AdminShell } from './AdminShell';
import { ADMIN_BASE } from './lib/paths';
import { fetchSession, logout, SESSION_LOST_EVENT } from './lib/session';
import { PinGate } from './PinGate';
import { ProductsPage } from './products/ProductsPage';
import { ProductFormRoute } from './products/ProductFormRoute';
import { CategoriesPage } from './sections/CategoriesPage';
import { CustomersPage } from './sections/CustomersPage';
import { ResellersPage } from './sections/ResellersPage';
import { OrdersPage } from './sections/OrdersPage';
import { MessagesPage } from './sections/MessagesPage';
import { ReportPage } from './sections/ReportPage';
import { StockPage } from './sections/StockPage';
import { SettingsPage } from './sections/SettingsPage';
import { BackupPage } from './sections/BackupPage';
import { SitePage } from './sections/site/SitePage';

/** `expired`: the session ended while the panel was open; the keypad shows over it so no edit is lost. */
type Gate = { state: 'checking' } | { state: 'locked'; pinLength: number } | { state: 'open'; pinLength: number; expired?: boolean } | { state: 'error'; message: string };

/** Catalog admin, mounted at /admin/* outside the public layout (lazy-loaded). */
export default function AdminApp() {
  useDocumentTitle('Painel');
  // The panel installs as its own app ("Painel ÉKA", opens at /admin); the store's tags come back on leaving.
  useEffect(() => applyAppHead('admin'), []);
  const [gate, setGate] = useState<Gate>({ state: 'checking' });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchSession().then(
      (status) => active && setGate({ state: status.authenticated ? 'open' : 'locked', pinLength: status.pinLength }),
      (error: unknown) => active && setGate({ state: 'error', message: errorMessage(error) }),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const check = useCallback(() => {
    setGate({ state: 'checking' });
    setAttempt((a) => a + 1);
  }, []);

  // Any admin request that finds the session expired sends the user back to the keypad.
  useEffect(() => {
    const onLost = () => setGate((g) => (g.state === 'open' && !g.expired ? { ...g, expired: true } : g));
    window.addEventListener(SESSION_LOST_EVENT, onLost);
    return () => window.removeEventListener(SESSION_LOST_EVENT, onLost);
  }, []);

  const session = useMemo<AdminSession>(
    () => ({
      lock: async () => {
        try {
          await logout();
        } catch {
          /* the cookie expires anyway; leave the panel regardless */
        }
        reconnectLive();
        setGate((g) => ({ state: 'locked', pinLength: 'pinLength' in g ? g.pinLength : 6 }));
      },
      pinChanged: (pinLength) => setGate({ state: 'open', pinLength }),
    }),
    [],
  );

  let content;
  if (gate.state === 'checking') {
    content = <div className="min-h-dvh bg-ivory" aria-busy="true" />;
  } else if (gate.state === 'error') {
    content = (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ivory px-6 text-center">
        <h1 className="font-display text-display-m">Não foi possível abrir o painel</h1>
        <p className="max-w-sm text-ink-muted">{gate.message}</p>
        <Button onClick={check}>Tentar de novo</Button>
      </main>
    );
  } else if (gate.state === 'locked') {
    content = (
      <PinGate
        pinLength={gate.pinLength}
        onUnlock={(pinLength) => {
          reconnectLive(); // the live socket now carries the admin session
          setGate({ state: 'open', pinLength });
        }}
      />
    );
  } else {
    const relogin = gate.expired ? (
      // Closing keeps the panel (and any open form) as it is; the next save asks for the PIN again.
      <Sheet open side="full" title="Entrar de novo" hideTitle onClose={() => setGate({ state: 'open', pinLength: gate.pinLength })}>
        <PinGate
          embedded
          pinLength={gate.pinLength}
          onUnlock={(pinLength) => {
            reconnectLive();
            setGate({ state: 'open', pinLength });
            toast('Sessão renovada. Agora é só salvar de novo.', { tone: 'success' });
          }}
        />
      </Sheet>
    ) : null;
    content = (
      <>
      {relogin}
      <Routes>
        <Route element={<AdminShell />}>
          <Route index element={<Navigate to={`${ADMIN_BASE}/pedidos`} replace />} />
          <Route path="pedidos" element={<OrdersPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="estoque" element={<StockPage />} />
          <Route path="relatorio" element={<ReportPage />} />
          <Route path="mensagens" element={<MessagesPage />} />
          <Route path="site" element={<SitePage />} />
          <Route path="produtos" element={<ProductsPage />}>
            <Route path=":productId" element={<ProductFormRoute />} />
          </Route>
          <Route path="categorias" element={<CategoriesPage />} />
          <Route path="revendedoras" element={<ResellersPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="backup" element={<BackupPage />} />
          <Route path="*" element={<Navigate to={`${ADMIN_BASE}/pedidos`} replace />} />
        </Route>
      </Routes>
      </>
    );
  }

  return (
    <AdminSessionContext.Provider value={session}>
      {content}
      <Toaster />
    </AdminSessionContext.Provider>
  );
}
