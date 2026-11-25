import { useState } from 'react';
import { Chip } from '../../components/ui/Misc';
import { cx } from '../../components/ui/cx';
import { LEAD_STATUS_LABEL, type LeadStatus } from '../../data/revenda';
import { patchLead, isError } from '../lib/resellers';
import { Download, Trash2 } from 'lucide-react';
import { Button, ButtonAnchor, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { WhatsAppIcon } from '../../components/ui/Icons';
import type { ResellerLead } from '../../data/schema';
import { toCSV } from '../../lib/csv';
import { whatsappUrl } from '../../lib/whatsapp';
import { toast } from '../../store/ui';
import { EmptyState } from '../FormBits';
import { formatDateTime, formatPhone, whatsappDigits } from '../lib/contact';
import { downloadText, fileDate } from '../lib/download';
import { useLeads } from '../lib/leads';
import { useMessages } from '../../hooks/useMessages';
import { firstNameOf } from '../../data/messages';

export const newestFirst = (leads: ResellerLead[]) => [...leads].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

/** CSV for Excel in pt-BR (semicolon separated). */
export function leadsCsv(leads: ResellerLead[]): string {
  return toCSV(
    ['Nome', 'WhatsApp', 'Cidade', 'UF', 'Instagram', 'Já revende', 'Origem', 'Data'],
    newestFirst(leads).map((l) => [
      l.name,
      formatPhone(l.whatsapp),
      l.city,
      l.uf,
      l.instagram ? `@${l.instagram.replace(/^@/, '')}` : '',
      l.alreadySells,
      l.source ?? '',
      formatDateTime(l.createdAt),
    ]),
    { delimiter: ';' },
  );
}


const LEAD_STYLE: Record<LeadStatus, string> = {
  nova: 'bg-copper text-white',
  analise: 'bg-champagne text-ink',
  aprovada: 'bg-success-tint text-success',
  recusada: 'bg-danger-tint text-danger',
  efetivada: 'border border-copper text-copper',
};
type LeadFilter = 'abertas' | LeadStatus | 'todas';
const LEAD_FILTERS: { id: LeadFilter; label: string }[] = [
  { id: 'abertas', label: 'Para analisar' },
  { id: 'aprovada', label: 'Aprovadas' },
  { id: 'efetivada', label: 'Revendedoras' },
  { id: 'recusada', label: 'Recusadas' },
  { id: 'todas', label: 'Todas' },
];
const statusOf = (l: ResellerLead): LeadStatus => l.status ?? 'nova';
const matches = (l: ResellerLead, f: LeadFilter) => (f === 'todas' ? true : f === 'abertas' ? statusOf(l) === 'nova' || statusOf(l) === 'analise' : statusOf(l) === f);

export function LeadsPage({ onEffectivate }: { onEffectivate?: (lead: ResellerLead) => void } = {}) {
  const { state, reload, remove } = useLeads();
  const [filter, setFilter] = useState<LeadFilter>('abertas');
  const [reviewing, setReviewing] = useState<string | null>(null);

  async function review(lead: ResellerLead, status: Exclude<LeadStatus, 'efetivada'>) {
    if (reviewing) return;
    setReviewing(lead.id);
    const r = await patchLead(lead.id, { status });
    setReviewing(null);
    if (isError(r)) toast(r.error, { tone: 'error' });
    else reload();
  }
  const message = useMessages();
  const [deleting, setDeleting] = useState<ResellerLead | null>(null);
  const [busy, setBusy] = useState(false);
  const leads = state.status === 'ready' ? state.leads : [];
  const sorted = newestFirst(leads).filter((l) => matches(l, filter));

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    const problem = await remove(deleting.id);
    setBusy(false);
    if (problem) return toast(problem, { tone: 'error' });
    toast('Cadastro excluído.', { tone: 'success' });
    setDeleting(null);
  }

  if (state.status === 'loading') {
    return <p className="py-10 text-center text-ink-muted" aria-busy="true">Carregando cadastros…</p>;
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-ink-muted">{state.message}</p>
        <Button variant="secondary" onClick={reload}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {LEAD_FILTERS.map((f) => (
          <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className={cx('price text-xs', filter === f.id ? 'text-white/85' : 'text-ink-muted')}>{leads.filter((l) => matches(l, f.id)).length}</span>
          </Chip>
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{leads.length === 1 ? '1 cadastro' : `${leads.length} cadastros`}, do mais recente ao mais antigo.</p>
        <Button size="sm" variant="secondary" className="shrink-0" disabled={!leads.length} onClick={() => downloadText(`eka-revendedoras-${fileDate()}.csv`, leadsCsv(leads), 'text/csv;charset=utf-8')}>
          <Download size={18} strokeWidth={1.5} /> Exportar CSV
        </Button>
      </div>

      {sorted.length ? (
        <ul className="flex flex-col gap-2">
          {sorted.map((lead) => {
            const digits = whatsappDigits(lead.whatsapp);
            return (
              <li key={lead.id} className="rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium break-words">{lead.name}</p>
                      <span className={cx('inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-medium', LEAD_STYLE[statusOf(lead)])}>{LEAD_STATUS_LABEL[statusOf(lead)]}</span>
                    </div>
                    <p className="text-sm text-ink-muted">{formatDateTime(lead.createdAt)}</p>
                  </div>
                  <IconButton label={`Excluir cadastro de ${lead.name}`} onClick={() => setDeleting(lead)} className="-mt-2 -mr-2">
                    <Trash2 size={18} strokeWidth={1.5} className="text-danger" />
                  </IconButton>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink-muted">WhatsApp</dt>
                  <dd className="price">{formatPhone(lead.whatsapp) || '—'}</dd>
                  <dt className="text-ink-muted">Cidade</dt>
                  <dd>{[lead.city, lead.uf].filter(Boolean).join('/') || '—'}</dd>
                  {lead.instagram && (
                    <>
                      <dt className="text-ink-muted">Instagram</dt>
                      <dd className="break-words">@{lead.instagram.replace(/^@/, '')}</dd>
                    </>
                  )}
                  <dt className="text-ink-muted">Já revende</dt>
                  <dd>{lead.alreadySells ? 'Sim' : 'Não'}</dd>
                  {lead.source && (
                    <>
                      <dt className="text-ink-muted">Origem</dt>
                      <dd className="break-words">{lead.source}</dd>
                    </>
                  )}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {digits.length >= 12 && (
                    <ButtonAnchor href={whatsappUrl(digits, message('boasvindas', { primeiro_nome: firstNameOf(lead.name) }))} size="sm" variant="secondary">
                      <WhatsAppIcon size={18} /> Chamar no WhatsApp
                    </ButtonAnchor>
                  )}
                  {statusOf(lead) === 'nova' && (
                    <Button size="sm" variant="ghost" disabled={reviewing === lead.id} onClick={() => void review(lead, 'analise')}>
                      Em análise
                    </Button>
                  )}
                  {(statusOf(lead) === 'nova' || statusOf(lead) === 'analise' || statusOf(lead) === 'recusada') && (
                    <Button size="sm" variant="ghost" disabled={reviewing === lead.id} onClick={() => void review(lead, 'aprovada')}>
                      Aprovar
                    </Button>
                  )}
                  {(statusOf(lead) === 'nova' || statusOf(lead) === 'analise' || statusOf(lead) === 'aprovada') && (
                    <Button size="sm" variant="ghost-danger" disabled={reviewing === lead.id} onClick={() => void review(lead, 'recusada')}>
                      Recusar
                    </Button>
                  )}
                  {statusOf(lead) === 'aprovada' && onEffectivate && (
                    <Button size="sm" onClick={() => onEffectivate(lead)}>
                      Efetivar revendedora
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>
          {leads.length ? 'Nenhuma ficha neste filtro.' : 'Nenhum pré-cadastro ainda.'}{leads.length ? '' : ' Quando alguém preencher o formulário de revendedoras, o cadastro aparece aqui na hora.'}
        </EmptyState>
      )}

      <ConfirmDialog open={!!deleting} title="Excluir este cadastro?" confirmLabel="Excluir" tone="danger" onConfirm={() => void confirmDelete()} onCancel={() => setDeleting(null)}>
        O cadastro de {deleting?.name || 'revendedora'} sai da lista. Se precisar dele depois, exporte o CSV antes.
      </ConfirmDialog>
    </>
  );
}
