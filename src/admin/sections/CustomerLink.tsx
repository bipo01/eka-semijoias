import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRoundPlus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { firstNameOf } from '../../data/messages';
import type { Order } from '../../data/orders';
import { toast } from '../../store/ui';
import { linkOrderCustomer, useCustomer, type Customer } from '../lib/customers';
import { adminPath } from '../lib/paths';
import { CustomerForm } from './CustomerForm';
import { CustomerSearchList } from './CustomerPicker';

/*
 * The "Ficha" row of an order: the linked customer (opens her record) or
 * "Vincular cliente" (search, or register her from the order's name and city).
 */

function LinkSheet({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  async function link(c: Customer) {
    if (busy) return;
    setBusy(true);
    const problem = await linkOrderCustomer(order, c.id);
    setBusy(false);
    if (problem) return toast(problem, { tone: 'error' });
    toast(`Pedido vinculado à ficha de ${firstNameOf(c.name) || 'cliente'}.`, { tone: 'success' });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={creating ? 'Cadastrar cliente' : 'Vincular cliente'} side="right">
      {open &&
        (creating ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">Com os dados do pedido. Acrescente o WhatsApp para as mensagens abrirem direto na conversa dela.</p>
            <CustomerForm
              initial={{ name: order.customer.name, city: order.customer.city }}
              submitLabel="Cadastrar e vincular"
              existingLabel="Vincular esta cliente"
              onDone={(c) => void link(c)}
              onExisting={(c) => void link(c)}
            />
            <Button variant="ghost" block onClick={() => setCreating(false)}>
              Buscar uma cliente cadastrada
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4" aria-busy={busy}>
            <CustomerSearchList onPick={(c) => void link(c)} initialQuery={firstNameOf(order.customer.name)} />
            <Button variant="secondary" block onClick={() => setCreating(true)}>
              <UserRoundPlus size={18} strokeWidth={1.5} /> Cadastrar com os dados do pedido
            </Button>
          </div>
        ))}
    </Sheet>
  );
}

const rowAction = '-my-2 inline-flex min-h-9 items-center underline underline-offset-4';

/** `<dt>`/`<dd>` pair for the order's details list. */
export function OrderCustomerRow({ order }: { order: Order }) {
  const customer = useCustomer(order.customerId);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (order.anonymized && !order.customerId) return null;

  async function unlink() {
    if (busy) return;
    setBusy(true);
    const problem = await linkOrderCustomer(order, null);
    setBusy(false);
    toast(problem ?? 'Pedido desvinculado da ficha.', { tone: problem ? 'error' : 'success' });
  }

  return (
    <>
      <dt className="text-ink-muted">Ficha</dt>
      {/* 36 px touch targets that take one text line in the list (negative margins keep the rows aligned). */}
      <dd className="flex min-w-0 flex-wrap gap-x-4">
        {order.customerId ? (
          <>
            <Link to={`${adminPath('clientes')}?cliente=${encodeURIComponent(order.customerId)}`} className={`${rowAction} min-w-0 break-words text-copper`}>
              {customer ? customer.name : 'Abrir a ficha da cliente'}
            </Link>
            <button type="button" disabled={busy} className={`${rowAction} text-ink-muted hover:text-ink`} onClick={() => void unlink()}>
              Desvincular
            </button>
          </>
        ) : (
          <button type="button" className={`${rowAction} text-copper`} onClick={() => setLinking(true)}>
            Vincular cliente
          </button>
        )}
        <LinkSheet order={order} open={linking} onClose={() => setLinking(false)} />
      </dd>
    </>
  );
}
