import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Button, ButtonAnchor, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { WhatsAppIcon } from '../../components/ui/Icons';
import type { ResellerLead } from '../../data/schema';
import { toCSV } from '../../lib/csv';
import { whatsappUrl } from '../../lib/whatsapp';
import { useCatalog } from '../../store/catalog';
import { EmptyState } from '../FormBits';
import { formatDateTime, formatPhone, whatsappDigits } from '../lib/contact';
import { downloadText, fileDate } from '../lib/download';
import { save } from '../lib/persist';

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

const greeting = (lead: ResellerLead) =>
  `Olá, ${lead.name.trim().split(/\s+/)[0] || 'tudo bem'}! Aqui é da ÉKA Semijoias. Recebemos seu cadastro para revender nossas peças e queremos conversar com você.`;

export function LeadsPage() {
  const leads = useCatalog((s) => s.data.leads);
  const [deleting, setDeleting] = useState<ResellerLead | null>(null);
  const sorted = newestFirst(leads);

  function confirmDelete() {
    if (!deleting) return;
    if (save((d) => ({ ...d, leads: d.leads.filter((l) => l.id !== deleting.id) }), 'Cadastro excluído.')) setDeleting(null);
  }

  return (
    <>
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
              <li key={lead.id} className="rounded-[12px] border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{lead.name}</p>
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
                {digits.length >= 12 && (
                  <ButtonAnchor href={whatsappUrl(digits, greeting(lead))} size="sm" className="mt-3">
                    <WhatsAppIcon size={18} /> Chamar no WhatsApp
                  </ButtonAnchor>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>
          Nenhum cadastro de revendedora ainda. Quando alguém preencher o formulário da página Revendedoras, o contato aparece aqui.
        </EmptyState>
      )}

      <ConfirmDialog open={!!deleting} title="Excluir este cadastro?" confirmLabel="Excluir" tone="danger" onConfirm={confirmDelete} onCancel={() => setDeleting(null)}>
        O cadastro de {deleting?.name || 'revendedora'} sai da lista. Se precisar dele depois, exporte o CSV antes.
      </ConfirmDialog>
    </>
  );
}
