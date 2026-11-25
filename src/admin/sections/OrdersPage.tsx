import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShoppingBag, Store } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Chip } from '../../components/ui/Misc';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../components/ui/cx';
import { sizeLabel } from '../../data/catalog';
import { awaitingReview, canTransition, EDITABLE_ITEMS, HOLDS_STOCK, NEXT_STEP, STATUS_LABEL, UNDO_STEP, type Order, type OrderStatus } from '../../data/orders';
import { EditItemsSheet, NewOrderButton } from './OrderForms';
import { ReceiptText } from 'lucide-react';
import { ChargeSheet, PaymentSection } from './OrderPayment';
import { OrderMessageButton, PurchaseMessageSheet } from './OrderMessages';
import { OrderCustomerRow } from './CustomerLink';
import { firstNameOf } from '../../data/messages';
import { FINISH_LABEL } from '../../data/schema';
import { formatBRL } from '../../lib/format';
import { toast } from '../../store/ui';
import { EmptyState } from '../FormBits';
import { CARD, Pill, type Tone } from '../ui';
import { formatDateTime } from '../lib/contact';
import { useCustomer, type Customer } from '../lib/customers';
import { anonymizeOrder, changeOrderStatus, deleteOrder, useOrders } from '../lib/orders';

/** Who gets the "Compra registrada" message that opens by itself. */
interface PurchaseTarget {
  phone: string;
  firstName: string;
}

const purchaseTarget = (customer: Pick<Customer, 'name' | 'whatsapp'> | null | undefined): PurchaseTarget | null =>
  customer?.whatsapp ? { phone: customer.whatsapp, firstName: firstNameOf(customer.name) } : null;

type Filter = 'ativos' | 'comprovantes' | OrderStatus | 'todos';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ativos', label: 'Ativos' },
  { id: 'comprovantes', label: 'Comprovantes' },
  { id: 'enviado', label: 'Em negociação' },
  { id: 'confirmado', label: 'Confirmados' },
  { id: 'pago', label: 'Pagos' },
  { id: 'entregue', label: 'Entregues' },
  { id: 'cancelado', label: 'Cancelados' },
  { id: 'todos', label: 'Todos' },
];

const ACTIVE: ReadonlySet<OrderStatus> = new Set(['enviado', 'confirmado', 'pago']);

const matchesFilter = (order: Order, filter: Filter) =>
  filter === 'todos' ? true : filter === 'ativos' ? ACTIVE.has(order.status) : filter === 'comprovantes' ? awaitingReview(order) : order.status === filter;

/** Each status has its own color: waiting = amber, confirmed = blue-grey, paid = green, cancelled = red. */
const STATUS_TONE: Record<OrderStatus, Tone> = {
  enviado: 'warning',
  confirmado: 'info',
  pago: 'success',
  entregue: 'neutral',
  cancelado: 'danger',
};

export function StatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Pill tone={STATUS_TONE[status]} dot {...(className ? { className } : {})}>
      {STATUS_LABEL[status]}
    </Pill>
  );
}

const unitsOf = (order: Order) => order.items.reduce((sum, i) => sum + i.qty, 0);

const UNDO_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmado: 'Voltar para Em negociação',
  pago: 'Voltar para Confirmado',
  entregue: 'Voltar para Pago',
};

const STEP_DONE: Record<OrderStatus, string> = {
  enviado: 'Pedido voltou para Em negociação.',
  confirmado: 'Pedido confirmado.',
  pago: 'Pagamento registrado.',
  entregue: 'Pedido entregue.',
  cancelado: 'Pedido cancelado.',
};

function stockNote(from: OrderStatus, to: OrderStatus): string | null {
  if (!HOLDS_STOCK.has(from) && HOLDS_STOCK.has(to)) return 'As peças com controle de estoque saem do estoque.';
  if (HOLDS_STOCK.has(from) && !HOLDS_STOCK.has(to)) return 'As peças voltam para o estoque.';
  return null;
}

function OrderDetail({ order, onClose, onPurchase }: { order: Order; onClose: () => void; onPurchase: (target: PurchaseTarget) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'cancelar' | 'anonimizar' | 'excluir' | null>(null);
  const [charging, setCharging] = useState(false);
  const [editing, setEditing] = useState(false);
  const customer = useCustomer(order.anonymized ? undefined : order.customerId);
  const next = NEXT_STEP[order.status];
  const reviewing = awaitingReview(order) && order.status === 'confirmado';
  // Payment-led flow: from "em negociação" the main action is to charge by Pix (which confirms);
  // once a receipt arrives, the main action is to accept the payment.
  const chargeFirst = order.status === 'enviado' || (order.status === 'confirmado' && !order.charge && !order.receipts?.length);
  const undo = UNDO_STEP[order.status];
  const canCancel = canTransition(order.status, 'cancelado');
  const canDelete = !HOLDS_STOCK.has(order.status);

  async function move(to: OrderStatus) {
    if (busy) return;
    setBusy(true);
    const problem = await changeOrderStatus(order, to);
    setBusy(false);
    setConfirm(null);
    if (problem) return toast(problem, { tone: 'error', duration: 12_000 });
    toast(STEP_DONE[to], { tone: 'success' });
    // Paid: the purchase summary (with the warranty) goes to her chat.
    const target = to === 'pago' ? purchaseTarget(customer) : null;
    if (target) onPurchase(target);
  }

  async function anonymize() {
    if (busy) return;
    setBusy(true);
    const problem = await anonymizeOrder(order);
    setBusy(false);
    setConfirm(null);
    toast(problem ?? 'Dados da cliente apagados.', { tone: problem ? 'error' : 'success' });
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    const problem = await deleteOrder(order);
    setBusy(false);
    setConfirm(null);
    if (problem) return toast(problem, { tone: 'error' });
    toast('Pedido excluído.', { tone: 'success' });
    onClose();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={order.status} />
        <span className="text-sm text-ink-muted">{formatDateTime(order.createdAt)}</span>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4 text-sm">
        <dt className="text-ink-muted">Cliente</dt>
        <dd className="break-words">{order.customer.name || '—'}</dd>
        <dt className="text-ink-muted">Cidade</dt>
        <dd className="break-words">{order.customer.city || '—'}</dd>
        <OrderCustomerRow order={order} />
        <dt className="text-ink-muted">Origem</dt>
        <dd>{order.source === 'manual' ? 'Registrado no painel' : 'Sacola do site'}</dd>
        <dt className="text-ink-muted">Pagamento</dt>
        <dd>{order.charge ? `Cobrança Pix de ${formatBRL(order.charge.amountCents)}` : order.pix ? 'Pix (mostrado à cliente)' : 'A combinar'}</dd>
        {order.note && (
          <>
            <dt className="text-ink-muted">Observação</dt>
            <dd className="break-words whitespace-pre-line">{order.note}</dd>
          </>
        )}
      </dl>

      <section aria-label="Peças do pedido">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="font-sans text-sm font-medium">Peças</h3>
          {EDITABLE_ITEMS.has(order.status) && (
            <button type="button" className="min-h-9 text-sm text-copper underline underline-offset-4" onClick={() => setEditing(true)}>
              Editar peças
            </button>
          )}
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {order.items.map((item) => (
            <li key={`${item.productId}|${item.variantId}|${item.size ?? ''}`} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="leading-snug">{item.name}</p>
                <p className="text-sm text-ink-muted">
                  {FINISH_LABEL[item.finish]}
                  {item.size && ` · ${sizeLabel(item.size)}`}
                  {item.sku && ` · Ref. ${item.sku}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="price">{formatBRL(item.unitCents * item.qty)}</p>
                <p className="price text-sm text-ink-muted">
                  {item.qty} × {formatBRL(item.unitCents)}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between pt-3">
          {/* Pieces only: shipping and discount live in the Pix charge below. */}
          <span>{order.charge ? 'Total das peças' : 'Total'}</span>
          <span className="price text-xl">{formatBRL(order.totalCents)}</span>
        </div>
      </section>

      <PaymentSection order={order} onCharge={() => setCharging(true)} phone={customer?.whatsapp || undefined} />

      <div className="flex flex-col gap-2">
        {chargeFirst ? (
          <>
            <Button size="lg" block disabled={busy} onClick={() => setCharging(true)}>
              Cobrar por Pix
            </Button>
            {next && (
              <Button variant="secondary" block disabled={busy} aria-busy={busy} onClick={() => void move(next.to)}>
                {busy ? 'Salvando…' : order.status === 'enviado' ? 'Só confirmar (outra forma de pagamento)' : 'Marcar como pago'}
              </Button>
            )}
          </>
        ) : reviewing ? (
          <>
            <Button size="lg" block disabled={busy} aria-busy={busy} onClick={() => void move('pago')}>
              {busy ? 'Salvando…' : 'Pagamento conferido'}
            </Button>
            <p className="text-center text-sm text-ink-muted">Marca o pedido como pago. Confira antes o valor e o recebedor no comprovante.</p>
          </>
        ) : (
          next && (
            <>
              <Button size="lg" block disabled={busy} aria-busy={busy} onClick={() => void move(next.to)}>
                {busy ? 'Salvando…' : next.label}
              </Button>
              {stockNote(order.status, next.to) && <p className="text-center text-sm text-ink-muted">{stockNote(order.status, next.to)}</p>}
              {next.to === 'pago' && <p className="text-center text-sm text-ink-muted">Confira no app do banco se o valor entrou antes de marcar.</p>}
            </>
          )
        )}
        {undo && (
          <Button variant="secondary" block disabled={busy} onClick={() => void move(undo)}>
            {UNDO_LABEL[order.status]}
          </Button>
        )}
        <OrderMessageButton order={order} phone={customer?.whatsapp || undefined} />
        {canCancel && (
          <Button variant="ghost-danger" block disabled={busy} onClick={() => setConfirm('cancelar')}>
            Cancelar pedido
          </Button>
        )}
      </div>

      <section aria-labelledby={`hist-${order.id}`}>
        <h3 id={`hist-${order.id}`} className="mb-2 font-sans text-sm font-medium">Histórico</h3>
        <ol className="flex flex-col gap-1.5 border-l border-line pl-4 text-sm">
          {[...order.history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`} className="flex flex-wrap justify-between gap-x-3">
              <span>{h.event === 'itens' ? 'Peças alteradas' : STATUS_LABEL[h.status]}</span>
              <span className="text-ink-muted">{formatDateTime(h.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-col gap-1 border-t border-line pt-4">
        {!order.anonymized && (
          <button type="button" className="min-h-11 self-start text-sm text-ink-muted underline underline-offset-4 hover:text-ink" onClick={() => setConfirm('anonimizar')}>
            Apagar dados da cliente
          </button>
        )}
        {canDelete && (
          <button type="button" className="min-h-11 self-start text-sm text-danger underline underline-offset-4" onClick={() => setConfirm('excluir')}>
            Excluir pedido
          </button>
        )}
      </div>

      <ChargeSheet order={order} open={charging} onClose={() => setCharging(false)} />
      <EditItemsSheet order={order} open={editing} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={confirm === 'cancelar'}
        title={`Cancelar o pedido nº ${order.number}?`}
        confirmLabel="Cancelar pedido"
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => void move('cancelado')}
        onCancel={() => setConfirm(null)}
      >
        {HOLDS_STOCK.has(order.status) ? 'As peças voltam para o estoque. ' : ''}O pedido continua na lista como cancelado e pode ser reaberto.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'anonimizar'}
        title="Apagar os dados da cliente?"
        confirmLabel="Apagar dados"
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => void anonymize()}
        onCancel={() => setConfirm(null)}
      >
        O nome, a cidade, a observação e os comprovantes deste pedido são apagados de vez. As peças e os valores continuam no relatório.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'excluir'}
        title={`Excluir o pedido nº ${order.number}?`}
        confirmLabel="Excluir"
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setConfirm(null)}
      >
        O pedido sai da lista e do relatório. Use para pedidos de teste ou enviados por engano.
      </ConfirmDialog>
    </div>
  );
}

export function OrdersPage() {
  const state = useOrders((s) => s.state);
  const load = useOrders((s) => s.load);
  // Links from Início: ?filtro=<filter> picks the list, ?novo=1 opens "Novo pedido".
  const [params, setParams] = useSearchParams();
  const askedFilter = params.get('filtro');
  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.id === askedFilter) ? (askedFilter as Filter) : 'ativos');
  useEffect(() => {
    if (params.has('filtro') || params.has('novo'))
      setParams(
        (p) => {
          p.delete('filtro');
          p.delete('novo');
          return p;
        },
        { replace: true },
      );
  }, [params, setParams]);
  const [autoNew] = useState(params.get('novo') === '1');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // "Compra registrada" waiting to open over its order: a confirmed manual sale or an order just paid,
  // for a customer with WhatsApp. Rendered after the order sheet, so it opens on top of it.
  const [purchase, setPurchase] = useState<{ orderId: string; target: PurchaseTarget } | null>(null);
  const orders = useMemo(() => (state.status === 'ready' ? state.orders : []), [state]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, orders.filter((o) => matchesFilter(o, f.id)).length])) as Record<Filter, number>, [orders]);
  const q = query.trim().toLowerCase().replace(/^n[ºo°]?\s*/, '');
  const visible = orders.filter((o) => matchesFilter(o, filter) && (!q || String(o.number).includes(q) || o.customer.name.toLowerCase().includes(q) || o.customer.city.toLowerCase().includes(q)));
  // A notice on the phone opens /admin/pedidos?pedido=<número>: that order opens on arrival.
  const linked = params.get('pedido');
  const open = orders.find((o) => o.id === openId) ?? (linked ? (orders.find((o) => String(o.number) === linked) ?? null) : null);
  const close = () => {
    setOpenId(null);
    setPurchase(null);
    if (linked) setParams((p) => { p.delete('pedido'); return p; }, { replace: true });
  };

  if (state.status === 'loading') return <p className="py-10 text-center text-ink-muted" aria-busy="true">Carregando pedidos…</p>;
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

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {counts.ativos ? `${counts.ativos} ${counts.ativos === 1 ? 'pedido em andamento' : 'pedidos em andamento'}` : 'Nenhum pedido em andamento'}
        </p>
        <NewOrderButton
          autoOpen={autoNew}
          onCreated={(order, customer) => {
            const target = order.status === 'confirmado' ? purchaseTarget(customer) : null;
            setPurchase(target ? { orderId: order.id, target } : null);
            setFilter('ativos');
            setQuery('');
            setOpenId(order.id);
          }}
        />
      </div>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className={cx('price text-xs', filter === f.id ? 'text-white/85' : 'text-ink-muted')}>{counts[f.id]}</span>
          </Chip>
        ))}
      </div>
      <div className="relative mb-4">
        <label htmlFor="orders-search" className="sr-only">Buscar pedido</label>
        <Search size={18} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          id="orders-search"
          type="search"
          inputMode="search"
          placeholder="Buscar por número, nome ou cidade"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-12 w-full rounded-[10px] border border-line bg-white pr-3 pl-10 text-base placeholder:text-ink-muted focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
        />
      </div>

      {visible.length ? (
        <ul className="flex flex-col gap-2">
          {visible.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => setOpenId(order.id)}
                className={cx(CARD, 'flex w-full items-center gap-3 p-4 text-left transition-[border-color,box-shadow] hover:border-copper hover:shadow-[0_6px_18px_-8px_rgb(48_33_28/0.25)] focus-visible:outline-2 focus-visible:outline-copper')}
              >
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-champagne text-copper">
                  {order.source === 'manual' ? <Store size={19} strokeWidth={1.6} aria-hidden="true" /> : <ShoppingBag size={19} strokeWidth={1.6} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{order.customer.name || 'Cliente sem nome'}</p>
                  <p className="truncate text-sm text-ink-muted">
                    <span className="price">nº {order.number}</span> · {unitsOf(order)} {unitsOf(order) === 1 ? 'peça' : 'peças'}
                    {order.customer.city && ` · ${order.customer.city}`}
                  </p>
                  <p className="text-xs text-ink-muted">{formatDateTime(order.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="price text-[1.0625rem] font-semibold">{formatBRL(order.charge?.amountCents ?? order.totalCents)}</span>
                  <StatusPill status={order.status} />
                  {awaitingReview(order) && (
                    <Pill tone="copper">
                      <ReceiptText size={12} strokeWidth={1.75} aria-hidden="true" /> Comprovante
                    </Pill>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          {orders.length
            ? 'Nenhum pedido neste filtro.'
            : 'Nenhum pedido ainda. Quando uma cliente finalizar a sacola no site, o pedido aparece aqui na hora, com número, peças e valores. Vendas fechadas fora do site entram por “Novo pedido”.'}
        </EmptyState>
      )}

      <Sheet open={!!open} onClose={close} title={open ? `Pedido nº ${open.number}` : 'Pedido'} side="right">
        {open && <OrderDetail key={open.id} order={open} onClose={close} onPurchase={(target) => setPurchase({ orderId: open.id, target })} />}
      </Sheet>
      {open && purchase?.orderId === open.id && (
        <PurchaseMessageSheet order={open} phone={purchase.target.phone} firstName={purchase.target.firstName} open onClose={() => setPurchase(null)} />
      )}
    </>
  );
}
