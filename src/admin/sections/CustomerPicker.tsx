import { useEffect, useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatPhone } from '../lib/contact';
import { matchesCustomer, useCustomers, type Customer } from '../lib/customers';
import { Loader } from '../Loader';

/*
 * Search among the registered customers (name, city or WhatsApp, accents
 * ignored) and pick one. Used by "Novo pedido" and "Vincular cliente".
 */

const MAX_RESULTS = 30;

export function CustomerSearchList({ onPick, initialQuery = '', label = 'Buscar cliente' }: { onPick: (c: Customer) => void; initialQuery?: string; label?: string }) {
  const state = useCustomers((s) => s.state);
  const [query, setQuery] = useState(initialQuery);
  const id = useId();
  useEffect(() => useCustomers.getState().ensure(), []);
  const customers = useMemo(() => (state.status === 'ready' ? state.customers : []), [state]);
  const results = useMemo(() => customers.filter((c) => matchesCustomer(c, query)).slice(0, MAX_RESULTS), [customers, query]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <Search size={18} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          id={id}
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Nome, cidade ou WhatsApp"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Inside "Novo pedido" (a form): Enter here searches, it must not register the order.
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          className="min-h-12 w-full rounded-[10px] border border-line bg-white pr-3 pl-10 text-base placeholder:text-ink-muted focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
        />
      </div>
      {state.status === 'loading' || state.status === 'idle' ? (
        <Loader variant="perolas" label="Carregando clientes…" size={44} className="py-4" />
      ) : state.status === 'error' ? (
        <p role="alert" className="py-3 text-sm text-danger">
          {state.message}{' '}
          <button type="button" className="min-h-9 text-copper underline underline-offset-4" onClick={() => void useCustomers.getState().load()}>
            Tentar de novo
          </button>
        </p>
      ) : results.length ? (
        <ul className="flex max-h-64 flex-col overflow-y-auto rounded-[10px] border border-line bg-white" aria-label="Clientes encontradas">
          {results.map((c) => (
            <li key={c.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => onPick(c)} className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-champagne focus-visible:outline-2 focus-visible:outline-copper">
                <span className="leading-snug">{c.name}</span>
                <span className="text-sm text-ink-muted">{[c.city && `${c.city}${c.uf ? `/${c.uf}` : ''}`, c.whatsapp && formatPhone(c.whatsapp)].filter(Boolean).join(' · ') || 'Sem cidade e WhatsApp'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-3 text-sm text-ink-muted">{customers.length ? 'Nenhuma cliente encontrada.' : 'Nenhuma cliente cadastrada ainda.'}</p>
      )}
    </div>
  );
}
