import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { formatBRL } from '../../lib/format';
import { EmptyState } from '../FormBits';
import { formatPhone } from '../lib/contact';
import { matchesCustomer, useCustomerList, useCustomers } from '../lib/customers';
import { CustomerDetail, placeOf } from './CustomerDetail';
import { CustomerForm } from './CustomerForm';

/*
 * Painel → Clientes (docs/revenda/PLAN.md §1): search, list with what each
 * customer bought, "Nova cliente" and her record. A link from an order opens
 * /admin/clientes?cliente=<id>.
 */

export function CustomersPage() {
  const state = useCustomerList();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();
  const openId = params.get('cliente');
  const customers = useMemo(() => (state.status === 'ready' ? state.customers : []), [state]);
  const visible = useMemo(() => customers.filter((c) => matchesCustomer(c, query)), [customers, query]);
  const openName = customers.find((c) => c.id === openId)?.name;

  const open = (id: string) =>
    setParams((p) => {
      p.set('cliente', id);
      return p;
    });
  const close = () =>
    setParams(
      (p) => {
        p.delete('cliente');
        return p;
      },
      { replace: true },
    );

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <p className="py-10 text-center text-ink-muted" aria-busy="true">
        Carregando clientes…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-ink-muted">{state.message}</p>
        <Button variant="secondary" onClick={() => void useCustomers.getState().load()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {customers.length ? `${customers.length} ${customers.length === 1 ? 'cliente cadastrada' : 'clientes cadastradas'}.` : 'Cadastre quem compra com você.'}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          Nova cliente
        </Button>
      </div>
      <div className="relative mb-4">
        <label htmlFor="customers-search" className="sr-only">
          Buscar cliente
        </label>
        <Search size={18} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          id="customers-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Buscar por nome, WhatsApp ou cidade"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-12 w-full rounded-[10px] border border-line bg-white pr-3 pl-10 text-base placeholder:text-ink-muted focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
        />
      </div>

      {visible.length ? (
        <ul className="flex flex-col gap-2">
          {visible.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => open(c.id)}
                className="flex w-full items-center gap-3 rounded-[12px] border border-line bg-white p-4 text-left transition-colors hover:border-copper focus-visible:outline-2 focus-visible:outline-copper"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-sm text-ink-muted">{[placeOf(c), c.whatsapp && formatPhone(c.whatsapp)].filter(Boolean).join(' · ') || 'Sem cidade e WhatsApp'}</p>
                  <p className="text-sm text-ink-muted">
                    {c.stats.purchases ? `${c.stats.purchases} ${c.stats.purchases === 1 ? 'compra' : 'compras'}` : 'Nenhuma compra ainda'}
                  </p>
                </div>
                {c.stats.spentCents > 0 && <span className="price shrink-0 text-lg">{formatBRL(c.stats.spentCents)}</span>}
                <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ink-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          {customers.length
            ? 'Nenhuma cliente encontrada.'
            : 'Nenhuma cliente cadastrada ainda. Cadastre aqui ou direto no “Novo pedido”: com o WhatsApp dela, a mensagem da compra (com a garantia) abre pronta na conversa.'}
        </EmptyState>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="Nova cliente" side="right">
        {creating && (
          <CustomerForm
            onDone={(c) => {
              setCreating(false);
              open(c.id);
            }}
            onExisting={(c) => {
              setCreating(false);
              open(c.id);
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!openId} onClose={close} title={openName ?? 'Cliente'} side="right">
        {openId && <CustomerDetail key={openId} id={openId} onClose={close} />}
      </Sheet>
    </>
  );
}
