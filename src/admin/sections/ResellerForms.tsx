import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Copy } from 'lucide-react';
import { Button, ButtonAnchor } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { WhatsAppIcon } from '../../components/ui/Icons';
import { Stepper } from '../../components/ui/Misc';
import { firstNameOf } from '../../data/messages';
import { commissionFor, kitState, settle, type Kit, type Reseller, type ResellerSale } from '../../data/revenda';
import type { ResellerLead } from '../../data/schema';
import { sizeLabel } from '../../data/catalog';
import { FINISH_LABEL } from '../../data/schema';
import { useMessages } from '../../hooks/useMessages';
import { UFS, maskPhone } from '../../lib/lead';
import { formatBRL } from '../../lib/format';
import { whatsappUrl } from '../../lib/whatsapp';
import { toast } from '../../store/ui';
import { copyText } from './OrderMessages';
import { OrderItemsEditor } from './OrderItemsEditor';
import type { OrderLine } from '../lib/orders';
import { createKit, createReseller, editKit, idempotencyKey, inviteLink, isError, settleKit, showcaseLink, type KitLineInput } from '../lib/resellers';

/*
 * Forms of the reseller program in the owner's admin: effectivate a reseller
 * (from an application or from scratch), the invite message, the kit editor
 * and the settlement.
 */

const ufOptions = ['', ...UFS];

/** "Efetivar revendedora": creates her and hands back the first-access link once. */
export function NewResellerForm({ lead, onDone }: { lead?: ResellerLead; onDone: (r: { reseller: Reseller; token: string | null }) => void }) {
  const [name, setName] = useState(lead?.name ?? '');
  const [whatsapp, setWhatsapp] = useState(lead ? maskPhone(lead.whatsapp) : '');
  const [city, setCity] = useState(lead?.city ?? '');
  const [uf, setUf] = useState(lead?.uf ?? '');
  const [instagram, setInstagram] = useState(lead?.instagram ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<{ body: string; key: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const input = { ...(lead ? { leadId: lead.id } : {}), name, whatsapp, city, uf, ...(instagram.trim() ? { instagram: instagram.trim() } : {}) };
    const body = JSON.stringify(input);
    if (key.current?.body !== body) key.current = { body, key: idempotencyKey() };
    setBusy(true);
    const result = await createReseller(input, key.current.key);
    setBusy(false);
    if (isError(result)) return setError(result.error);
    toast(`${firstNameOf(result.reseller.name)} agora é revendedora.`, { tone: 'success' });
    // A repeated request (lost answer) never carries the access link again: a new one is generated in her sheet.
    onDone({ reseller: result.reseller, token: result.invite?.token ?? null });
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        A revendedora recebe um link para aceitar o contrato e criar o PIN do painel dela. O mostruário digital fica pronto na hora.
      </p>
      <TextField label="Nome completo" required value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      <TextField label="WhatsApp" required inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} hint="É com ele que ela entra no painel." />
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
        <TextField label="Cidade" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} />
        <SelectField label="UF" value={uf} onChange={(e) => setUf(e.target.value)}>
          {ufOptions.map((u) => (
            <option key={u} value={u}>
              {u || '—'}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField label="Instagram" optional value={instagram} maxLength={60} onChange={(e) => setInstagram(e.target.value)} />
      {error && (
        <p role="alert" className="rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block disabled={busy} aria-busy={busy}>
        {busy ? 'Efetivando…' : 'Efetivar revendedora'}
      </Button>
    </form>
  );
}

/** The ready invite message: first-access link + showcase, to her WhatsApp. */
export function InviteMessage({ reseller, token }: { reseller: Reseller; token: string }) {
  const compose = useMessages();
  const text = compose('convite_revendedora', { primeiro_nome: firstNameOf(reseller.name), link_convite: inviteLink(token), link_mostruario: showcaseLink(reseller.slug) });
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-[10px] bg-champagne/60 p-3 text-sm">
        Envie o convite para {firstNameOf(reseller.name)}. O link de acesso vale por 7 dias e funciona uma vez; se ela perder, gere um novo na ficha dela.
      </p>
      <pre className="max-h-64 overflow-auto rounded-[12px] border border-line bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap">{text}</pre>
      <ButtonAnchor href={whatsappUrl(`55${reseller.whatsapp}`, text)} block>
        <WhatsAppIcon size={19} /> Enviar no WhatsApp dela
      </ButtonAnchor>
      <Button variant="secondary" block onClick={() => void copyText(text, 'Convite copiado.')}>
        <Copy size={18} strokeWidth={1.5} /> Copiar convite
      </Button>
    </div>
  );
}

const toLines = (kit: Kit): OrderLine[] => kit.items.map((i) => ({ productId: i.productId, variantId: i.variantId, ...(i.size ? { size: i.size } : {}), qty: i.qty }));

/** Builds or adjusts a kit with the same piece editor as the orders. */
export function KitEditor({ resellerId, kit, onDone }: { resellerId: string; kit: Kit | null; onDone: () => void }) {
  const [lines, setLines] = useState<OrderLine[]>(() => (kit ? toLines(kit) : []));
  // The version the editor started from; after a conflict it moves to the server's current one.
  const [stamp, setStamp] = useState(kit?.updatedAt ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agreed = useMemo(() => new Map((kit?.items ?? []).map((i) => [`${i.productId}|${i.variantId}|${i.size}`, i.unitCents])), [kit]);

  async function save() {
    if (busy) return;
    if (!lines.length) return setError('Escolha pelo menos uma peça.');
    setError(null);
    setBusy(true);
    const items: KitLineInput[] = lines.map((l) => ({ productId: l.productId, variantId: l.variantId, ...(l.size ? { size: l.size } : {}), qty: l.qty }));
    const result = kit ? await editKit(kit, items, stamp) : await createKit(resellerId, items);
    setBusy(false);
    if (isError(result)) {
      const latest = (result.details as { kit?: { updatedAt?: string } } | undefined)?.kit?.updatedAt;
      if (latest) {
        setStamp(latest);
        return setError(`${result.error} Suas peças continuam aqui: confira e toque em salvar de novo.`);
      }
      return setError(result.error);
    }
    toast(kit ? 'Maleta atualizada.' : 'Maleta montada. As peças com controle de estoque saíram do estoque.', { tone: 'success' });
    onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <OrderItemsEditor lines={lines} onChange={setLines} agreed={agreed} label="Peças da maleta" addLabel="Adicionar à maleta" />
      <ul className="flex flex-col gap-1 text-sm text-ink-muted">
        <li>Os preços são os de venda: o do catálogo hoje (as peças que já estavam na maleta mantêm o preço).</li>
        <li>Peças com controle de estoque saem do estoque agora e voltam no acerto, se não forem vendidas.</li>
      </ul>
      {error && (
        <p role="alert" className="rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button size="lg" block disabled={busy} aria-busy={busy} onClick={() => void save()}>
        {busy ? 'Salvando…' : kit ? 'Salvar maleta' : 'Montar maleta'}
      </Button>
    </div>
  );
}

const keyOf = (l: { productId: string; variantId: string; size: string }) => `${l.productId}|${l.variantId}|${l.size}`;

/** Settlement: how many came back per piece; the totals update as she counts. */
export function SettleForm({ kit, sales, onDone }: { kit: Kit; sales: ResellerSale[]; onDone: () => void }) {
  const lines = kitState(kit, sales);
  const [back, setBack] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [keyOf(l), l.available])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The kit version this count was made against: a sale arriving meanwhile is refused by the
  // server until the owner looks at the new numbers and confirms again.
  const [stamp, setStamp] = useState(kit.updatedAt);
  const changed = stamp !== kit.updatedAt;
  const returned = lines.map((l) => ({ productId: l.productId, variantId: l.variantId, size: l.size, qty: back[keyOf(l)] ?? 0 }));
  const preview = settle(kit, sales, returned);
  const commission = commissionFor('error' in preview ? 0 : preview.soldCents, kit.tiers);

  async function confirmSettlement() {
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await settleKit(kit, returned, stamp);
    setBusy(false);
    if (isError(result)) {
      const latest = (result.details as { kit?: { updatedAt?: string } } | undefined)?.kit?.updatedAt;
      if (latest) setStamp(latest);
      return setError(result.error);
    }
    toast('Acerto feito. As peças devolvidas voltaram para o estoque.', { tone: 'success' });
    onDone();
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Peças devolvidas">
        <h3 className="mb-2 text-sm font-medium">Quantas voltaram de cada peça?</h3>
        <ul className="divide-y divide-line border-y border-line">
          {lines.map((l) => (
            <li key={keyOf(l)} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="leading-snug">{l.name}</p>
                <p className="text-sm text-ink-muted">
                  {FINISH_LABEL[l.finish]}
                  {l.size && ` · ${sizeLabel(l.size)}`} · recebeu {l.qty}, vendeu {l.sold}
                </p>
              </div>
              {l.available > 0 ? (
                <Stepper size="sm" min={0} max={l.available} value={back[keyOf(l)] ?? 0} label={`Devolvidas de ${l.name}`} onChange={(v) => setBack((b) => ({ ...b, [keyOf(l)]: v }))} />
              ) : (
                <span className="text-sm text-ink-muted">Tudo vendido</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      {'error' in preview ? (
        <p role="alert" className="text-sm text-danger">
          {preview.error}
        </p>
      ) : (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 rounded-[12px] border border-line bg-white p-4 text-sm">
          <dt>Vendido no ciclo</dt>
          <dd className="price text-right">{formatBRL(preview.soldCents)}</dd>
          <dt>Comissão ({commission.percent}%)</dt>
          <dd className="price text-right">−{formatBRL(preview.commissionCents)}</dd>
          {preview.missingCents > 0 && (
            <>
              <dt className="text-danger">Peças que não voltaram</dt>
              <dd className="price text-right text-danger">+{formatBRL(preview.missingCents)}</dd>
            </>
          )}
          <dt className="border-t border-line pt-2 font-medium">A revendedora repassa</dt>
          <dd className="price border-t border-line pt-2 text-right font-display text-xl">{formatBRL(preview.dueCents)}</dd>
        </dl>
      )}
      {changed && !error && (
        <p role="status" className="rounded-[10px] bg-champagne/60 p-3 text-sm">
          A maleta mudou enquanto você conferia (uma venda nova?). Os números acima já estão atualizados.{' '}
          <button type="button" className="text-copper underline underline-offset-4" onClick={() => setStamp(kit.updatedAt)}>
            Conferi, continuar
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button size="lg" block disabled={busy || 'error' in preview || changed} aria-busy={busy} onClick={() => void confirmSettlement()}>
        {busy ? 'Fechando…' : 'Confirmar acerto'}
      </Button>
      <p className="text-center text-sm text-ink-muted">Fecha esta maleta. Você pode abrir uma nova logo em seguida.</p>
    </div>
  );
}
