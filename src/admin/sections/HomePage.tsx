import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, BriefcaseBusiness, CalendarClock, ChevronRight, ClipboardCheck, ExternalLink, Gem, HandCoins, Handshake, Layers, PackageMinus, PackagePlus, Plus, ReceiptText, ShoppingBag, UserPlus, Users } from 'lucide-react';
import { cx } from '../../components/ui/cx';
import { pendingChecklist } from '../../config/business';
import { awaitingReview } from '../../data/orders';
import { computeReport, periodRange } from '../../data/report';
import { daysLeft, kitValueCents, salesTotalCents } from '../../data/revenda';
import { asset } from '../../lib/assets';
import { formatBRL } from '../../lib/format';
import { useCatalog } from '../../store/catalog';
import { useLeads } from '../lib/leads';
import { useOrders } from '../lib/orders';
import { ADMIN_BASE } from '../lib/paths';
import { useResellers } from '../lib/resellers';
import { CARD, SectionHeading, type Tone } from '../ui';
import { DONE_WHEN } from './SettingsPage';

/*
 * Painel → Início: the day at a glance. A dark hero with the month's sales, today's numbers, what needs
 * her ("Precisa de você", most urgent first), quick actions and the reseller network. Everything comes
 * from data the panel already loads; nothing here writes.
 */

const a = (path: string) => `${ADMIN_BASE}/${path}`;

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const longDate = (now: Date) => now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Todo {
  key: string;
  to: string;
  title: string;
  detail: string;
  tone: Tone;
  icon: ReactNode;
  /** Money shown at the end of the row. */
  value?: string;
  /** Lower comes first. */
  rank: number;
}

const ICON = { size: 19, strokeWidth: 1.7, 'aria-hidden': true } as const;

const TODO_TONE: Record<Tone, string> = {
  danger: 'bg-danger-tint text-danger',
  warning: 'bg-warning-tint text-warning',
  success: 'bg-success-tint text-success',
  info: 'bg-info-tint text-info',
  copper: 'bg-copper text-white',
  neutral: 'bg-champagne text-copper',
  muted: 'bg-[#f1ece8] text-ink-muted',
};

type ResellersState = ReturnType<typeof useResellers>['state'];

function useTodos(resellers: ResellersState): { todos: Todo[]; loading: boolean; failed: boolean } {
  const orders = useOrders((s) => s.state);
  const { state: leads } = useLeads();
  const catalog = useCatalog((s) => s.data);

  return useMemo(() => {
    const todos: Todo[] = [];
    if (orders.status === 'ready') {
      const receipts = orders.orders.filter((o) => awaitingReview(o));
      if (receipts.length)
        todos.push({ key: 'receipts', to: a('pedidos?filtro=comprovantes'), title: plural(receipts.length, 'comprovante para conferir', 'comprovantes para conferir'), detail: 'Confira no banco e confirme', tone: 'neutral', icon: <ReceiptText {...ICON} />, rank: 1 });
      const talking = orders.orders.filter((o) => o.status === 'enviado');
      if (talking.length)
        todos.push({
          key: 'talking',
          to: a('pedidos?filtro=enviado'),
          title: plural(talking.length, 'pedido em negociação', 'pedidos em negociação'),
          detail: 'esperando a cliente',
          value: formatBRL(talking.reduce((s, o) => s + o.totalCents, 0)),
          tone: 'warning',
          icon: <Handshake {...ICON} />,
          rank: 3,
        });
    }
    if (resellers.status === 'ready') {
      for (const r of resellers.data.resellers) {
        const first = r.reseller.name.split(/\s+/)[0] ?? r.reseller.name;
        const open = `revendedoras/${encodeURIComponent(r.reseller.id)}`;
        if (r.reportedCents > 0)
          todos.push({ key: `rep-${r.reseller.id}`, to: a(open), title: `${first} avisou que fez o repasse`, detail: 'confira e marque', value: formatBRL(r.reportedCents), tone: 'success', icon: <HandCoins {...ICON} />, rank: 0 });
        const unpaid = r.unpaidCents - r.reportedCents;
        if (unpaid > 0) todos.push({ key: `owe-${r.reseller.id}`, to: a(open), title: `Repasse de ${first} a receber`, detail: 'acerto feito', value: formatBRL(unpaid), tone: 'warning', icon: <HandCoins {...ICON} />, rank: 4 });
        if (r.kit) {
          const d = daysLeft(r.kit.dueAt);
          if (d <= 3)
            todos.push({
              key: `due-${r.reseller.id}`,
              to: a(open),
              title: d < 0 ? `Acerto de ${first} atrasado` : d === 0 ? `Acerto de ${first} é hoje` : `Acerto de ${first} em ${plural(d, 'dia', 'dias')}`,
              detail: `Vendeu ${formatBRL(salesTotalCents(r.sales))} da maleta`,
              tone: d < 0 ? 'danger' : 'warning',
              icon: <CalendarClock {...ICON} />,
              rank: d < 0 ? 0 : 2,
            });
        }
      }
    }
    if (leads.status === 'ready') {
      const fresh = leads.leads.filter((l) => (l.status ?? 'nova') === 'nova').length;
      if (fresh) todos.push({ key: 'leads', to: a('revendedoras?aba=fichas'), title: plural(fresh, 'ficha de revendedora nova', 'fichas de revendedora novas'), detail: 'Veja quem quer revender com você', tone: 'info', icon: <UserPlus {...ICON} />, rank: 3 });
    }
    // Pieces with stock control and nothing left at home.
    const stock = catalog.stock ?? {};
    const soldOut = catalog.products.filter((p) => stock[p.id] && Object.values(stock[p.id]!).every((n) => n === 0)).length;
    if (soldOut) todos.push({ key: 'soldout', to: a('estoque'), title: plural(soldOut, 'peça esgotada', 'peças esgotadas'), detail: 'Registre uma entrada quando chegar mais', tone: 'danger', icon: <PackageMinus {...ICON} />, rank: 5 });
    const done = pendingChecklist.filter((i) => DONE_WHEN[i.key]?.(catalog.settings, catalog.content)).length;
    if (done < pendingChecklist.length)
      todos.push({ key: 'setup', to: a('configuracoes'), title: 'Complete os dados da loja', detail: `${done} de ${pendingChecklist.length} preenchidas`, tone: 'muted', icon: <ClipboardCheck {...ICON} />, rank: 9 });
    todos.sort((x, y) => x.rank - y.rank);
    return {
      todos,
      loading: orders.status === 'loading' || resellers.status === 'loading' || leads.status === 'loading',
      // Never "Tudo em dia" when a list could not be read: something may be waiting.
      failed: orders.status === 'error' || resellers.status === 'error' || leads.status === 'error',
    };
  }, [orders, resellers, leads, catalog]);
}

function Greeting() {
  const now = new Date();
  return (
    <div className="relative">
      <svg aria-hidden="true" viewBox="0 0 220 60" className="pointer-events-none absolute -top-2 right-0 h-14 w-44 text-rose/70 sm:w-56" fill="none">
        <path d="M2 52 C 50 50, 70 18, 112 22 S 170 50, 218 8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <path d="M30 58 C 80 54, 100 30, 140 32 S 190 46, 218 26" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" opacity="0.6" />
      </svg>
      <p id="home-hello" className="relative font-display text-[2.5rem] leading-[1.05] font-semibold lg:text-[2.75rem]">
        {greeting(now)},
      </p>
      <p className="relative mt-1 text-ink-muted first-letter:uppercase">{longDate(now)}</p>
    </div>
  );
}

function Hero() {
  const orders = useOrders((s) => s.state);
  const now = new Date();
  const month = orders.status === 'ready' ? computeReport(orders.orders, periodRange('mes', now), now) : null;
  return (
    <section aria-label="Vendas do mês" className="on-dark relative isolate overflow-hidden rounded-[22px] bg-[linear-gradient(110deg,#4a2f24_0%,#6e4635_55%,#a87b62_100%)] text-white shadow-[0_18px_36px_-18px_rgb(48_33_28/0.6)]">
      <picture>
        <source media="(min-width: 640px)" srcSet={`${asset('images/admin/home-hero-wide-960.webp')} 960w, ${asset('images/admin/home-hero-wide-1600.webp')} 1600w`} sizes="(min-width: 1024px) 640px, 100vw" />
        <img
          src={asset('images/admin/home-hero-640.webp')}
          srcSet={`${asset('images/admin/home-hero-640.webp')} 640w, ${asset('images/admin/home-hero-1024.webp')} 1024w`}
          sizes="100vw"
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover object-right"
          decoding="async"
        />
      </picture>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(60_38_29/0.92)_0%,rgb(60_38_29/0.7)_38%,rgb(60_38_29/0)_68%)]" />
      <div className="flex min-h-[178px] flex-col justify-center p-5 sm:min-h-[200px] sm:p-7">
        <p className="font-display text-[1.375rem] leading-tight text-[#f3e6dc]">Vendas do mês</p>
        <p className="price mt-1 font-display text-[2.625rem] leading-none font-semibold sm:text-[3rem]">{month ? formatBRL(month.revenueCents) : '—'}</p>
        <p className="mt-1.5 text-[0.9375rem] text-white/85">{month ? `${plural(month.orders, 'pedido', 'pedidos')} · ${plural(month.units, 'peça', 'peças')}` : orders.status === 'error' ? 'Não foi possível carregar os pedidos' : 'Carregando…'}</p>
        <Link to={a('relatorio')} className="mt-3 inline-flex min-h-10 w-fit items-center gap-1 text-[0.9375rem] text-white underline decoration-white/60 underline-offset-[6px] hover:decoration-white">
          Ver relatório <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function Tile({ icon, label, value, hint, className }: { icon: ReactNode; label: string; value: string; hint?: string | undefined; className?: string }) {
  return (
    <div className={cx(CARD, 'flex min-w-0 flex-col p-3 sm:p-4', className)}>
      <span className="mb-2 inline-flex size-9 items-center justify-center rounded-xl bg-champagne text-copper">{icon}</span>
      <p className="text-[0.8125rem] leading-tight text-ink-muted">{label}</p>
      <p className="price mt-0.5 text-[1.375rem] leading-tight font-semibold whitespace-nowrap sm:text-[1.5rem] lg:text-[1.25rem] xl:text-[1.375rem]">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function Today() {
  const orders = useOrders((s) => s.state);
  const now = new Date();
  const today = orders.status === 'ready' ? computeReport(orders.orders, periodRange('hoje', now), now) : null;
  const small = { size: 18, strokeWidth: 1.7, 'aria-hidden': true } as const;
  return (
    <section aria-labelledby="home-today">
      <SectionHeading id="home-today" title="Hoje na loja" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <Tile icon={<ShoppingBag {...small} />} label="Pedidos" value={today ? String(today.orders + today.negotiating.orders) : '—'} hint={today?.negotiating.orders ? `${today.negotiating.orders} em negociação` : undefined} />
        <Tile icon={<Layers {...small} />} label="Peças vendidas" value={today ? String(today.units) : '—'} />
        <Tile className="col-span-2 sm:col-span-1" icon={<BarChart3 {...small} />} label="Vendido hoje" value={today ? formatBRL(today.revenueCents) : '—'} />
      </div>
    </section>
  );
}

function NeedsYou({ resellers }: { resellers: ResellersState }) {
  const { todos, loading, failed } = useTodos(resellers);
  return (
    <section aria-labelledby="home-todo">
      <SectionHeading id="home-todo" title="Precisa de você" />
      {failed && (
        <p role="status" className="mb-3 rounded-2xl bg-warning-tint px-4 py-3 text-sm text-warning">
          Não deu para conferir tudo agora. Verifique a conexão; a lista se atualiza sozinha.
        </p>
      )}
      {todos.length ? (
        <ul className={cx(CARD, 'overflow-hidden px-1')}>
          {todos.map((t, i) => (
            <li key={t.key} className={cx(i > 0 && 'border-t border-line/70', 'mx-3')}>
              <Link to={t.to} className="-mx-3 flex min-h-[64px] items-center gap-3.5 px-3 py-2.5 transition-colors hover:bg-[#fcf8f5]">
                <span className={cx('inline-flex size-10 shrink-0 items-center justify-center rounded-xl', TODO_TONE[t.tone])}>{t.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug font-medium">{t.title}</span>
                  <span className="block truncate text-[0.8125rem] text-ink-muted">
                    {t.value && <span className="price font-medium text-ink">{t.value} · </span>}
                    {t.detail}
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : failed ? null : (
        <div className={cx(CARD, 'flex items-center gap-4 p-4')}>
          <img src={asset('images/admin/tudo-em-dia-320.webp')} alt="" width={88} height={88} className="size-[88px] shrink-0 rounded-xl object-cover" />
          <div>
            <p className="font-display text-[1.375rem] leading-tight font-semibold">{loading ? 'Conferindo…' : 'Tudo em dia'}</p>
            <p className="text-sm text-ink-muted">{loading ? 'Um instante.' : 'Nada esperando por você agora.'}</p>
          </div>
        </div>
      )}
    </section>
  );
}

const ACTIONS = [
  { to: a('pedidos?novo=1'), label: 'Novo pedido', icon: Plus },
  { to: a('produtos/nova'), label: 'Nova peça', icon: Gem },
  { to: a('estoque?entrada=1'), label: 'Entrada no estoque', icon: PackagePlus },
  { to: a('revendedoras?nova=1'), label: 'Nova revendedora', icon: UserPlus },
];

function QuickActions() {
  return (
    <section aria-labelledby="home-actions">
      <SectionHeading id="home-actions" title="Ações rápidas" />
      <ul className="grid grid-cols-4 gap-2 sm:gap-3">
        {ACTIONS.map((x) => (
          <li key={x.label}>
            <Link to={x.to} className={cx(CARD, 'flex h-full min-h-[96px] flex-col items-center justify-center gap-2 px-1.5 py-3 text-center text-[0.8125rem] leading-tight transition-colors hover:border-copper')}>
              <x.icon size={26} strokeWidth={1.4} aria-hidden="true" className="text-copper" />
              {x.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Network({ state }: { state: ResellersState }) {
  const all = state.status === 'ready' ? state.data.resellers : [];
  const list = all.filter((r) => r.reseller.status === 'ativa');
  // Same total as the Revendedoras summary: every kit still out, whatever her status.
  const inKits = all.reduce((s, r) => s + (r.kit ? kitValueCents(r.kit.items) : 0), 0);
  return (
    <Link to={a('revendedoras')} className={cx(CARD, 'group flex items-stretch overflow-hidden transition-colors hover:border-copper')}>
      <img src={asset('images/admin/maleta-320.webp')} alt="" width={120} height={120} className="w-[112px] shrink-0 object-cover sm:w-[128px]" />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 border-l border-line px-4 py-3.5">
        <span className="flex items-center justify-between gap-2">
          <span className="font-display text-[1.5rem] leading-tight font-semibold">Revendas</span>
          <span className="inline-flex items-center gap-0.5 text-sm text-copper underline-offset-4 group-hover:underline">
            Ver <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <Users size={16} strokeWidth={1.6} aria-hidden="true" className="text-ink-muted" />
          {state.status === 'ready' ? plural(list.length, 'ativa', 'ativas') : 'Carregando…'}
        </span>
        <span className="flex items-center gap-2 text-sm">
          <BriefcaseBusiness size={16} strokeWidth={1.6} aria-hidden="true" className="text-ink-muted" />
          <span className="price">{formatBRL(inKits)}</span> em maletas
        </span>
      </span>
    </Link>
  );
}

function Storefront() {
  return (
    <a href="/" target="_blank" rel="noopener noreferrer" className={cx(CARD, 'group flex items-stretch overflow-hidden transition-colors hover:border-copper')}>
      <img src={asset('images/admin/vitrine-320.webp')} alt="" width={120} height={120} className="w-[112px] shrink-0 object-cover sm:w-[128px]" />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 border-l border-line px-4 py-3.5">
        <span className="flex items-center justify-between gap-2">
          <span className="font-display text-[1.5rem] leading-tight font-semibold">Sua vitrine</span>
          <ExternalLink size={17} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ink-muted group-hover:text-copper" />
        </span>
        <span className="text-sm text-ink-muted">Veja o site como suas clientes veem.</span>
      </span>
    </a>
  );
}

export function HomePage() {
  // One request for the reseller list, shared by the to-dos and the Revendas card.
  const { state: resellers } = useResellers();
  // Phone: one column (hero, today, to-dos, actions, network); desktop: two columns. The column
  // wrappers dissolve (`contents`) on phones so `order` can interleave their blocks.
  return (
    <div className="flex flex-col gap-7 lg:gap-8">
      <Greeting />
      <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-7">
          <div className="order-1">
            <Hero />
          </div>
          <div className="order-3">
            <NeedsYou resellers={resellers} />
          </div>
        </div>
        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-7">
          <div className="order-2">
            <Today />
          </div>
          <div className="order-4">
            <QuickActions />
          </div>
          <div className="order-5 flex flex-col gap-3">
            <Network state={resellers} />
            <Storefront />
          </div>
        </div>
      </div>
    </div>
  );
}
