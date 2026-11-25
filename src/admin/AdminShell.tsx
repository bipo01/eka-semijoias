import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft, ExternalLink, LogOut, Plus } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { InstallAppButton } from '../components/install/InstallAppButton';
import { cx } from '../components/ui/cx';
import { asset } from '../lib/assets';
import { useCatalog } from '../store/catalog';
import { toast } from '../store/ui';
import { useAdminSession } from './AdminContext';
import { useOrders, useOrdersSync } from './lib/orders';
import { awaitingReview } from '../data/orders';
import { ADMIN_BASE } from './lib/paths';
import { DetailHeaderContext, type DetailHeader } from './DetailPage';
import { BOTTOM_BAR, HOME, MORE, NAV_GROUPS, navItem, type NavItem } from './nav';

/** The current section from the URL ('' = Início). */
export function useSectionPath(): string {
  const { pathname } = useLocation();
  return pathname.slice(ADMIN_BASE.length + 1).split('/')[0] ?? '';
}

const slugOf = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

const to = (path: string) => (path ? `${ADMIN_BASE}/${path}` : ADMIN_BASE);

/** Shown while the server cannot be reached (edits would fail). */
function ConnectionBanner() {
  const offline = useCatalog((s) => s.offline);
  if (!offline) return null;
  return (
    <p role="status" className="mb-4 rounded-2xl border border-[#ecd9b3] bg-warning-tint px-4 py-3 text-sm text-warning">
      Sem conexão com o servidor. Você vê a última versão carregada; dá para salvar quando a conexão voltar.
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

/** Orders waiting for the owner (new ones, and receipts to check), shown on the Pedidos tab. */
export function useOpenOrders(): number {
  return useOrders((s) => (s.state.status === 'ready' ? s.state.orders.filter((o) => o.status === 'enviado' || awaitingReview(o)).length : 0));
}

/** Toast when a receipt arrives while the panel is open. */
function useNewReceiptNotice() {
  const latest = useOrders((s) => {
    if (s.state.status !== 'ready') return null;
    let best: { at: string; number: number } | null = null;
    for (const o of s.state.orders) for (const r of o.receipts ?? []) if (!best || r.at > best.at) best = { at: r.at, number: o.number };
    return best ? `${best.at}|${best.number}` : '';
  });
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (latest === null) return;
    if (seen.current !== null && latest && latest > seen.current) {
      const number = latest.split('|')[1];
      toast(`Comprovante recebido no pedido nº ${number}.`, { tone: 'success', action: { label: 'Ver', to: `${ADMIN_BASE}/pedidos` } });
    }
    if (seen.current === null || (latest && latest > seen.current)) seen.current = latest;
  }, [latest]);
}

/** Toast when a new order arrives while the panel is open. */
function useNewOrderNotice() {
  const newest = useOrders((s) => (s.state.status === 'ready' ? Math.max(0, ...s.state.orders.map((o) => o.number)) : null));
  const manual = useOrders((s) => (s.state.status === 'ready' ? s.state.orders.find((o) => o.number === newest)?.source === 'manual' : false));
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (newest === null) return;
    // Orders registered in the panel already get their own confirmation where they were made.
    if (seen.current !== null && newest > seen.current && !manual) toast(`Novo pedido nº ${newest} no site.`, { tone: 'success', action: { label: 'Ver', to: `${ADMIN_BASE}/pedidos` } });
    seen.current = Math.max(seen.current ?? 0, newest);
  }, [newest, manual]);
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cx('price inline-flex min-w-5 items-center justify-center rounded-full bg-copper px-1.5 text-[0.6875rem] leading-5 text-white', className)}>
      {count}
      <span className="sr-only"> precisando de atenção</span>
    </span>
  );
}

/** Desktop: a deep espresso sidebar with the groups (lg and up). */
function Sidebar({ openOrders }: { openOrders: number }) {
  const { lock } = useAdminSession();
  const item = (i: NavItem) => (
    <li key={i.path}>
      <NavLink
        to={to(i.path)}
        end={i.path === ''}
        className={({ isActive }) =>
          cx(
            'group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors duration-[160ms]',
            isActive ? 'bg-white/[0.09] text-white' : 'text-[#d9c6bb] hover:bg-white/[0.05] hover:text-white',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span aria-hidden="true" className={cx('absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-rose-light transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
            <i.icon size={19} strokeWidth={1.6} aria-hidden="true" className={isActive ? 'text-rose-light' : 'text-[#b89f92]'} />
            <span className="flex-1">{i.label}</span>
            {i.path === 'pedidos' && <Badge count={openOrders} />}
          </>
        )}
      </NavLink>
    </li>
  );
  return (
    // The rose glow behind the logo is painted on the sidebar itself: inside the clipped logo block it
    // was cut off flat right above "Início", leaving a visible seam in the background.
    <aside className="on-dark fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-espresso bg-[radial-gradient(circle_104px_at_216px_48px,rgb(230_190_164/0.18),transparent)] bg-no-repeat text-on-dark lg:flex">
      <div className="px-6 pt-6 pb-5">
        <Link to={ADMIN_BASE} className="relative block w-fit">
          <img src={asset('brand/eka-lockup-white.svg')} alt="ÉKA Semijoias" width={96} height={32} className="h-8 w-auto opacity-95" />
        </Link>
        <p className="eyebrow relative mt-2 text-[0.625rem] tracking-[0.2em] text-rose-light/80">Painel da loja</p>
      </div>
      <nav aria-label="Seções do painel" className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        <ul className="flex flex-col gap-0.5">{item(HOME)}</ul>
        {NAV_GROUPS.map((g) => (
          <div key={g.title} className="mt-4">
            <p className="eyebrow mb-1.5 px-3 text-[0.625rem] tracking-[0.18em] text-[#a88d80]">{g.title}</p>
            <ul className="flex flex-col gap-0.5">{g.items.map(item)}</ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-3 py-3 text-sm">
        <Link to="/" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[#d9c6bb] hover:bg-white/[0.05] hover:text-white">
          <ExternalLink size={18} strokeWidth={1.6} aria-hidden="true" /> Ver o site
        </Link>
        <InstallAppButton app="admin" variant="list" className="!min-h-11 !rounded-xl !px-3 text-[#d9c6bb] hover:!bg-white/[0.05] hover:text-white" />
        <button type="button" onClick={() => void lock()} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[#d9c6bb] hover:bg-white/[0.05] hover:text-white">
          <LogOut size={18} strokeWidth={1.6} aria-hidden="true" /> Sair do painel
        </button>
      </div>
    </aside>
  );
}

/** Phone and tablet: Início · Pedidos · Revenda · Produtos · Mais, always at hand. */
function BottomBar({ current, openOrders }: { current: string; openOrders: number }) {
  const items = [...BOTTOM_BAR.map((p) => navItem(p)!), MORE];
  const inBar = (BOTTOM_BAR as readonly string[]).includes(current);
  return (
    <nav aria-label="Seções principais" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[var(--safe-bottom)] backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:hidden">
      <ul className="mx-auto grid h-[64px] max-w-[560px] grid-cols-5">
        {items.map((i) => {
          const active = i.path === MORE.path ? !inBar : i.path === current;
          return (
            <li key={i.path} className="flex">
              <Link
                to={to(i.path)}
                aria-current={active ? 'page' : undefined}
                className={cx('relative flex flex-1 flex-col items-center justify-center gap-1 text-[0.75rem] transition-colors', active ? 'font-medium text-copper' : 'text-ink-muted hover:text-ink')}
              >
                <span className={cx('relative inline-flex h-8 w-[52px] items-center justify-center rounded-[12px] transition-colors duration-[200ms]', active ? 'bg-copper text-white shadow-[0_4px_10px_-4px_rgb(138_90_69/0.7)]' : 'text-ink')}>
                  <i.icon size={21} strokeWidth={1.6} aria-hidden="true" />
                  {/* The number shows on the icon; screen readers hear it after the name ("Pedidos, 2 …"). */}
                  {i.path === 'pedidos' && openOrders > 0 && (
                    <span aria-hidden="true" className="price absolute -top-1 right-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-copper px-1.5 text-[0.6875rem] leading-5 text-white ring-2 ring-white">
                      {openOrders}
                    </span>
                  )}
                </span>
                {i.short ?? i.label}
                {i.path === 'pedidos' && openOrders > 0 && <span className="sr-only">, {openOrders} precisando de atenção</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminShell() {
  const current = useSectionPath();
  const section = navItem(current) ?? HOME;
  useOrdersSync();
  useNewOrderNotice();
  useNewReceiptNotice();
  const openOrders = useOpenOrders();
  useExternalUpdateNotice();
  // A new section starts at the top (the window kept the last page's scroll: Configurações opened
  // halfway down after a scrolled "Mais"). Details keep their own rules (useListPlace).
  const lastSection = useRef(current);
  useLayoutEffect(() => {
    if (lastSection.current === current) return;
    lastSection.current = current;
    window.scrollTo({ top: 0 });
  }, [current]);
  const [detailState, setDetailState] = useState<DetailHeader | null>(null);
  // Only one detail shows at a time; keep the setter stable and skip identical updates.
  const setDetail = useCallback((next: DetailHeader | null) => {
    setDetailState((prev) => (prev?.title === next?.title && prev?.backTo === next?.backTo && prev?.backLabel === next?.backLabel ? prev : next));
  }, []);
  const detail = detailState;
  const home = section === HOME && !detail;

  return (
    <DetailHeaderContext.Provider value={setDetail}>
    <div className="admin-ui min-h-dvh bg-ivory">
      <Sidebar openOrders={openOrders} />
      <div className="lg:pl-[248px]">
        {home && <h1 className="sr-only">{section.label}</h1>}
        <header className={cx('z-20', home ? 'lg:hidden' : 'sticky top-0 border-b border-line/80 bg-ivory/[0.97] backdrop-blur')}>
          <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-4 lg:h-[76px] lg:px-8">
            {detail ? (
              // A detail page: "Voltar" always leads to the parent list.
              <Link
                to={detail.backTo}
                className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-copper shadow-[0_2px_8px_rgb(48_33_28/0.06)] transition-colors hover:border-copper"
                aria-label={`Voltar para ${detail.backLabel}`}
                title={`Voltar para ${detail.backLabel}`}
              >
                <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            ) : (
              <Link to={ADMIN_BASE} className={cx('shrink-0 lg:hidden', home && 'hidden')} aria-label="Início do painel">
                <img src={asset('brand/eka-monogram-copper.svg')} alt="" width={34} height={34} className="size-[34px]" />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              {detail ? (
                <Link to={detail.backTo} className="eyebrow block w-fit text-[0.625rem] tracking-[0.18em] text-ink-muted hover:text-copper">
                  {detail.backLabel}
                </Link>
              ) : (
                <p className="eyebrow hidden text-[0.625rem] tracking-[0.18em] text-ink-muted lg:block">{NAV_GROUPS.find((g) => g.items.includes(section))?.title ?? 'Painel da loja'}</p>
              )}
              {!home && <h1 className={cx('truncate font-display leading-tight font-semibold', detail ? 'text-[1.5rem] lg:text-[1.875rem]' : 'text-[1.75rem] lg:text-[2rem]')}>{detail ? detail.title : section.label}</h1>}
              {home && <img src={asset('brand/eka-lockup-copper.svg')} alt="" width={84} height={28} className="h-7 w-auto lg:hidden" />}
            </div>
            {current === 'produtos' && !detail && (
              <ButtonLink to={`${ADMIN_BASE}/produtos/nova`} size="sm" className="shrink-0">
                <Plus size={18} strokeWidth={1.75} /> Nova peça
              </ButtonLink>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-[1080px] px-4 pt-4 pb-[calc(96px+var(--safe-bottom))] lg:px-8 lg:pt-6 lg:pb-12">
          <ConnectionBanner />
          <Outlet />
        </main>
      </div>
      <BottomBar current={current} openOrders={openOrders} />
    </div>
    </DetailHeaderContext.Provider>
  );
}

/** Phone: every area of the panel, grouped, plus the site, the app and leaving. */
export function MorePage() {
  const { lock } = useAdminSession();
  const openOrders = useOpenOrders();
  return (
    <div className="flex flex-col gap-6">
      {NAV_GROUPS.map((g) => (
        <section key={g.title} aria-labelledby={`mais-${slugOf(g.title)}`}>
          <h2 id={`mais-${slugOf(g.title)}`} className="eyebrow mb-2 px-1 text-[0.6875rem] tracking-[0.16em] text-ink-muted">
            {g.title}
          </h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)]">
            {g.items.map((i, n) => (
              <li key={i.path} className={cx(n > 0 && 'border-t border-line/70')}>
                <Link to={to(i.path)} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 hover:bg-[#fcf8f5]">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-champagne text-copper">
                    <i.icon size={20} strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{i.label}</span>
                    <span className="block truncate text-sm text-ink-muted">{i.hint}</span>
                  </span>
                  {i.path === 'pedidos' && <Badge count={openOrders} />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-label="Aplicativo e conta">
        <ul className="overflow-hidden rounded-2xl border border-line bg-white px-2 py-1 shadow-[0_2px_8px_rgb(48_33_28/0.04)]">
          <li>
            <Link to="/" className="flex min-h-12 items-center gap-3 rounded-[10px] px-2 hover:bg-champagne">
              <ExternalLink size={20} strokeWidth={1.5} /> Ver o site
            </Link>
          </li>
          <li>
            <InstallAppButton app="admin" variant="list" />
          </li>
          <li>
            <button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-[10px] px-2 text-left text-danger hover:bg-danger-tint" onClick={() => void lock()}>
              <LogOut size={20} strokeWidth={1.5} /> Sair do painel
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}
