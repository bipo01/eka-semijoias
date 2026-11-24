import { useState } from 'react';
import { AlertTriangle, ChevronRight, Copy, Download, ExternalLink, KeyRound, Plus, Trash2 } from 'lucide-react';
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
import { EmptyState, SwitchRow } from '../FormBits';
import { formatDateTime, formatPhone } from '../lib/contact';
import { downloadText, fileDate } from '../lib/download';
import { checkContract, eraseReseller, erasureBlocker, isError, markKitPaid, newInvite, patchReseller, saveProgram, settlementsCsv, showcaseLink, useProgram, useResellerDetail, useResellers, type ResellerSummary } from '../lib/resellers';
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

const STATUS_STYLE: Record<ResellerStatus, string> = {
  ativa: 'bg-[#e4ece6] text-success',
  pausada: 'bg-champagne text-ink',
  encerrada: 'bg-[#f6e9e6] text-danger',
};

function StatusPill({ status }: { status: ResellerStatus }) {
  return <span className={cx('inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-medium', STATUS_STYLE[status])}>{RESELLER_STATUS_LABEL[status]}</span>;
}

function dueLabel(kit: Kit): { text: string; late: boolean } {
  const d = daysLeft(kit.dueAt);
  if (d < 0) return { text: `Acerto atrasado ${-d} ${d === -1 ? 'dia' : 'dias'}`, late: true };
  if (d === 0) return { text: 'Acerto hoje', late: true };
  return { text: `Acerto em ${d} ${d === 1 ? 'dia' : 'dias'}`, late: d <= 3 };
}

function ResellerRow({ item, onOpen }: { item: ResellerSummary; onOpen: () => void }) {
  const { reseller, kit, sales } = item;
  const sold = salesTotalCents(sales);
  const due = kit ? dueLabel(kit) : null;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-[12px] border border-line bg-white p-4 text-left transition-colors hover:border-copper focus-visible:outline-2 focus-visible:outline-copper">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{reseller.name}</span>
          <StatusPill status={reseller.status} />
          {!reseller.hasPin && reseller.status === 'ativa' && <span className="inline-flex min-h-6 items-center rounded-full border border-copper px-2.5 text-xs text-copper">Convite pendente</span>}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {[reseller.city, reseller.uf].filter(Boolean).join('/') || '—'}
          {kit ? ` · maleta ${formatBRL(kitValueCents(kit.items))} · vendeu ${formatBRL(sold)}` : ' · sem maleta'}
        </p>
        {due && <p className={cx('text-sm', due.late ? 'text-danger' : 'text-ink-muted')}>{due.text}</p>}
        {item.unpaidCents > 0 && <p className="text-sm text-danger">A receber de acertos: {formatBRL(item.unpaidCents)}</p>}
      </div>
      <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ink-muted" />
    </button>
  );
}

function KitSummary({ kit, sales }: { kit: Kit; sales: ResellerSale[] }) {
  const lines = kitState(kit, sales);
  const sold = salesTotalCents(sales);
  const c = commissionFor(sold, kit.tiers);
  const due = dueLabel(kit);
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          ['Maleta', formatBRL(kitValueCents(kit.items))],
          ['Vendido', formatBRL(sold)],
          [`Comissão (${c.percent}%)`, formatBRL(c.commissionCents)],
          ['Prazo', due.text],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[10px] bg-champagne/50 p-3">
            <dt className="text-xs text-ink-muted">{k}</dt>
            <dd className={cx('price font-medium', k === 'Prazo' && due.late && 'text-danger')}>{v}</dd>
          </div>
        ))}
      </dl>
      {c.next && <p className="text-sm text-ink-muted">Faltam {formatBRL(c.next.missingCents)} para {c.next.percent}% de comissão.</p>}
      <ul className="divide-y divide-line border-y border-line text-sm">
        {lines.map((l) => (
          <li key={`${l.productId}|${l.variantId}|${l.size}`} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="leading-snug">{l.name}</p>
              <p className="text-ink-muted">
                {FINISH_LABEL[l.finish]}
                {l.size && ` · ${sizeLabel(l.size)}`} · {formatBRL(l.unitCents)}
              </p>
            </div>
            <p className="shrink-0 text-right text-ink-muted">
              {l.sold}/{l.qty} vendidas
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResellerDetailView({ id, program, onClose }: { id: string; program: Program; onClose: () => void }) {
  const { state, reload } = useResellerDetail(id);
  const [sheet, setSheet] = useState<'kit' | 'settle' | 'edit' | null>(null);
  const [ending, setEnding] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  async function setStatus(status: ResellerStatus) {
    if (busy) return;
    setBusy(true);
    const r = await patchReseller(reseller, { status });
    setBusy(false);
    if (isError(r)) return toast(r.error, { tone: 'error', duration: 9000 });
    toast(status === 'ativa' ? 'Revendedora reativada.' : status === 'pausada' ? 'Revendedora pausada: o acesso dela foi encerrado.' : 'Parceria encerrada.', { tone: 'success' });
    reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={reseller.status} />
        <span className="text-sm text-ink-muted">Desde {formatDateTime(reseller.createdAt)}</span>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-[12px] border border-line bg-white p-4 text-sm">
        <dt className="text-ink-muted">WhatsApp</dt>
        <dd className="price">{formatPhone(reseller.whatsapp)}</dd>
        <dt className="text-ink-muted">Cidade</dt>
        <dd>{[reseller.city, reseller.uf].filter(Boolean).join('/') || '—'}</dd>
        <dt className="text-ink-muted">Mostruário</dt>
        <dd className="break-all">
          <a className="text-copper underline underline-offset-4" href={`/r/${reseller.slug}`} target="_blank" rel="noopener noreferrer">
            /r/{reseller.slug}
          </a>
        </dd>
        <dt className="text-ink-muted">Contrato</dt>
        <dd>
          {reseller.contract ? `Aceito em ${formatDateTime(reseller.contract.acceptedAt)} (versão ${reseller.contract.version})` : 'Ainda não aceito'}
          {reseller.contract?.mode === 'link' && !reseller.contract.checkedAt && (
            <button type="button" className="ml-2 text-copper underline underline-offset-4" onClick={() => void checkContract(reseller.id).then((r) => (isError(r) ? toast(r.error, { tone: 'error' }) : reload()))}>
              Marcar assinatura conferida
            </button>
          )}
          {contractDue && reseller.contract && <span className="block text-danger">O contrato mudou: ela aceita a versão nova no painel dela (as vendas ficam bloqueadas até lá).</span>}
        </dd>
        <dt className="text-ink-muted">Acesso</dt>
        <dd>{reseller.status !== 'ativa' ? (reseller.status === 'pausada' ? 'Acesso pausado' : 'Acesso encerrado') : reseller.hasPin ? `Painel ativo${reseller.lastSeenAt ? ` · visto ${formatDateTime(reseller.lastSeenAt)}` : ''}` : invitePendingUntil ? `Convite válido até ${formatDateTime(invitePendingUntil)}` : 'Sem convite válido'}</dd>
      </dl>
      {acceptances[0] && (
        <details className="group text-sm text-ink-muted">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" className="transition-transform group-open:rotate-90" /> Registro do aceite
          </summary>
          <p className="mt-2 break-all">
            Nome digitado: {acceptances[0].typedName} · {formatDateTime(acceptances[0].acceptedAt)} · versão {acceptances[0].version} · SHA-256 do texto: {acceptances[0].textSha256}
          </p>
        </details>
      )}

      <div className="flex flex-col gap-2">
        {invite ? (
          <InviteMessage reseller={reseller} token={invite} />
        ) : (
          reseller.status === 'ativa' && (
            <>
              <Button variant="secondary" block disabled={busy} onClick={() => void regenerate()}>
                <KeyRound size={18} strokeWidth={1.5} /> {reseller.hasPin ? 'Gerar novo acesso' : 'Gerar novo convite'}
              </Button>
              {reseller.hasPin && <p className="text-center text-sm text-ink-muted">Use se ela esqueceu o PIN.</p>}
            </>
          )
        )}
        <Button variant="ghost" block onClick={() => void copyText(showcaseLink(reseller.slug), 'Link do mostruário copiado.')}>
          <Copy size={18} strokeWidth={1.5} /> Copiar link do mostruário
        </Button>
        <ButtonAnchor href={whatsappUrl(`55${reseller.whatsapp}`, `Oi, ${firstNameOf(reseller.name)}!`)} variant="ghost" block>
          <WhatsAppIcon size={18} /> Conversar no WhatsApp
        </ButtonAnchor>
      </div>

      <section aria-labelledby="kit-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id="kit-title" className="font-display text-title">
            Maleta
          </h3>
          {open && (
            <button type="button" className="min-h-9 text-sm text-copper underline underline-offset-4" onClick={() => setSheet('kit')}>
              Ajustar peças
            </button>
          )}
        </div>
        {open ? (
          <>
            <KitSummary kit={open} sales={openSales} />
            <Button size="lg" block onClick={() => setSheet('settle')}>
              Fazer acerto
            </Button>
          </>
        ) : reseller.status === 'ativa' ? (
          <>
            <p className="text-sm text-ink-muted">Sem maleta aberta. Monte a maleta com as peças que ela vai levar.</p>
            <Button block onClick={() => setSheet('kit')}>
              <Plus size={18} strokeWidth={1.5} /> Montar maleta
            </Button>
          </>
        ) : (
          <p className="text-sm text-ink-muted">Revendedora {RESELLER_STATUS_LABEL[reseller.status].toLowerCase()}.</p>
        )}
      </section>

      {openSales.length > 0 && (
        <section aria-labelledby="sales-title">
          <h3 id="sales-title" className="mb-2 font-display text-title">
            Vendas deste ciclo
          </h3>
          {open && discounts.cents > 0 && (
            <p className="mb-2 rounded-[10px] bg-[#f6e9e6] px-3 py-2 text-sm text-danger">
              Descontos no ciclo: <span className="price font-medium">{formatBRL(discounts.cents)}</span> em {discounts.sales === 1 ? '1 venda' : `${discounts.sales} vendas`}.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {openSales.map((s) => {
              const discount = open ? saleDiscountCents(open, s) : 0;
              return (
                <li key={s.id} className={cx('rounded-[10px] border border-line bg-white p-3 text-sm', s.status === 'cancelada' && 'opacity-60')}>
                  <div className="flex justify-between gap-3">
                    <span>{formatDateTime(s.createdAt)}</span>
                    <span className="price font-medium">{formatBRL(s.totalCents)}</span>
                  </div>
                  <p className="text-ink-muted">
                    {s.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')} · {PAYMENT_LABEL[s.payment]}
                    {s.customer?.name && ` · ${s.customer.name}`}
                    {s.status === 'cancelada' && ' · desfeita'}
                  </p>
                  {discount > 0 && (
                    <p className="mt-1 font-medium text-danger">
                      Desconto de <span className="price">{formatBRL(discount)}</span> · preço da maleta <span className="price">{formatBRL(s.totalCents + discount)}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {closed.length > 0 && (
        <section aria-labelledby="hist-title">
          <h3 id="hist-title" className="mb-2 font-display text-title">
            Acertos
          </h3>
          <ul className="flex flex-col gap-2">
            {closed.map((k) => (
              <li key={k.id} className="rounded-[10px] border border-line bg-white p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span>{formatDateTime(k.closedAt ?? k.updatedAt)}</span>
                  <span className="price font-medium">{formatBRL(k.settlement?.dueCents ?? 0)}</span>
                </div>
                <p className="text-ink-muted">
                  Vendeu {formatBRL(k.settlement?.soldCents ?? 0)} · comissão {k.settlement?.percent}% ({formatBRL(k.settlement?.commissionCents ?? 0)})
                  {k.settlement?.missingCents ? ` · faltaram ${formatBRL(k.settlement.missingCents)}` : ''}
                </p>
                <SwitchRow
                  className="mt-2"
                  label="Repasse recebido"
                  {...(k.settlement?.paidAt ? { hint: `Marcado em ${formatDateTime(k.settlement.paidAt)}` } : {})}
                  checked={!!k.settlement?.paidAt}
                  onChange={(paid) => void markKitPaid(k, paid).then((r) => (isError(r) ? toast(r.error, { tone: 'error' }) : reload()))}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-1 border-t border-line pt-4">
        <button type="button" className="min-h-11 self-start text-sm text-copper underline underline-offset-4" onClick={() => setSheet('edit')}>
          Editar dados e comissão
        </button>
        {reseller.status === 'ativa' ? (
          <button type="button" className="min-h-11 self-start text-sm text-ink-muted underline underline-offset-4" disabled={busy} onClick={() => void setStatus('pausada')}>
            Pausar revendedora (encerra o acesso dela)
          </button>
        ) : (
          <button type="button" className="min-h-11 self-start text-sm text-copper underline underline-offset-4" disabled={busy} onClick={() => void setStatus('ativa')}>
            Reativar revendedora
          </button>
        )}
        {reseller.status !== 'encerrada' && !open && (
          <button type="button" className="min-h-11 self-start text-sm text-danger underline underline-offset-4" disabled={busy} onClick={() => setEnding(true)}>
            Encerrar parceria
          </button>
        )}
      </div>
      {reseller.status === 'encerrada' && (
        <section aria-labelledby="erase-title" className="flex flex-col gap-2 rounded-[12px] border border-line bg-white p-4">
          <h3 id="erase-title" className="font-display text-title">
            Dados pessoais
          </h3>
          <p className="text-sm text-ink-muted">A parceria terminou. Se ela pedir, ou quando você não precisar mais do histórico dela, dá para apagar os dados dela do sistema.</p>
          {eraseBlocked && <p className="text-sm text-danger">{eraseBlocked}</p>}
          <Button variant="secondary" className="self-start" disabled={!!eraseBlocked} onClick={() => setErasing(true)}>
            <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" /> Apagar os dados de {firstNameOf(reseller.name)}
          </Button>
        </section>
      )}
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
        <p role="alert" className="rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
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
      <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-white p-4" aria-labelledby="tiers-title">
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

      <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-white p-4" aria-labelledby="contract-title">
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
        <p role="alert" className="rounded-[10px] bg-[#f6e9e6] p-3 text-sm text-danger">
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
  const [tab, setTab] = useState<Tab>('revendedoras');
  const { state } = useResellers();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ lead?: ResellerLead } | null>(null);
  const [created, setCreated] = useState<{ reseller: Reseller; token: string | null } | null>(null);
  const list = state.status === 'ready' ? state.data.resellers : [];
  const program = state.status === 'ready' ? state.data.program : null;
  const open = list.find((r) => r.reseller.id === openId);

  return (
    <>
      <div role="group" aria-label="Seção" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip selected={tab === 'revendedoras'} onClick={() => setTab('revendedoras')}>
          Revendedoras <span className="price text-xs">{list.filter((r) => r.reseller.status !== 'encerrada').length}</span>
        </Chip>
        <Chip selected={tab === 'fichas'} onClick={() => setTab('fichas')}>
          Fichas de cadastro
        </Chip>
        <Chip selected={tab === 'programa'} onClick={() => setTab('programa')}>
          Programa e contrato
        </Chip>
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
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">Aprove uma ficha ou cadastre direto.</p>
              <Button size="sm" onClick={() => setCreating({})} className="shrink-0 whitespace-nowrap">
                <Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Nova revendedora
              </Button>
            </div>
            {list.length ? (
              <ul className="flex flex-col gap-2">
                {list.map((item) => (
                  <li key={item.reseller.id}>
                    <ResellerRow item={item} onOpen={() => setOpenId(item.reseller.id)} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Nenhuma revendedora ainda. Aprove uma ficha em “Fichas de cadastro” e toque em “Efetivar”.</EmptyState>
            )}
          </>
        ))}

      {tab === 'fichas' && <LeadsPage onEffectivate={(lead) => setCreating({ lead })} />}
      {tab === 'programa' && <ProgramPanel />}

      <Sheet open={!!open && !!program} onClose={() => setOpenId(null)} title={open ? open.reseller.name : 'Revendedora'} side="right">
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
    </>
  );
}
