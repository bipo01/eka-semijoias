import { ContentPageHeader } from '../components/layout/PageHeader';
import { DEFAULT_PRIVACY_DATE } from '../content/defaults';
import { paragraphs } from '../data/content';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSection } from '../hooks/useSection';

const longDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Cuiaba' });

/** "24 de novembro de 2026" (the store's time zone, so every visitor sees the same day). */
function formatLongDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : longDate.format(date);
}

/** /privacidade: the privacy policy (Painel → Site → Política de privacidade, or the built-in text). */
export function PrivacyPage() {
  useDocumentTitle('Política de privacidade');
  const policy = useSection('privacidade');
  const iso = policy.updatedAt ?? DEFAULT_PRIVACY_DATE;
  const updated = formatLongDate(iso);
  return (
    <div className="pb-16">
      <ContentPageHeader header={policy.header} />
      <div className="container-x">
        <div className="max-w-3xl">
          {updated && (
            <p className="text-sm text-ink-muted">
              Atualizada em <time dateTime={iso}>{updated}</time>
            </p>
          )}
          <div className="mt-8 flex flex-col gap-10">
            {policy.blocks.map((block) => (
              <section key={block.id} aria-labelledby={`privacidade-${block.id}`} className="min-w-0">
                <h2 id={`privacidade-${block.id}`} className="font-display text-display-m break-words">
                  {block.title}
                </h2>
                <div className="mt-3 space-y-3 leading-relaxed text-ink">
                  {paragraphs(block.text).map((p, i) => (
                    <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
