import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { TextArea, TextField } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { HOLDS_STOCK, type Order } from '../../data/orders';
import { idempotencyKey } from '../../lib/api';
import { formatBRL } from '../../lib/format';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { SwitchRow } from '../FormBits';
import { createManualOrder, editOrderItems, type OrderLine } from '../lib/orders';
import { lineKey, linePrice, OrderItemsEditor } from './OrderItemsEditor';

/*
 * "Novo pedido" (a sale closed on WhatsApp or in person, registered by the
 * owner) and "Editar peças" of an open order. The server prices, checks the
 * stock and answers; the list changes only after it confirms.
 */

function NewOrderForm({ onDone }: { onDone: (order: Order) => void }) {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  // One key per form content: a retry of the same order never registers it twice.
  const key = useRef<{ body: string; key: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (name.trim().length < 2) {
      setNameError('Informe o nome da cliente.');
      return;
    }
    if (!lines.length) {
      setError('Adicione pelo menos uma peça.');
      return;
    }
    const input = { items: lines, name, city, ...(note.trim() ? { note } : {}), status: confirmed ? ('confirmado' as const) : ('enviado' as const) };
    const body = JSON.stringify(input);
    if (key.current?.body !== body) key.current = { body, key: idempotencyKey() };
    setBusy(true);
    const result = await createManualOrder(input, key.current.key);
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    toast(`Pedido nº ${result.order.number} registrado${confirmed ? ' e confirmado' : ''}.`, { tone: 'success' });
    onDone(result.order);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">Para vendas que chegaram direto pelo WhatsApp ou pessoalmente. Os preços vêm do catálogo.</p>
      <OrderItemsEditor lines={lines} onChange={setLines} />
      <TextField
        label="Nome da cliente"
        required
        autoComplete="off"
        value={name}
        maxLength={80}
        error={nameError}
        onChange={(e) => {
          setName(e.target.value);
          setNameError(undefined);
        }}
      />
      <TextField label="Cidade" optional autoComplete="off" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} />
      <TextArea label="Observação" optional value={note} maxLength={300} rows={3} onChange={(e) => setNote(e.target.value)} />
      <SwitchRow
        label="Já confirmado"
        hint={confirmed ? 'As peças com controle de estoque saem do estoque agora.' : 'Fica em negociação; o estoque só muda quando você confirmar.'}
        checked={confirmed}
        onChange={setConfirmed}
      />
      {error && (
        <p role="alert" className="rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block disabled={busy} aria-busy={busy}>
        {busy ? 'Registrando…' : 'Registrar pedido'}
      </Button>
    </form>
  );
}

/** "Novo pedido" button + sheet (the form is mounted per opening, so it always starts empty). */
export function NewOrderButton({ onCreated }: { onCreated: (order: Order) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Novo pedido
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Novo pedido" side="right">
        {open && (
          <NewOrderForm
            onDone={(order) => {
              setOpen(false);
              onCreated(order);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function EditItemsForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const catalog = useCatalog((s) => s.data);
  const [lines, setLines] = useState<OrderLine[]>(() => order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, ...(i.size ? { size: i.size } : {}), qty: i.qty })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The version the editor started from: if the order changes meanwhile (another device, a receipt),
  // the server refuses the save instead of overwriting.
  const [stamp] = useState(order.updatedAt);
  const agreed = useMemo(() => new Map(order.items.map((i) => [lineKey(i), i.unitCents])), [order.items]);
  const total = lines.reduce((sum, l) => sum + (linePrice(catalog, l, agreed) ?? 0) * l.qty, 0);
  const amountChanges = total !== order.totalCents;

  async function save() {
    if (busy) return;
    if (!lines.length) {
      setError('O pedido precisa de pelo menos uma peça. Para desistir da venda, cancele o pedido.');
      return;
    }
    setError(null);
    setBusy(true);
    const result = await editOrderItems(order, lines, stamp);
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    toast(result.chargeDropped ? 'Peças atualizadas. O valor mudou: gere uma nova cobrança por Pix.' : 'Peças atualizadas.', { tone: 'success', duration: result.chargeDropped ? 9000 : undefined });
    onDone();
  }

  return (
    <div className="flex flex-col gap-5">
      <OrderItemsEditor lines={lines} onChange={setLines} agreed={agreed} />
      <ul className="flex flex-col gap-1.5 text-sm text-ink-muted">
        <li>As peças que já estavam no pedido mantêm o preço combinado; as novas entram com o preço de hoje.</li>
        {HOLDS_STOCK.has(order.status) && <li>O pedido está confirmado: o que sair volta para o estoque e o que entrar sai na hora.</li>}
        {order.charge && amountChanges && <li className="text-danger">O valor muda para {formatBRL(total)}: o link de pagamento atual deixa de valer e você gera uma nova cobrança.</li>}
      </ul>
      {error && (
        <p role="alert" className="rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button size="lg" block disabled={busy} aria-busy={busy} onClick={() => void save()}>
        {busy ? 'Salvando…' : 'Salvar peças'}
      </Button>
    </div>
  );
}

/** "Editar peças" in the order detail (only while the order is in negotiation or confirmed). */
export function EditItemsSheet({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Peças · pedido nº ${order.number}`} side="right">
      {open && <EditItemsForm order={order} onDone={onClose} />}
    </Sheet>
  );
}
