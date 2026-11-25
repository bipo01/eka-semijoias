import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Misc';
import { cx } from '../../components/ui/cx';
import { sizeLabel } from '../../data/catalog';
import { STATUS_LABEL, type Order } from '../../data/orders';
import { computeReport, PERIODS, periodRange, type Bucket, type PeriodId, type Ranked } from '../../data/report';
import { FINISH_LABEL } from '../../data/schema';
import { toCSV } from '../../lib/csv';
import { formatBRL } from '../../lib/format';
import { EmptyState } from '../FormBits';
import { formatDateTime } from '../lib/contact';
import { downloadText, fileDate } from '../lib/download';
import { useOrders } from '../lib/orders';
import { ADMIN_BASE } from '../lib/paths';
import { Loader } from '../Loader';

const dayLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });
const longDay = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });
const longMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** One row per item; every order of the period with its status (pt-BR Excel: semicolons). */
export function reportCsv(orders: Order[]): string {
  return toCSV(
    ['Pedido', 'Data', 'Status', 'Cliente', 'Cidade', 'Peça', 'Acabamento', 'Tamanho', 'Ref.', 'Qtd.', 'Preço unitário', 'Total do item', 'Total do pedido', 'Frete', 'Desconto', 'Valor cobrado'],
    [...orders]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .flatMap((o) =>
        o.items.map((i) => [
          o.number,
          formatDateTime(o.createdAt),
          STATUS_LABEL[o.status],
          o.customer.name,
          o.customer.city,
          i.name,
          FINISH_LABEL[i.finish],
          i.size ? sizeLabel(i.size) : '',
          i.sku ?? '',
          i.qty,
          (i.unitCents / 100).toFixed(2).replace('.', ','),
          ((i.unitCents * i.qty) / 100).toFixed(2).replace('.', ','),
          (o.totalCents / 100).toFixed(2).replace('.', ','),
          o.charge ? (o.charge.shippingCents / 100).toFixed(2).replace('.', ',') : '',
          o.charge ? (o.charge.discountCents / 100).toFixed(2).replace('.', ',') : '',
          o.charge ? (o.charge.amountCents / 100).toFixed(2).replace('.', ',') : '',
        ]),
      ),
    { delimiter: ';' },
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="@container rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      {/* One line, sized to the card: "R$" never apart from the amount, even "R$ 123.456,78" on a 320 px phone. */}
      <p className="price mt-1 text-[clamp(0.9375rem,12.5cqi,1.5rem)] leading-tight whitespace-nowrap text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/** Single-series column chart (one hue, rounded data ends on the baseline, readout on hover/focus, table for screen readers). */
function SalesChart({ buckets, monthly }: { buckets: Bucket[]; monthly: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.cents));
  const total = buckets.reduce((s, b) => s + b.cents, 0);
  const current = active !== null ? buckets[active] : null;
  const name = (b: Bucket) => (monthly ? longMonth.format(b.date) : longDay.format(b.date));
  const tick = (b: Bucket) => (monthly ? monthLabel.format(b.date).replace('.', '') : dayLabel.format(b.date));
  const every = Math.ceil(buckets.length / 7);

  return (
    <section aria-labelledby="chart-title" className="rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="chart-title" className="font-display text-title">Vendas {monthly ? 'por mês' : 'por dia'}</h2>
        <p className="text-sm text-ink-muted" aria-live="polite">
          {current ? (
            <>
              <span className="text-ink">{name(current)}</span>: <span className="price text-ink">{formatBRL(current.cents)}</span> · {current.orders} {current.orders === 1 ? 'pedido' : 'pedidos'}
            </>
          ) : (
            <>Total {formatBRL(total)}</>
          )}
        </p>
      </div>
      <div className="mt-4 flex h-40 items-end gap-[2px] border-b border-line" onMouseLeave={() => setActive(null)} aria-hidden="true">
        {buckets.map((b, i) => (
          <div
            key={b.key}
            className="group flex h-full min-w-0 flex-1 cursor-default items-end"
            onMouseEnter={() => setActive(i)}
            onTouchStart={() => setActive(i)}
          >
            <div
              className={cx('w-full rounded-t-[4px] transition-colors', active === i ? 'bg-copper-dark' : 'bg-copper', b.cents === 0 && 'bg-transparent')}
              style={{ height: b.cents ? `max(3px, ${(b.cents / max) * 100}%)` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-xs text-ink-muted" aria-hidden="true">
        {buckets.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
            {i % every === 0 ? tick(b) : ''}
          </span>
        ))}
      </div>
      {/* The hiding box wraps the table: a table ignores the 1 px width of .sr-only and widened the page at 320 px. */}
      <div className="sr-only">
      <table>
        <caption>Vendas {monthly ? 'por mês' : 'por dia'}</caption>
        <thead>
          <tr>
            <th scope="col">{monthly ? 'Mês' : 'Dia'}</th>
            <th scope="col">Vendas</th>
            <th scope="col">Pedidos</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <th scope="row">{name(b)}</th>
              <td>{formatBRL(b.cents)}</td>
              <td>{b.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

function RankList({ title, rows, unit, limit = 8 }: { title: string; rows: Ranked[]; unit: (n: number) => string; limit?: number }) {
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...shown.map((r) => r.cents));
  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
      <h2 className="mb-3 font-display text-title">{title}</h2>
      {shown.length ? (
        <ol className="flex flex-col gap-3">
          {shown.map((r) => (
            <li key={r.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="price shrink-0">
                  {formatBRL(r.cents)} <span className="text-ink-muted">· {unit(r.units)}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-champagne" aria-hidden="true">
                <div className="h-full rounded-full bg-copper" style={{ width: `${Math.max(2, (r.cents / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">Sem vendas no período.</p>
      )}
    </section>
  );
}

const pieces = (n: number) => `${n} ${n === 1 ? 'peça' : 'peças'}`;
const ordersUnit = (n: number) => `${n} ${n === 1 ? 'pedido' : 'pedidos'}`;

function age(iso: string, now: number): string {
  const hours = Math.floor((now - Date.parse(iso)) / 3600_000);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} dias`;
}

export function ReportPage() {
  const state = useOrders((s) => s.state);
  const load = useOrders((s) => s.load);
  const [periodId, setPeriodId] = useState<PeriodId>('30d');
  const orders = useMemo(() => (state.status === 'ready' ? state.orders : []), [state]);
  const period = useMemo(() => periodRange(periodId), [periodId]);
  const report = useMemo(() => computeReport(orders, period), [orders, period]);
  const [now] = useState(() => Date.now());

  if (state.status === 'loading') return <Loader label="Carregando relatório…" />;
  if (state.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-ink-muted">{state.message}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const inPeriod = orders.filter((o) => {
    const t = Date.parse(o.createdAt);
    return t >= period.from.getTime() && t < period.to.getTime();
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {PERIODS.map((p) => (
            <Chip key={p.id} selected={periodId === p.id} onClick={() => setPeriodId(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!inPeriod.length}
          onClick={() => downloadText(`eka-vendas-${periodId}-${fileDate()}.csv`, reportCsv(inPeriod), 'text/csv;charset=utf-8')}
        >
          <Download size={18} strokeWidth={1.5} /> Exportar CSV
        </Button>
      </div>

      {!orders.length ? (
        <EmptyState>O relatório começa a contar a partir do primeiro pedido finalizado no site.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi label="Vendas" value={formatBRL(report.revenueCents)} hint="confirmados, pagos e entregues; sem frete" />
            <Kpi label="Pedidos" value={String(report.orders)} hint={report.cancelled ? `${report.cancelled} cancelado${report.cancelled === 1 ? '' : 's'} fora da conta` : undefined} />
            <Kpi label="Ticket médio" value={report.orders ? formatBRL(report.averageCents) : '—'} />
            <Kpi label="Peças vendidas" value={String(report.units)} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-champagne px-4 py-3 text-sm">
            <p>
              <span className="font-medium">Em negociação:</span> {ordersUnit(report.negotiating.orders)} · <span className="price">{formatBRL(report.negotiating.cents)}</span>
            </p>
            <Link to={`${ADMIN_BASE}/pedidos`} className="min-h-11 content-center font-medium text-copper underline underline-offset-4">
              Ver pedidos
            </Link>
          </div>

          <SalesChart buckets={report.buckets} monthly={period.bucket === 'month'} />

          <div className="grid gap-4 md:grid-cols-2">
            <RankList title="Peças mais vendidas" rows={report.products} unit={pieces} />
            <RankList title="Categorias" rows={report.categories} unit={pieces} />
            <RankList title="Acabamentos" rows={report.finishes} unit={pieces} />
            <RankList title="Cidades" rows={report.cities} unit={ordersUnit} />
          </div>

          <section aria-labelledby="stale-title" className="rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
            <h2 id="stale-title" className="font-display text-title">Pedidos parados</h2>
            <p className="mb-3 text-sm text-ink-muted">Em negociação há mais de 2 dias, de qualquer período. Vale chamar a cliente ou cancelar.</p>
            {report.stale.length ? (
              <ul className="divide-y divide-line border-y border-line text-sm">
                {report.stale.slice(0, 20).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">
                      <span className="price font-medium">nº {o.number}</span> · {o.customer.name || '—'}
                      {o.customer.city && <span className="text-ink-muted"> · {o.customer.city}</span>}
                    </span>
                    <span className="shrink-0 text-ink-muted">
                      <span className="price text-ink">{formatBRL(o.totalCents)}</span> · {age(o.createdAt, now)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">Nenhum pedido parado.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
