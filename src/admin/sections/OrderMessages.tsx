import { useMemo, useState } from 'react';
import { Copy, MessageCircleMore } from 'lucide-react';
import { Button, ButtonAnchor } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { WhatsAppIcon } from '../../components/ui/Icons';
import { Chip } from '../../components/ui/Misc';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../components/ui/cx';
import { activeTemplate, firstNameOf, MESSAGE_TYPE_INFO, templatesFor, type MessageType, type MessageVars } from '../../data/messages';
import type { Order } from '../../data/orders';
import { FINISH_LABEL } from '../../data/schema';
import { messageItems, useMessages } from '../../hooks/useMessages';
import { formatBRL } from '../../lib/format';
import { buildPixPayload, pixTxid } from '../../lib/pix';
import { whatsappUrl } from '../../lib/whatsapp';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { paymentLink } from '../lib/orders';

/*
 * Messages to the customer from an order: the owner picks the kind (charge,
 * reminder, paid, on its way, after-sale), a variation of her templates
 * (Painel → Mensagens), adjusts the text for this time and copies it or opens
 * WhatsApp. The customer's number is not stored: WhatsApp asks for the chat.
 */

export async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, { tone: 'success' });
  } catch {
    toast('Não foi possível copiar automaticamente. Selecione o texto e copie.', { tone: 'error' });
  }
}

/** Everything an order offers to its message templates. */
export function useOrderMessage(order: Order) {
  const pix = useCatalog((s) => s.data.settings.pix);
  const compose = useMessages();
  return useMemo(() => {
    const charge = order.charge;
    const link = charge ? paymentLink(charge.token) : undefined;
    const pixCode = charge && pix ? buildPixPayload({ key: pix.key, name: pix.name, city: pix.city, amountCents: charge.amountCents, txid: pixTxid(order.number) }) : undefined;
    const name = order.anonymized ? '' : order.customer.name;
    const vars: MessageVars = {
      nome: name,
      primeiro_nome: firstNameOf(name),
      cidade: order.anonymized ? '' : order.customer.city,
      pedido: String(order.number),
      total: formatBRL(charge?.amountCents ?? order.totalCents),
      frete: charge?.shippingCents ? formatBRL(charge.shippingCents) : '',
      desconto: charge?.discountCents ? formatBRL(charge.discountCents) : '',
      obs: order.note,
      link,
      pix: pixCode,
    };
    const items = messageItems(order.items.map((i) => ({ name: i.name, finish: FINISH_LABEL[i.finish], ...(i.size ? { size: i.size } : {}), qty: i.qty, lineCents: i.unitCents * i.qty })));
    return {
      link,
      compose: (type: MessageType, templateId?: string, extra: MessageVars = {}) => compose(type, { ...vars, ...extra }, { items, compactIfLong: false, ...(templateId ? { templateId } : {}) }),
    };
  }, [order, pix, compose]);
}

/** The kinds of message that make sense for an order right now (first = suggested). */
export function orderMessageTypes(order: Order): MessageType[] {
  const charged = !!order.charge;
  switch (order.status) {
    case 'confirmado':
      return charged ? ['lembrete', 'cobranca'] : [];
    case 'pago':
      return ['pago', 'enviado', 'posvenda'];
    case 'entregue':
      return ['posvenda', 'enviado', 'pago'];
    default:
      return [];
  }
}

/** Copy / open WhatsApp for a ready text. `quiet`: secondary styling when another action leads. */
export function MessageActions({ text, quiet }: { text: string; quiet?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Button block variant={quiet ? 'secondary' : 'primary'} onClick={() => void copyText(text, 'Mensagem copiada. É só colar na conversa da cliente.')}>
        <Copy size={18} strokeWidth={1.5} /> Copiar mensagem
      </Button>
      <ButtonAnchor href={whatsappUrl(null, text)} variant={quiet ? 'ghost' : 'secondary'} block>
        <WhatsAppIcon size={19} /> Abrir WhatsApp
      </ButtonAnchor>
    </div>
  );
}

/**
 * Pick a kind and a variation, adjust the text, send. Mounted per opening, so
 * every opening starts from the current templates.
 */
export function OrderMessageComposer({ order, types, initialType }: { order: Order; types: MessageType[]; initialType?: MessageType }) {
  const settings = useCatalog((s) => s.data.settings.messages);
  const om = useOrderMessage(order);
  const [type, setType] = useState<MessageType>(initialType ?? types[0]!);
  const [templateId, setTemplateId] = useState(() => activeTemplate(settings, initialType ?? types[0]!).id);
  const [rastreio, setRastreio] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const options = templatesFor(settings, type);
  const template = options.find((t) => t.id === templateId) ?? options[0]!;
  const generated = om.compose(type, template.id, { rastreio });
  const text = draft ?? generated;
  const usesTracking = template.text.includes('{rastreio}');
  const needsLink = !!om.link && (type === 'cobranca' || type === 'lembrete') && template.text.includes('{link}');

  const chooseType = (next: MessageType) => {
    setType(next);
    setTemplateId(activeTemplate(settings, next).id);
    setDraft(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {types.length > 1 && (
        <div role="group" aria-label="Tipo de mensagem" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {types.map((t) => (
            <Chip key={t} selected={t === type} onClick={() => chooseType(t)}>
              {MESSAGE_TYPE_INFO[t].label}
            </Chip>
          ))}
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-medium">Variação</p>
        <div role="group" aria-label="Variação da mensagem" className="flex flex-wrap gap-2">
          {options.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={t.id === template.id}
              onClick={() => {
                setTemplateId(t.id);
                setDraft(null);
              }}
              className={cx(
                'inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors',
                t.id === template.id ? 'border-copper bg-champagne text-ink' : 'border-line bg-white text-ink-muted hover:border-copper hover:text-ink',
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      {usesTracking && (
        <TextField
          label="Código de rastreio"
          optional
          value={rastreio}
          onChange={(e) => setRastreio(e.target.value.toUpperCase())}
          hint={draft !== null ? 'Você editou o texto: o código entra quando você voltar ao texto da variação.' : 'Sem código, a linha do rastreio sai da mensagem.'}
        />
      )}
      <label htmlFor={`order-msg-${order.id}`} className="sr-only">
        Mensagem para a cliente
      </label>
      <textarea
        id={`order-msg-${order.id}`}
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        rows={Math.min(16, Math.max(4, text.split('\n').length + Math.ceil(text.length / 48)))}
        className="w-full resize-y rounded-[12px] border border-line bg-white p-4 text-sm leading-relaxed text-ink focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
      />
      {draft !== null && draft !== generated && (
        <div className="-mt-2 flex flex-col gap-1 text-sm">
          {needsLink && om.link && !draft.includes(om.link) && <p className="text-danger">O link de pagamento saiu da mensagem: sem ele a cliente não consegue enviar o comprovante.</p>}
          <button type="button" className="min-h-9 self-start text-copper underline underline-offset-4" onClick={() => setDraft(null)}>
            Voltar ao texto da variação
          </button>
        </div>
      )}
      <MessageActions text={text} />
      <p className="text-center text-xs text-ink-muted">Os textos e as variações ficam em Painel → Mensagens.</p>
    </div>
  );
}

/** "Enviar mensagem" in the order detail. */
export function OrderMessageButton({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const types = orderMessageTypes(order);
  if (!types.length) return null;
  return (
    <>
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        <MessageCircleMore size={18} strokeWidth={1.5} /> Enviar mensagem
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Mensagem · pedido nº ${order.number}`} side="bottom" className="md-right">
        {open && <OrderMessageComposer order={order} types={types} />}
      </Sheet>
    </>
  );
}
