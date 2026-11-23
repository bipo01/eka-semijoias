import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ExternalLink, LogOut, Menu, Plus } from 'lucide-react';
import { ButtonLink, IconButton } from '../components/ui/Button';
import { Sheet } from '../components/ui/Sheet';
import { cx } from '../components/ui/cx';
import { useCatalog } from '../store/catalog';
import { toast } from '../store/ui';
import { useAdminSession } from './AdminContext';
import { ADMIN_BASE } from './lib/paths';

export const SECTIONS = [
  { path: 'produtos', label: 'Produtos' },
  { path: 'categorias', label: 'Categorias' },
  { path: 'colecoes', label: 'Coleções' },
  { path: 'revendedoras', label: 'Revendedoras' },
  { path: 'configuracoes', label: 'Configurações' },
  { path: 'backup', label: 'Backup' },
] as const;

function useSection() {
  const { pathname } = useLocation();
  const segment = pathname.slice(ADMIN_BASE.length + 1).split('/')[0];
  return SECTIONS.find((s) => s.path === segment) ?? SECTIONS[0];
}

/** Shown while the server cannot be reached (edits would fail). */
function ConnectionBanner() {
  const offline = useCatalog((s) => s.offline);
  if (!offline) return null;
  return (
    <p role="status" className="mb-4 rounded-[12px] border border-line bg-champagne px-4 py-3 text-sm">
      Sem conexão com o servidor. Você está vendo a última versão carregada; as alterações só podem ser salvas quando a conexão voltar.
    </p>
  );
}

/** Tells the user when another device or tab saved the catalog underneath this one. */
function useExternalUpdateNotice() {
  const externalVersion = useCatalog((s) => s.externalVersion);
  const initial = useRef(externalVersion);
  useEffect(() => {
    if (externalVersion !== initial.current) toast('O catálogo foi atualizado em outro aparelho.');
  }, [externalVersion]);
}

export function AdminShell() {
  const section = useSection();
  const { lock } = useAdminSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const activeTab = useRef<HTMLAnchorElement>(null);
  useExternalUpdateNotice();

  useEffect(() => {
    activeTab.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [section.path]);

  return (
    <div className="min-h-dvh bg-ivory">
      <header className="sticky top-0 z-30 border-b border-line bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/85">
        <div className="mx-auto flex h-16 max-w-[960px] items-center gap-2 px-4">
          <IconButton label="Abrir menu do painel" onClick={() => setMenuOpen(true)} className="-ml-2.5">
            <Menu size={24} strokeWidth={1.5} />
          </IconButton>
          <h1 className="min-w-0 flex-1 truncate font-display text-display-m">{section.label}</h1>
          {section.path === 'produtos' && (
            <ButtonLink to={`${ADMIN_BASE}/produtos/nova`} size="sm" className="shrink-0">
              <Plus size={18} strokeWidth={1.75} /> Nova peça
            </ButtonLink>
          )}
        </div>
        <nav aria-label="Seções do painel" className="no-scrollbar mx-auto max-w-[960px] overflow-x-auto px-4 pb-2.5">
          <ul className="flex gap-1.5">
            {SECTIONS.map((s) => (
              <li key={s.path}>
                <NavLink
                  ref={s.path === section.path ? activeTab : undefined}
                  to={`${ADMIN_BASE}/${s.path}`}
                  className={({ isActive }) =>
                    cx(
                      'inline-flex min-h-11 items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors duration-[160ms]',
                      isActive ? 'bg-copper text-white' : 'text-ink hover:bg-champagne',
                    )
                  }
                >
                  {s.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[960px] px-4 pt-4 pb-[calc(32px+var(--safe-bottom))]">
        <ConnectionBanner />
        <Outlet />
      </main>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Painel ÉKA" side="left">
        <ul className="-mx-2 flex flex-col gap-1">
          <li>
            <Link to="/" className="flex min-h-12 items-center gap-3 rounded-[10px] px-2 hover:bg-champagne" onClick={() => setMenuOpen(false)}>
              <ExternalLink size={20} strokeWidth={1.5} /> Ver o site
            </Link>
          </li>
          <li>
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-3 rounded-[10px] px-2 text-left hover:bg-champagne"
              onClick={() => {
                setMenuOpen(false);
                void lock();
              }}
            >
              <LogOut size={20} strokeWidth={1.5} /> Sair do painel
            </button>
          </li>
        </ul>
      </Sheet>
    </div>
  );
}
