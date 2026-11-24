import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Pencil } from 'lucide-react';
import { Button, ButtonAnchor } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { WhatsAppIcon } from '../../components/ui/Icons';
import { saleCents, IS_SALE, type Order } from '../../data/orders';
import { ApiError, errorMessage } from '../../lib/api';
import { formatBRL } from '../../lib/format';
import { whatsappUrl } from '../../lib/whatsapp';
import { toast } from '../../store/ui';
import { formatDateTime, formatPhone, whatsappDigits } from '../lib/contact';
import { deleteCustomer, fetchCustomer, useCustomer, type Customer } from '../lib/customers';
import { adminPath } from '../lib/paths';
import { CustomerForm } from './CustomerForm';
import { StatusPill } from './OrdersPage';

/*
 * A customer's record: her data, what she bought (each purchase opens the
 * order), "Conversar no WhatsApp", edit, and erase (LGPD: the orders stay,
 * unlinked, with their own name and city).
 */

const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const formatDate = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? date.format(new Date(iso)) : '—');

export const placeOf = (c: Pick<Customer, 'city' | 'uf'>) => [c.city, c.uf].filter(Boolean).join('/');

type Loaded = { status: 'loading' } | { status: 'ready'; orders: Order[] } | { status: 'error'; message: string };

export function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const listed = useCustomer(id);
  const [fresh, setFresh] = useState<Customer | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchCustomer(id).then(
      (r) => {
        if (!active) return;
        setFresh(r.customer);
        setLoaded({ status: 'ready', orders: r.orders });
      },
      (error: unknown) => active && setLoaded({ status: 'error', message: error instanceof ApiError && error.status === 404 ? 'Esta cliente não está mais cadastrada.' : errorMessage(error) }),
    );
    return () => {
      active = false;
    };
  }, [id, tick]);

  // The list copy follows later edits; the fetched copy covers a customer the list has not loaded yet.
  const customer = listed ?? fresh;

  async function remove() {
    if (busy) return;
    setBusy(true);
    const problem = await deleteCustomer(id);
    setBusy(false);
    setConfirming(false);
    if (problem) return toast(problem, { tone: 'error' });
    toast('Cliente apagada. Os pedidos dela continuam na lista, sem o vínculo.', { tone: 'success' });
    onClose();
  }

  if (!customer) {
    return loaded.status === 'error' ? (
      <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-ink-muted">{loaded.message}</p>
        <Button variant="secondary" onClick={() => setTick((t) => t + 1)}>
          Tentar de novo
        </Button>
      </div>
    ) : (
      <p className="py-10 text-center text-ink-muted" aria-busy="true">
        Carregando…
      </p>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <CustomerForm customer={customer} onDone={() => setEditing(false)} />
        <Button variant="ghost" block onClick={() => setEditing(false)}>
          Voltar sem salvar
        </Button>
      </div>
    );
  }

  const sales = loaded.status === 'ready' ? loaded.orders.filter((o) => IS_SALE.has(o.status)) : [];
  const stats = loaded.status === 'ready' ? { purchases: sales.length, spentCents: sales.reduce((s, o) => s + saleCents(o), 0) } : customer.stats;
  const digits = customer.whatsapp ? whatsappDigits(customer.whatsapp) : '';

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-[12px] border border-line bg-white p-4 text-sm">
        <dt className="text-ink-muted">WhatsApp</dt>
        <dd className="price">{customer.whatsapp ? formatPhone(customer.whatsapp) : '—'}</dd>
        <dt className="text-ink-muted">Cidade</dt>
        <dd className="break-words">{placeOf(customer) || '—'}</dd>
        {customer.instagram && (
          <>
            <dt className="text-ink-muted">Instagram</dt>
            <dd className="break-words">
              <a href={`https://www.instagram.com/${customer.instagram}/`} target="_blank" rel="noopener noreferrer" className="text-copper underline underline-offset-4">
                @{customer.instagram}
              </a>
            </dd>
          </>
        )}
        {customer.birthday && (
          <>
            <dt className="text-ink-muted">Aniversário</dt>
            <dd>{customer.birthday}</dd>
          </>
        )}
        {customer.note && (
          <>
            <dt className="text-ink-muted">Observação</dt>
            <dd className="break-words whitespace-pre-line">{customer.note}</dd>
          </>
        )}
        <dt className="text-ink-muted">Cadastro</dt>
        <dd>{formatDate(customer.createdAt)}</dd>
      </dl>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Compras', String(stats.purchases)],
          ['Total gasto', formatBRL(stats.spentCents)],
          ['Última compra', formatDate(loaded.status === 'ready' ? (sales[0] ? sales[0].createdAt : null) : customer.stats.lastPurchaseAt)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-[12px] bg-champagne/60 px-2 py-3">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="price text-base">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        {digits && (
          <ButtonAnchor href={whatsappUrl(digits, '')} block>
            <WhatsAppIcon size={19} /> Conversar no WhatsApp
          </ButtonAnchor>
        )}
        <Button variant="secondary" block onClick={() => setEditing(true)}>
          <Pencil size={17} strokeWidth={1.5} /> Editar dados
        </Button>
      </div>

      <section aria-labelledby={`compras-${customer.id}`}>
        <h3 id={`compras-${customer.id}`} className="mb-2 font-sans text-sm font-medium">
          Pedidos
        </h3>
        {loaded.status === 'loading' ? (
          <p className="text-sm text-ink-muted" aria-busy="true">
            Carregando pedidos…
          </p>
        ) : loaded.status === 'error' ? (
          <p role="alert" className="text-sm text-danger">
            {loaded.message}{' '}
            <button type="button" className="min-h-9 text-copper underline underline-offset-4" onClick={() => setTick((t) => t + 1)}>
              Tentar de novo
            </button>
          </p>
        ) : loaded.orders.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {loaded.orders.map((order) => (
              <li key={order.id}>
                <Link to={`${adminPath('pedidos')}?pedido=${order.number}`} className="flex items-center gap-3 py-3 hover:text-copper focus-visible:outline-2 focus-visible:outline-copper">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="price font-medium">nº {order.number}</span>
                      <StatusPill status={order.status} />
                    </div>
                    <p className="text-sm text-ink-muted">
                      {formatDateTime(order.createdAt)} · {order.items.reduce((n, i) => n + i.qty, 0)} {order.items.reduce((n, i) => n + i.qty, 0) === 1 ? 'peça' : 'peças'}
                    </p>
                  </div>
                  <span className="price shrink-0">{formatBRL(order.charge?.amountCents ?? order.totalCents)}</span>
                  <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Nenhum pedido ligado a ela ainda. Escolha a cliente em “Novo pedido” ou use “Vincular cliente” num pedido do site.</p>
        )}
      </section>

      <div className="border-t border-line pt-4">
        <button type="button" className="min-h-11 text-sm text-danger underline underline-offset-4" onClick={() => setConfirming(true)}>
          Apagar cliente
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Apagar ${customer.name}?`}
        confirmLabel={busy ? 'Apagando…' : 'Apagar cliente'}
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      >
        O nome, o WhatsApp, a cidade, o Instagram, o aniversário e a observação dela são apagados de vez, como pede a LGPD. Os pedidos continuam na lista e no relatório, com o nome e a cidade que já tinham, sem o vínculo com a ficha.
      </ConfirmDialog>
    </div>
  );
}
