import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Award, BarChart3, BellRing, BriefcaseBusiness, CalendarDays, ChevronRight, CircleOff, Info, Layers, Users, Wallet, Copy, Download, ExternalLink, HandCoins, KeyRound, Pause, Pencil, Play, Plus, Trash2, UserPlus } from 'lucide-react';
import { Button, ButtonAnchor } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TextArea, TextField } from '../../components/ui/Field';
import { WhatsAppIcon } from '../../components/ui/Icons';
import { Chip } from '../../components/ui/Misc';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../components/ui/cx';
import { sizeLabel } from '../../data/catalog';
import { firstNameOf } from '../../data/messages';
import {
  commissionFor,
  daysLeft,
  kitDiscounts,
  kitState,
  kitValueCents,
  PAYMENT_LABEL,
  repasseState,
  RESELLER_STATUS_LABEL,
  saleDiscountCents,
  salesTotalCents,
  type Kit,
  type Program,
  type Reseller,
  type ResellerSale,
  type ResellerStatus,
} from '../../data/revenda';
import { FINISH_LABEL, type ResellerLead } from '../../data/schema';
import { formatBRL, parseBRL } from '../../lib/format';
import { whatsappUrl } from '../../lib/whatsapp';
import { toast } from '../../store/ui';
import { SwitchRow } from '../FormBits';
import { Avatar, Card, CARD, Empty, Pill, Tabs, type Tone } from '../ui';
import { useLeads } from '../lib/leads';
import { asset } from '../../lib/assets';
import { formatDateTime, formatPhone } from '../lib/contact';
import { downloadText, fileDate } from '../lib/download';
import { checkContract, clearRepasseReport, eraseReseller, erasureBlocker, isError, markKitPaid, newInvite, patchReseller, saveProgram, settlementsCsv, showcaseLink, useProgram, useResellerDetail, useResellers, type ResellerSummary } from '../lib/resellers';
import { LeadsPage } from './LeadsPage';
import { copyText } from './OrderMessages';
import { InviteMessage, KitEditor, NewResellerForm, SettleForm } from './ResellerForms';
import { countInput } from '../../lib/countInput';

/*
 * Painel → Revendedoras (docs/revenda/PLAN.md §2–§5): the resellers with their
 * kits, the applications to review, and the program (commission, cycle,
 * contract).
 */

type Tab = 'revendedoras' | 'fichas' | 'programa';
type DetailTab = 'resumo' | 'maleta' | 'vendas' | 'acertos' | 'dados';
const TABS: Tab[] = ['revendedoras', 'fichas', 'programa'];

const STATUS_TONE: Record<ResellerStatus, Tone> = { ativa: 'success', pausada: 'warning', encerrada: 'muted' };

function StatusPill({ status }: { status: ResellerStatus }) {
  return (
    <Pill tone={STATUS_TONE[status]} dot>
      {RESELLER_STATUS_LABEL[status]}
    </Pill>
  );
}

function dueLabel(kit: Kit): { text: string; late: boolean; tone: Tone } {
  const d = daysLeft(kit.dueAt);
  if (d < 0) return { text: `Acerto atrasado ${-d} ${d === -1 ? 'dia' : 'dias'}`, late: true, tone: 'danger' };
  if (d === 0) return { text: 'Acerto hoje', late: true, tone: 'danger' };
  return { text: `Acerto em ${d} ${d === 1 ? 'dia' : 'dias'}`, late: d <= 3, tone: d <= 3 ? 'warning' : 'info' };
}

const pieces = (n: number) => `${n} ${n === 1 ? 'peça' : 'peças'}`;

/** Units in the kit and units sold (active sales). */
function kitCounts(kit: Kit, sales: ResellerSale[]) {
  const lines = kitState(kit, sales);
  return { total: lines.reduce((n, l) => n + l.qty, 0), sold: lines.reduce((n, l) => n + l.sold, 0) };
}

function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className={cx('h-1.5 overflow-hidden rounded-full bg-[#efe4dc]', className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-rose to-copper transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function ResellerCard({ item, onOpen }: { item: ResellerSummary; onOpen: () => void }) {
  const { reseller, kit, sales } = item;
  const sold = salesTotalCents(sales);
  const due = kit ? dueLabel(kit) : null;
  const counts = kit ? kitCounts(kit, sales) : null;
  const owed = item.unpaidCents - item.reportedCents;
  return (
    <button type="button" onClick={onOpen} className={cx(CARD, 'flex w-full flex-col gap-3.5 p-4 text-left transition-[border-color,box-shadow] hover:border-copper hover:shadow-[0_6px_18px_-8px_rgb(48_33_28/0.25)] focus-visible:outline-2 focus-visible:outline-copper')}>
      <div className="flex w-full items-center gap-3 border-b border-line/70 pb-3">
        <Avatar name={reseller.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{reseller.name}</p>
          <p className="truncate text-sm text-ink-muted">{[reseller.city, reseller.uf].filter(Boolean).join('/') || 'Cidade não informada'}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill status={reseller.status} />
          {!reseller.hasPin && reseller.status === 'ativa' && <Pill tone="warning">Convite pendente</Pill>}
        </div>
        <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" className="-mr-1 shrink-0 text-ink-muted" />
      </div>
      {kit && counts ? (
        <>
          <dl className="grid w-full grid-cols-2 divide-x divide-line">
            <div className="pr-3">
              <dt className="text-xs text-ink-muted">Na maleta</dt>
              <dd className="price text-[1.0625rem] font-semibold">{formatBRL(kitValueCents(kit.items))}</dd>
            </div>
            <div className="pl-4">
              <dt className="text-xs text-ink-muted">Vendido</dt>
              <dd className="price text-[1.0625rem] font-semibold">{formatBRL(sold)}</dd>
            </div>
          </dl>
          <div className="w-full">
            <Progress value={counts.total ? counts.sold / counts.total : 0} label="Peças vendidas da maleta" />
            <div className="mt-2 flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-muted">
                {counts.sold} de {pieces(counts.total)}
              </span>
              {due && (
                <Pill tone={due.tone === 'info' ? 'success' : due.tone}>
                  <CalendarDays size={13} strokeWidth={1.75} aria-hidden="true" /> {due.text}
                </Pill>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="w-full rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-muted">Sem maleta no momento</p>
      )}
      {item.reportedCents > 0 && (
        <p className="flex w-full items-center gap-2 rounded-xl bg-warning-tint px-3 py-2 text-sm text-warning">
          <BellRing size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          <span>
            Avisou que fez o repasse de <span className="price font-semibold">{formatBRL(item.reportedCents)}</span>
          </span>
        </p>
      )}
      {owed > 0 && (
        <p className="flex w-full items-center gap-2 rounded-xl bg-danger-tint px-3 py-2 text-sm text-danger">
          <HandCoins size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          <span>
            Repasse a receber: <span className="price font-semibold">{formatBRL(owed)}</span>
          </span>
        </p>
      )}
    </button>
  );
}

/** The network at a glance, above the list. */
function NetworkSummary({ list }: { list: ResellerSummary[] }) {
  const active = list.filter((r) => r.reseller.status === 'ativa');
  const inKits = list.reduce((s, r) => s + (r.kit ? kitValueCents(r.kit.items) : 0), 0);
  const sold = list.reduce((s, r) => s + (r.kit ? salesTotalCents(r.sales) : 0), 0);
  const toReceive = list.reduce((s, r) => s + r.unpaidCents, 0);
  const cells = [
    { label: active.length === 1 ? 'Ativa' : 'Ativas', value: String(active.length), icon: Users },
    { label: 'Em maletas', value: formatBRL(inKits), icon: BriefcaseBusiness },
    { label: 'Vendido no ciclo', value: formatBRL(sold), icon: BarChart3 },
    { label: 'A receber', value: formatBRL(toReceive), icon: Wallet },
  ];
  return (
    <section aria-label="Resumo das revendas" className="on-dark relative isolate overflow-hidden rounded-[22px] bg-[linear-gradient(115deg,#4a2f24_0%,#6e4635_60%,#94654f_100%)] text-white shadow-[0_18px_36px_-20px_rgb(48_33_28/0.6)]">
      <img src={asset('images/admin/revenda-hero-640.webp')} alt="" aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 h-full w-1/2 object-cover object-right opacity-70 [mask-image:linear-gradient(90deg,transparent,black_60%)]" />
      <dl className="grid grid-cols-2 sm:grid-cols-4">
        {cells.map((c, i) => (
          <div key={c.label} className={cx('flex min-w-0 items-center gap-3 px-4 py-4 sm:px-5', i % 2 === 1 && 'border-l border-white/15', i > 1 && 'border-t border-white/15 sm:border-t-0', i === 2 && 'sm:border-l')}>
            <c.icon size={22} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-rose-light" />
            <div className="flex min-w-0 flex-col-reverse">
              <dt className="text-xs text-white/75">{c.label}</dt>
              <dd className="price truncate text-[1.125rem] leading-tight font-semibold">{c.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ResellerDetailView({ id, program, onClose }: { id: string; program: Program; onClose: () => void }) {
  const { state, reload } = useResellerDetail(id);
  const [sheet, setSheet] = useState<'kit' | 'settle' | 'edit' | null>(null);
  const [ending, setEnding] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // null = not chosen yet: opens on Acertos while a repasse waits, otherwise on Resumo.
  const [chosenTab, setTab] = useState<DetailTab | null>(null);
  if (state.status === 'loading') return <p className="py-8 text-center text-ink-muted" aria-busy="true">Carregando…</p>;
  if (state.status === 'error') return <p role="alert" className="py-8 text-center text-danger">{state.message}</p>;
  const { reseller, kits, sales, acceptances, invitePendingUntil } = state.data;
  const open = kits.find((k) => k.status === 'aberta') ?? null;
  const openSales = open ? sales.filter((s) => s.kitId === open.id) : [];
  const discounts = open ? kitDiscounts(open, openSales) : { cents: 0, sales: 0 };
  const closed = kits.filter((k) => k.status === 'fechada');
  const contractDue = !reseller.contract || reseller.contract.version < program.contract.version || reseller.contract.mode !== program.contract.mode;
  const eraseBlocked = erasureBlocker(reseller, kits);

  async function regenerate() {
    if (busy) return;
    setBusy(true);
    const r = await newInvite(reseller.id);
    setBusy(false);
    if (isError(r)) return toast(r.error, { tone: 'error' });
    setInvite(r.invite.token);
    reload();
  }

  // Repasse not received yet: ending the partnership would hide it from her panel.
  const owedCents = kits.reduce((sum, k) => {
    const st = k.status === 'fechada' && k.settlement ? repasseState(k.settlement) : 'none';
    return sum + (st === 'pending' || st === 'reported' ? k.settlement!.dueCents : 0);
  }, 0);

  async function setStatus(status: ResellerStatus) {
    if (busy) return;
    setBusy(true);
    const r = await patchReseller(reseller, { status });
    setBusy(false);
    if (isError(r)) return toast(r.error, { tone: 'error', duration: 9000 });
    toast(status === 'ativa' ? 'Revendedora reativada.' : status === 'pausada' ? 'Revendedora pausada: o acesso dela foi encerrado.' : 'Parceria encerrada.', { tone: 'success' });
    reload();
  }

  const first = firstNameOf(reseller.name);
  const city = [reseller.city, reseller.uf].filter(Boolean).join('/');
  const since = new Date(reseller.createdAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').replace(' de ', '/');
  const sold = salesTotalCents(openSales);
  const commission = open ? commissionFor(sold, open.tiers) : null;
  const counts = open ? kitCounts(open, openSales) : null;
  const due = open ? dueLabel(open) : null;
  const activeSales = openSales.filter((s) => s.status === 'ativa').length;
  const repasseOpen = closed.filter((k) => k.settlement && ['pending', 'reported'].includes(repasseState(k.settlement))).length;
  const panelId = `reseller-${reseller.id}-panel`;
  const tab: DetailTab = chosenTab ?? (repasseOpen > 0 && !open ? 'acertos' : 'resumo');

  const makeKit =
    reseller.status === 'ativa' ? (
      <Button onClick={() => setSheet('kit')}>
        <Plus size={18} strokeWidth={1.5} /> Montar maleta
      </Button>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={reseller.name} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink-muted">
            {city || 'Cidade não informada'} · desde {since}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <StatusPill status={reseller.status} />
            {!reseller.hasPin && reseller.status === 'ativa' && <Pill tone="warning">Convite pendente</Pill>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ButtonAnchor href={whatsappUrl(`55${reseller.whatsapp}`, `Oi, ${first}!`)} variant="secondary" size="sm">
          <WhatsAppIcon size={17} /> WhatsApp
        </ButtonAnchor>
        <Button variant="secondary" size="sm" onClick={() => void copyText(showcaseLink(reseller.slug), 'Link do mostruário copiado.')}>
          <Copy size={17} strokeWidth={1.5} /> Mostruário
        </Button>
      </div>

      {contractDue && reseller.contract && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-tint px-3 py-2.5 text-sm text-warning">
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" /> O contrato mudou: as vendas dela ficam paradas até ela aceitar a versão nova.
        </p>
      )}

      <div className="sticky top-0 z-10 -mx-5 bg-ivory/95 px-5 backdrop-blur supports-[backdrop-filter]:bg-ivory/85">
        <Tabs
          label={`Ficha de ${first}`}
          panelId={panelId}
          variant="underline"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'resumo', label: 'Resumo' },
            { id: 'maleta', label: 'Maleta' },
            { id: 'vendas', label: 'Vendas', count: open ? activeSales : undefined },
            { id: 'acertos', label: 'Acertos', count: repasseOpen || undefined, alert: true },
            { id: 'dados', label: 'Dados' },
          ]}
        />
      </div>

      <div id={panelId} role="tabpanel" className="flex flex-col gap-4">
        {tab === 'resumo' &&
          (open && commission && counts && due ? (
            <>
              <Card className="p-4">
                <p className="flex items-center gap-2.5 font-display text-[1.375rem] leading-tight font-semibold">
                  <span className="inline-flex size-8 items-center justify-center rounded-lg bg-champagne text-copper">
                    <Wallet size={17} strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  Acerto atual
                </p>
                <dl className="mt-3 flex flex-col gap-2 text-[0.9375rem]">
                  <div className="flex justify-between gap-3">
                    <dt>Total vendido</dt>
                    <dd className="price">{formatBRL(sold)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 text-ink-muted">
                    <dt>
                      Comissão da {first} ({commission.percent}%)
                    </dt>
                    <dd className="price">− {formatBRL(commission.commissionCents)}</dd>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-3">
                    <dt className="font-medium">A ÉKA recebe</dt>
                    <dd className="price font-display text-[1.875rem] leading-none font-semibold text-copper-dark">{formatBRL(sold - commission.commissionCents)}</dd>
                  </div>
                </dl>
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#f8f1ec] px-3 py-2 text-sm text-ink-muted">
                  <Info size={15} strokeWidth={1.75} aria-hidden="true" className="shrink-0" /> A comissão fica com a {first}; o restante vem para a ÉKA.
                </p>
              </Card>
              <Card className="p-4">
                <p className="mb-2 flex items-center gap-2 text-sm">
                  <Award size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-copper" />
                  <span className="font-medium">
                    {commission.percent}%{commission.next && ` → ${commission.next.percent}%`}
                  </span>
                  <span className="text-ink-muted">{commission.next ? `faltam ${formatBRL(commission.next.missingCents)}` : '· faixa máxima'}</span>
                </p>
                <Progress value={commission.progress} label="Caminho até a próxima faixa de comissão" />
              </Card>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: BriefcaseBusiness, label: 'Maleta', value: formatBRL(kitValueCents(open.items)), late: false },
                  { icon: Layers, label: 'Peças', value: `${counts.sold} de ${counts.total}`, late: false },
                  { icon: CalendarDays, label: 'Acerto', value: due.text.replace('Acerto ', ''), late: due.late },
                ].map((t) => (
                  <div key={t.label} className={cx(CARD, 'flex flex-col items-center gap-0.5 px-1.5 py-3 text-center')}>
                    <t.icon size={19} strokeWidth={1.5} aria-hidden="true" className="mb-1 text-copper" />
                    <p className="text-xs text-ink-muted">{t.label}</p>
                    <p className={cx('price text-[0.875rem] font-semibold whitespace-nowrap', t.late && 'text-danger')}>{t.value}</p>
                  </div>
                ))}
              </div>
              <Button size="lg" block onClick={() => setSheet('settle')}>
                <Wallet size={19} strokeWidth={1.6} aria-hidden="true" /> Fazer acerto
              </Button>
            </>
          ) : (
            <Empty title="Sem maleta no momento" image={<img src={asset('images/admin/maleta-320.webp')} alt="" width={96} height={96} className="mb-1 size-24 rounded-2xl object-cover" />} action={makeKit}>
              {reseller.status === 'ativa' ? 'Monte a maleta com as peças que ela vai levar.' : `Revendedora ${RESELLER_STATUS_LABEL[reseller.status].toLowerCase()}.`}
            </Empty>
          ))}

        {tab === 'maleta' &&
          (open ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink-muted">
                  {pieces(counts?.total ?? 0)} · <span className="price">{formatBRL(kitValueCents(open.items))}</span>
                </p>
                <Button variant="secondary" size="sm" onClick={() => setSheet('kit')}>
                  Ajustar peças
                </Button>
              </div>
              <ul className={cx(CARD, 'divide-y divide-line/70 overflow-hidden')}>
                {kitState(open, openSales).map((l) => (
                  <li key={`${l.productId}|${l.variantId}|${l.size}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.name}</p>
                      <p className="text-ink-muted">
                        {FINISH_LABEL[l.finish]}
                        {l.size && ` · ${sizeLabel(l.size)}`} · <span className="price">{formatBRL(l.unitCents)}</span>
                      </p>
                    </div>
                    <Pill tone={l.sold >= l.qty ? 'success' : l.sold > 0 ? 'info' : 'muted'}>
                      {l.sold}/{l.qty} vendidas
                    </Pill>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty title="Sem maleta no momento" action={makeKit}>
              Quando ela levar peças, elas aparecem aqui.
            </Empty>
          ))}

        {tab === 'vendas' &&
          (openSales.length ? (
            <>
              {open && discounts.cents > 0 && (
                <p className="rounded-xl bg-danger-tint px-3 py-2 text-sm text-danger">
                  Descontos no ciclo: <span className="price font-medium">{formatBRL(discounts.cents)}</span> em {discounts.sales === 1 ? '1 venda' : `${discounts.sales} vendas`}.
                </p>
              )}
              <ul className={cx(CARD, 'divide-y divide-line/70 overflow-hidden')}>
                {openSales.map((s) => {
                  const discount = open ? saleDiscountCents(open, s) : 0;
                  return (
                    <li key={s.id} className={cx('px-4 py-3 text-sm', s.status === 'cancelada' && 'opacity-60')}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-ink-muted">{formatDateTime(s.createdAt)}</span>
                        <span className="price font-semibold">{formatBRL(s.totalCents)}</span>
                      </div>
                      <p className="mt-0.5">{s.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Pill tone="muted">{PAYMENT_LABEL[s.payment]}</Pill>
                        {s.customer?.name && <Pill tone="neutral">{s.customer.name}</Pill>}
                        {s.status === 'cancelada' && <Pill tone="danger">Desfeita</Pill>}
                      </div>
                      {discount > 0 && (
                        <p className="mt-1.5 font-medium text-danger">
                          Desconto de <span className="price">{formatBRL(discount)}</span> · preço da maleta <span className="price">{formatBRL(s.totalCents + discount)}</span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <Empty title="Nenhuma venda neste ciclo">As vendas que ela registrar no painel dela aparecem aqui na hora.</Empty>
          ))}

        {tab === 'acertos' &&
          (closed.length ? (
            <ul className="flex flex-col gap-3">
              {closed.map((k) => {
                const st = k.settlement ? repasseState(k.settlement) : 'none';
                return (
                  <li key={k.id} className={cx(CARD, 'p-4 text-sm')}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-ink-muted">{formatDateTime(k.closedAt ?? k.updatedAt)}</p>
                        <p className="price mt-0.5 font-display text-[1.625rem] leading-tight font-semibold">{formatBRL(k.settlement?.dueCents ?? 0)}</p>
                        <p className="text-xs text-ink-muted">a ÉKA recebe</p>
                      </div>
                      <Pill tone={st === 'paid' ? 'success' : st === 'reported' ? 'warning' : st === 'pending' ? 'danger' : 'muted'} dot>
                        {st === 'paid' ? 'Recebido' : st === 'reported' ? 'Ela avisou' : st === 'pending' ? 'A receber' : 'Sem repasse'}
                      </Pill>
                    </div>
                    <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">Vendeu</dt>
                        <dd className="price">{formatBRL(k.settlement?.soldCents ?? 0)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">
                          Comissão da {first} ({k.settlement?.percent}%)
                        </dt>
                        <dd className="price">− {formatBRL(k.settlement?.commissionCents ?? 0)}</dd>
                      </div>
                      {!!k.settlement?.missingCents && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Peças que faltaram</dt>
                          <dd className="price">+ {formatBRL(k.settlement.missingCents)}</dd>
                        </div>
                      )}
                    </dl>
                    {k.settlement && st === 'reported' && (
                      <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-warning-tint px-3 py-2 text-warning">
                        <span>Ela avisou que pagou em {formatDateTime(k.settlement.reportedAt!)}. Confira no banco.</span>
                        <button
                          type="button"
                          className="min-h-11 text-sm underline underline-offset-4"
                          onClick={() => void clearRepasseReport(k).then((r) => (isError(r) ? toast(r.error, { tone: 'error' }) : (toast('Aviso desfeito. O repasse voltou a aparecer como pendente para ela.', { tone: 'success' }), reload())))}
                        >
                          Desfazer aviso
                        </button>
                      </div>
                    )}
                    {k.settlement && st !== 'none' && (
                      <SwitchRow
                        className="mt-3 border-t border-line pt-3"
                        label="Repasse recebido"
                        {...(k.settlement.paidAt ? { hint: `Marcado em ${formatDateTime(k.settlement.paidAt)}${k.settlement.reportedAt ? ` · ela avisou em ${formatDateTime(k.settlement.reportedAt)}` : ''}` } : {})}
                        checked={!!k.settlement.paidAt}
                        onChange={(paid) => void markKitPaid(k, paid).then((r) => (isError(r) ? toast(r.error, { tone: 'error' }) : reload()))}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="Nenhum acerto ainda">Quando você fizer o acerto da maleta, ele fica guardado aqui.</Empty>
          ))}

        {tab === 'dados' && (
          <>
            <Card className="p-4">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                <dt className="text-ink-muted">WhatsApp</dt>
                <dd className="price">{formatPhone(reseller.whatsapp)}</dd>
                <dt className="text-ink-muted">Cidade</dt>
                <dd>{city || '—'}</dd>
                <dt className="text-ink-muted">Mostruário</dt>
                <dd className="break-all">
                  <a className="text-copper underline underline-offset-4" href={`/r/${reseller.slug}`} target="_blank" rel="noopener noreferrer">
                    /r/{reseller.slug}
                  </a>
                </dd>
                <dt className="text-ink-muted">Comissão</dt>
                <dd>{reseller.tiers ? `${reseller.tiers[0]?.percent}% fixa` : 'Faixas do programa'}</dd>
                <dt className="text-ink-muted">Contrato</dt>
                <dd>
                  {reseller.contract ? `Aceito em ${formatDateTime(reseller.contract.acceptedAt)} (versão ${reseller.contract.version})` : 'Ainda não aceito'}
                  {reseller.contract?.mode === 'link' && !reseller.contract.checkedAt && (
                    <button type="button" className="ml-2 text-copper underline underline-offset-4" onClick={() => void checkContract(reseller.id).then((r) => (isError(r) ? toast(r.error, { tone: 'error' }) : reload()))}>
                      Marcar assinatura conferida
                    </button>
                  )}
                </dd>
                <dt className="text-ink-muted">Acesso</dt>
                <dd>{reseller.status !== 'ativa' ? (reseller.status === 'pausada' ? 'Acesso pausado' : 'Acesso encerrado') : reseller.hasPin ? `Painel ativo${reseller.lastSeenAt ? ` · visto ${formatDateTime(reseller.lastSeenAt)}` : ''}` : invitePendingUntil ? `Convite válido até ${formatDateTime(invitePendingUntil)}` : 'Sem convite válido'}</dd>
              </dl>
              {acceptances[0] && (
                <details className="group mt-3 border-t border-line pt-2 text-sm text-ink-muted">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                    <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" className="transition-transform group-open:rotate-90" /> Registro do aceite
                  </summary>
                  <p className="mt-1 break-all">
                    Nome digitado: {acceptances[0].typedName} · {formatDateTime(acceptances[0].acceptedAt)} · versão {acceptances[0].version} · SHA-256 do texto: {acceptances[0].textSha256}
                  </p>
                </details>
              )}
            </Card>

            {invite ? (
              <InviteMessage reseller={reseller} token={invite} />
            ) : (
              reseller.status === 'ativa' && (
                <Card className="flex items-center gap-3 p-4">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-champagne text-copper">
                    <KeyRound size={19} strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <p className="min-w-0 flex-1 text-sm">{reseller.hasPin ? 'Ela esqueceu o PIN?' : 'Ela ainda não entrou no painel.'}</p>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void regenerate()}>
                    {reseller.hasPin ? 'Novo acesso' : 'Novo convite'}
                  </Button>
                </Card>
              )
            )}

            <ul className={cx(CARD, 'divide-y divide-line/70 overflow-hidden text-sm')}>
              <li>
                <button type="button" className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-[#fcf8f5]" onClick={() => setSheet('edit')}>
                  <Pencil size={17} strokeWidth={1.6} aria-hidden="true" className="text-copper" /> <span className="flex-1">Editar dados e comissão</span>
                  <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />
                </button>
              </li>
              <li>
                {reseller.status === 'ativa' ? (
                  <button type="button" className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-[#fcf8f5]" disabled={busy} onClick={() => void setStatus('pausada')}>
                    <Pause size={17} strokeWidth={1.6} aria-hidden="true" className="text-warning" /> <span className="flex-1">Pausar revendedora</span>
                    <span className="text-xs text-ink-muted">encerra o acesso</span>
                  </button>
                ) : (
                  <button type="button" className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-[#fcf8f5]" disabled={busy} onClick={() => void setStatus('ativa')}>
                    <Play size={17} strokeWidth={1.6} aria-hidden="true" className="text-success" /> <span className="flex-1">Reativar revendedora</span>
                  </button>
                )}
              </li>
              {reseller.status !== 'encerrada' && !open && owedCents === 0 && (
                <li>
                  <button type="button" className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-danger hover:bg-danger-tint" disabled={busy} onClick={() => setEnding(true)}>
                    <CircleOff size={17} strokeWidth={1.6} aria-hidden="true" /> <span className="flex-1">Encerrar parceria</span>
                  </button>
                </li>
              )}
            </ul>
            {reseller.status !== 'encerrada' && !open && owedCents > 0 && (
              <p className="text-sm text-ink-muted">
                Para encerrar a parceria, marque antes o repasse de <span className="price">{formatBRL(owedCents)}</span> como recebido em “Acertos”.
              </p>
            )}
            {reseller.status === 'encerrada' && (
              <Card as="section" aria-labelledby="erase-title" className="flex flex-col gap-2 p-4">
                <h3 id="erase-title" className="font-display text-title font-semibold">
                  Dados pessoais
                </h3>
                <p className="text-sm text-ink-muted">A parceria terminou. Se ela pedir, ou quando você não precisar mais do histórico dela, dá para apagar os dados dela do sistema.</p>
                {eraseBlocked && <p className="text-sm text-danger">{eraseBlocked}</p>}
                <Button variant="secondary" className="self-start" disabled={!!eraseBlocked} onClick={() => setErasing(true)}>
                  <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" /> Apagar os dados de {first}
                </Button>
              </Card>
            )}
          </>
        )}
      </div>

      {erasing && <EraseResellerDialog reseller={reseller} kits={kits} onCancel={() => setErasing(false)} onErased={onClose} />}
      <ConfirmDialog
        open={ending}
        title="Encerrar a parceria?"
        confirmLabel="Encerrar parceria"
        tone="danger"
        onCancel={() => setEnding(false)}
        onConfirm={() => {
          setEnding(false);
          void setStatus('encerrada');
        }}
      >
        O acesso de {firstNameOf(reseller.name)} ao painel termina e o mostruário digital dela passa a mostrar só o contato da ÉKA. O histórico de maletas e vendas continua guardado e dá para reativar depois. Se ela pedir, depois dá para apagar os dados dela.
      </ConfirmDialog>

      <Sheet open={sheet === 'kit'} onClose={() => setSheet(null)} title={open ? 'Ajustar maleta' : `Maleta de ${firstNameOf(reseller.name)}`} side="right">
        {sheet === 'kit' && (
          <KitEditor
            resellerId={reseller.id}
            kit={open}
            onDone={() => {
              setSheet(null);
              reload();
            }}
          />
        )}
      </Sheet>
      <Sheet open={sheet === 'settle'} onClose={() => setSheet(null)} title="Acerto da maleta" side="right">
        {sheet === 'settle' && open && (
          <SettleForm
            kit={open}
            sales={openSales}
            onDone={() => {
              setSheet(null);
              reload();
            }}
          />
        )}
      </Sheet>
      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Dados da revendedora" side="right">
        {sheet === 'edit' && (
          <EditReseller
            reseller={reseller}
            program={program}
            onDone={() => {
              setSheet(null);
              reload();
            }}
          />
        )}
      </Sheet>
      <span className="sr-only">
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </span>
    </div>
  );
}

/**
 * Confirms the erasure of a reseller who left (LGPD): says what disappears and what stays, offers her
 * settlements as a spreadsheet first, and asks for an explicit "it cannot be undone".
 */
function EraseResellerDialog({ reseller, kits, onCancel, onErased }: { reseller: Reseller; kits: Kit[]; onCancel: () => void; onErased: () => void }) {
  const [understood, setUnderstood] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = firstNameOf(reseller.name);

  function download() {
    downloadText(`eka-acertos-${reseller.slug}-${fileDate()}.csv`, settlementsCsv(reseller, kits), 'text/csv;charset=utf-8');
    setDownloaded(true);
  }

  async function erase() {
    if (busy || !understood) return;
    setBusy(true);
    setError('');
    const r = await eraseReseller(reseller);
    setBusy(false);
    if (isError(r)) return setError(r.error);
    toast(`Dados de ${first} apagados.`, { tone: 'success' });
    onErased();
  }

  return (
    <Sheet open onClose={() => !busy && onCancel()} title={`Apagar os dados de ${first}?`} side="center">
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <p className="font-medium">Saem do sistema, para sempre:</p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-ink-muted">
            <li>nome, WhatsApp, cidade, Instagram e a ficha de cadastro dela;</li>
            <li>o PIN e o acesso ao painel de revendedora;</li>
            <li>o registro do aceite do contrato;</li>
            <li>as maletas, os acertos e as vendas dela, com os nomes e telefones das clientes que ela registrou;</li>
            <li>
              o mostruário <span className="break-all">/r/{reseller.slug}</span>, que sai do ar.
            </li>
          </ul>
        </div>
        <p className="text-ink-muted">No histórico do estoque, as entradas e saídas das maletas continuam, só como “Maleta”, sem o nome dela.</p>
        {kits.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-[10px] bg-champagne/50 p-3">
            <p>Quer guardar os valores dos acertos para as suas contas? Baixe antes de apagar.</p>
            <Button variant="secondary" size="sm" className="self-start" onClick={download}>
              <Download size={16} strokeWidth={1.5} aria-hidden="true" /> {downloaded ? 'Baixar de novo' : 'Baixar os acertos (planilha)'}
            </Button>
          </div>
        )}
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-copper" />
          <span>Entendo que não dá para desfazer.</span>
        </label>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={() => void erase()} disabled={!understood || busy} aria-busy={busy}>
          {busy ? 'Apagando…' : 'Apagar para sempre'}
        </Button>
      </div>
    </Sheet>
  );
}

function EditReseller({ reseller, program, onDone }: { reseller: Reseller; program: Program; onDone: () => void }) {
  const [name, setName] = useState(reseller.name);
  const [slug, setSlug] = useState(reseller.slug);
  const [note, setNote] = useState(reseller.note ?? '');
  const [showWhatsapp, setShowWhatsapp] = useState(reseller.showWhatsapp);
  const [ownTiers, setOwnTiers] = useState(!!reseller.tiers);
  const [percent, setPercent] = useState(String(reseller.tiers?.[0]?.percent ?? program.tiers[0]?.percent ?? 25));
  const [contractUrl, setContractUrl] = useState(reseller.contractUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    const p = Number(percent.replace(',', '.'));
    if (ownTiers && (!Number.isFinite(p) || p < 0 || p > 90)) return setError('Comissão de 0 a 90%.');
    setBusy(true);
    setError(null);
    const r = await patchReseller(reseller, { name, slug, note, showWhatsapp, tiers: ownTiers ? [{ fromCents: 0, percent: p }] : null, ...(program.contract.mode === 'link' ? { contractUrl } : {}) });
    setBusy(false);
    if (isError(r)) return setError(r.error);
    toast('Dados salvos.', { tone: 'success' });
    onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField label="Nome completo" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      <TextField label="Endereço do mostruário" value={slug} maxLength={40} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} hint={`eka…/r/${slug}`} />
      <SwitchRow checked={showWhatsapp} onChange={setShowWhatsapp} label="Mostrar o WhatsApp dela no mostruário" hint="Sem ele, os pedidos do mostruário vão para o WhatsApp da loja." />
      <SwitchRow checked={ownTiers} onChange={setOwnTiers} label="Comissão própria (fixa)" hint="Em vez das faixas do programa. Vale a partir da próxima maleta." />
      {ownTiers && <TextField label="Comissão fixa (%)" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d,.]/g, ''))} wrapperClassName="max-w-40" hint="Vale a partir da próxima maleta." />}
      {program.contract.mode === 'link' && <TextField label="Link do contrato dela" optional value={contractUrl} onChange={(e) => setContractUrl(e.target.value)} hint="Se vazio, usa o link geral do programa." />}
      <TextArea label="Observação interna" optional value={note} maxLength={600} rows={3} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <p role="alert" className="rounded-[10px] bg-danger-tint p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button size="lg" block disabled={busy} aria-busy={busy} onClick={() => void save()}>
        {busy ? 'Salvando…' : 'Salvar'}
      </Button>
    </div>
  );
}

const centsToInput = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputToCents = (v: string) => parseBRL(v) ?? NaN;

function ProgramPanel() {
  const { state, reload } = useProgram();
  if (state.status === 'loading') return <p className="py-8 text-center text-ink-muted" aria-busy="true">Carregando…</p>;
  if (state.status === 'error') return <p role="alert" className="py-8 text-center text-danger">{state.message}</p>;
  return <ProgramForm key={JSON.stringify(state.data.program)} program={state.data.program} onSaved={reload} />;
}

function ProgramForm({ program, onSaved }: { program: Program; onSaved: () => void }) {
  const [tiers, setTiers] = useState(program.tiers.map((t) => ({ from: centsToInput(t.fromCents), percent: String(t.percent) })));
  const [cycleDays, setCycleDays] = useState(String(program.cycleDays));
  const [mode, setMode] = useState(program.contract.mode);
  const [title, setTitle] = useState(program.contract.title);
  const [text, setText] = useState(program.contract.text);
  const [url, setUrl] = useState(program.contract.url ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setError(null);
    const next: Program = {
      tiers: tiers.map((t, i) => ({ fromCents: i === 0 ? 0 : inputToCents(t.from), percent: Number(t.percent.replace(',', '.')) })),
      cycleDays: Number(cycleDays),
      contract: { mode, title, text, version: program.contract.version, ...(url.trim() ? { url: url.trim() } : {}) },
    };
    setBusy(true);
    const r = await saveProgram(next);
    setBusy(false);
    if (isError(r)) return setError(r.error);
    toast(r.program.contract.version !== program.contract.version ? `Programa salvo. Contrato na versão ${r.program.contract.version}: cada revendedora aceita a versão nova no painel dela antes de registrar vendas.` : 'Programa salvo.', { tone: 'success', duration: 8000 });
    onSaved();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4" aria-labelledby="tiers-title">
        <h2 id="tiers-title" className="font-display text-title">
          Comissão por faixas
        </h2>
        <p className="text-sm text-ink-muted">Sobre o total vendido em cada maleta. A faixa alcançada vale para todo o ciclo. Uma faixa só = comissão fixa. Mudanças valem para as próximas maletas.</p>
        <ul className="flex flex-col gap-2">
          {tiers.map((t, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-end gap-2">
              <TextField label={i === 0 ? 'A partir de (R$)' : `Faixa ${i + 1}: a partir de (R$)`} inputMode="decimal" value={i === 0 ? '0,00' : t.from} disabled={i === 0} onChange={(e) => setTiers((all) => all.map((x, j) => (j === i ? { ...x, from: e.target.value.replace(/[^\d,.]/g, '') } : x)))} />
              <TextField label="%" inputMode="decimal" value={t.percent} onChange={(e) => setTiers((all) => all.map((x, j) => (j === i ? { ...x, percent: e.target.value.replace(/[^\d,.]/g, '') } : x)))} />
              <Button variant="ghost" size="sm" disabled={tiers.length === 1 || i === 0} onClick={() => setTiers((all) => all.filter((_, j) => j !== i))}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
        {tiers.length < 8 && (
          <Button variant="secondary" size="sm" className="self-start" onClick={() => setTiers((all) => [...all, { from: centsToInput(inputToCents(all.at(-1)?.from ?? '0') + 100_000), percent: String(Number(all.at(-1)?.percent ?? 25) + 5) }])}>
            <Plus size={16} strokeWidth={1.5} /> Adicionar faixa
          </Button>
        )}
        <TextField label="Prazo do acerto (dias)" inputMode="numeric" value={cycleDays} onChange={(e) => setCycleDays(countInput(e.target.value, { allowZero: false, maxDigits: 3 }))} wrapperClassName="max-w-48" />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4" aria-labelledby="contract-title">
        <h2 id="contract-title" className="font-display text-title">
          Contrato
        </h2>
        <div role="group" aria-label="Forma do contrato" className="flex flex-wrap gap-2">
          <Chip selected={mode === 'aceite'} onClick={() => setMode('aceite')}>
            Aceite no painel
          </Chip>
          <Chip selected={mode === 'link'} onClick={() => setMode('link')}>
            Link externo (Autentique, ZapSign…)
          </Chip>
        </div>
        <TextField label="Título" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        {mode === 'aceite' ? (
          <TextArea label="Texto do contrato" value={text} rows={14} maxLength={30_000} onChange={(e) => setText(e.target.value)} hint="A revendedora lê, digita o nome completo e aceita. Fica registrado com data, versão e uma impressão digital do texto." />
        ) : (
          <TextField label="Link do contrato" value={url} onChange={(e) => setUrl(e.target.value)} hint="Ela assina no serviço e confirma no painel; depois você marca a assinatura como conferida." />
        )}
        <p className="text-sm text-ink-muted">Versão atual: {program.contract.version}. Mudar o texto cria uma versão nova.</p>
        <p className="flex items-start gap-2 rounded-[10px] bg-champagne/60 p-3 text-sm">
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-copper" />
          O texto inicial é um modelo. Revise com quem cuida da parte jurídica da loja antes de usar.
        </p>
      </section>
      {error && (
        <p role="alert" className="rounded-[10px] bg-danger-tint p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button size="lg" block disabled={busy} aria-busy={busy} onClick={() => void save()}>
        {busy ? 'Salvando…' : 'Salvar programa'}
      </Button>
    </div>
  );
}

export function ResellersPage() {
  // Links from Início: ?aba=fichas, ?r=<reseller id> (opens her), ?nova=1 (new reseller).
  const [params, setParams] = useSearchParams();
  const asked = params.get('aba');
  const [tab, setTabState] = useState<Tab>(TABS.includes(asked as Tab) ? (asked as Tab) : 'revendedoras');
  const { state } = useResellers();
  const { state: leadsState } = useLeads();
  const [openId, setOpenId] = useState<string | null>(params.get('r'));
  const [creating, setCreating] = useState<{ lead?: ResellerLead } | null>(params.get('nova') ? {} : null);
  const [created, setCreated] = useState<{ reseller: Reseller; token: string | null } | null>(null);
  const list = state.status === 'ready' ? state.data.resellers : [];
  const program = state.status === 'ready' ? state.data.program : null;
  const open = list.find((r) => r.reseller.id === openId);
  const freshLeads = leadsState.status === 'ready' ? leadsState.leads.filter((l) => (l.status ?? 'nova') === 'nova').length : 0;
  const shown = list.filter((r) => r.reseller.status !== 'encerrada');
  const ended = list.filter((r) => r.reseller.status === 'encerrada');

  // The link did its job: drop it so a reload or "back" does not reopen the same thing.
  useEffect(() => {
    if (params.has('aba') || params.has('r') || params.has('nova'))
      setParams(
        (p) => {
          p.delete('aba');
          p.delete('r');
          p.delete('nova');
          return p;
        },
        { replace: true },
      );
  }, [params, setParams]);

  function setTab(t: Tab) {
    setTabState(t);
  }

  return (
    <div className="flex flex-col gap-5">
      {state.status === 'ready' && list.length > 0 && <NetworkSummary list={list} />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          label="Revendas"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'revendedoras', label: 'Revendedoras', count: shown.length },
            { id: 'fichas', label: 'Fichas', count: freshLeads || undefined, alert: true },
            { id: 'programa', label: 'Programa' },
          ]}
        />
        {tab === 'revendedoras' && (
          <Button onClick={() => setCreating({})} className="shrink-0 whitespace-nowrap max-sm:w-full">
            <UserPlus size={18} strokeWidth={1.75} aria-hidden="true" /> Nova revendedora
          </Button>
        )}
      </div>

      {tab === 'revendedoras' &&
        (state.status === 'loading' ? (
          <p className="py-10 text-center text-ink-muted" aria-busy="true">
            Carregando revendedoras…
          </p>
        ) : state.status === 'error' ? (
          <p role="alert" className="py-10 text-center text-danger">
            {state.message}
          </p>
        ) : list.length ? (
          <>
            <ul className="grid gap-3 md:grid-cols-2">
              {shown.map((item) => (
                <li key={item.reseller.id}>
                  <ResellerCard item={item} onOpen={() => setOpenId(item.reseller.id)} />
                </li>
              ))}
            </ul>
            {ended.length > 0 && (
              <details className="group">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-ink-muted [&::-webkit-details-marker]:hidden">
                  <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" className="transition-transform group-open:rotate-90" /> Parcerias encerradas ({ended.length})
                </summary>
                <ul className="mt-2 grid gap-3 md:grid-cols-2">
                  {ended.map((item) => (
                    <li key={item.reseller.id}>
                      <ResellerCard item={item} onOpen={() => setOpenId(item.reseller.id)} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <Empty
            title="Sua rede começa aqui"
            image={<img src={asset('images/admin/revenda-vazia-320.webp')} alt="" width={112} height={112} className="mb-1 size-28 rounded-2xl object-cover" />}
            action={
              <Button variant="secondary" onClick={() => setTab('fichas')}>
                Ver fichas de cadastro
              </Button>
            }
          >
            Aprove uma ficha ou toque em “Nova revendedora”.
          </Empty>
        ))}

      {tab === 'fichas' && <LeadsPage onEffectivate={(lead) => setCreating({ lead })} />}
      {tab === 'programa' && <ProgramPanel />}

      <Sheet open={!!open && !!program} onClose={() => setOpenId(null)} title={open ? open.reseller.name : 'Revendedora'} side="right" className="!w-[min(100vw,520px)]">
        {open && program && <ResellerDetailView key={open.reseller.id} id={open.reseller.id} program={program} onClose={() => setOpenId(null)} />}
      </Sheet>
      <Sheet
        open={!!creating || !!created}
        onClose={() => {
          setCreating(null);
          setCreated(null);
        }}
        title={created ? 'Convite pronto' : 'Efetivar revendedora'}
        side="right"
      >
        {created ? (
          <div className="flex flex-col gap-4">
            {created.token ? (
              <InviteMessage reseller={created.reseller} token={created.token} />
            ) : (
              <p className="rounded-[10px] bg-champagne/60 p-3 text-sm">A revendedora foi criada. Abra a ficha dela e toque em “Gerar novo convite” para enviar o acesso.</p>
            )}
            <Button
              variant="ghost"
              block
              onClick={() => {
                setCreated(null);
                setTab('revendedoras');
                setOpenId(created.reseller.id);
              }}
            >
              <ExternalLink size={18} strokeWidth={1.5} /> Abrir a ficha dela e montar a maleta
            </Button>
          </div>
        ) : (
          creating && (
            <NewResellerForm
              {...(creating.lead ? { lead: creating.lead } : {})}
              onDone={(r) => {
                setCreating(null);
                setCreated(r);
              }}
            />
          )
        )}
      </Sheet>
    </div>
  );
}
