import { useSearchParams } from 'react-router-dom';
import { ExternalLink, MessageSquareQuote, Pencil } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { SECTION_LABEL, type SiteContent } from '../../../data/content';
import { useCatalog } from '../../../store/catalog';
import { SectionEditor, sectionState } from './SectionEditor';
import { isSiteSectionId, SITE_GROUPS, SITE_SECTION_INFO, type SiteSectionId } from './siteSections';

/** Published testimonials (every saved one is on the site). */
export function testimonialCount(content: SiteContent | undefined): { shown: number } {
  return { shown: content?.depoimentos?.items.length ?? 0 };
}

function SectionCard({ id, content, onEdit }: { id: SiteSectionId; content: SiteContent | undefined; onEdit: () => void }) {
  const info = SITE_SECTION_INFO[id];
  const stored = content?.[id];
  const label = SECTION_LABEL[id];
  const featured = id === 'depoimentos';
  const count = featured ? testimonialCount(content) : null;
  return (
    <li className={cx('flex min-w-0 flex-col gap-3 rounded-[14px] border bg-white p-4', featured ? 'border-copper md:col-span-2' : 'border-line')}>
      <div className="flex items-start gap-3">
        {featured && <MessageSquareQuote size={24} strokeWidth={1.5} className="mt-0.5 shrink-0 text-copper" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{label}</h3>
          <p className="text-sm text-ink-muted">{info.description}</p>
        </div>
      </div>
      {count && (
        <p className="text-sm">
          {count.shown === 0 ? (
            <span>
              Nenhum depoimento no site ainda. A seção aparece na página inicial quando
              houver pelo menos 1.
            </span>
          ) : (
            <span>
              <span className="price font-display text-[1.375rem] leading-none">{count.shown}</span> {count.shown === 1 ? 'depoimento no site' : 'depoimentos no site'}
            </span>
          )}
        </p>
      )}
      <p className={cx('text-sm', stored ? 'text-ink' : 'text-ink-muted')}>{sectionState(stored)}</p>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button variant={featured ? 'primary' : 'secondary'} size="sm" onClick={onEdit} aria-label={featured ? undefined : `Editar ${label}`}>
          <Pencil size={16} strokeWidth={1.5} aria-hidden="true" /> {featured ? 'Editar depoimentos' : 'Editar'}
        </Button>
        {info.href && (
          <a
            href={info.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-copper underline underline-offset-4 hover:bg-champagne"
          >
            Ver no site <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">{`: ${label} (abre em outra aba)`}</span>
          </a>
        )}
      </div>
    </li>
  );
}

/** Painel → Site: every text and image visitors read, grouped by page. `?secao=<id>` opens an editor. */
export function SitePage() {
  const content = useCatalog((s) => s.data.content);
  const [params, setParams] = useSearchParams();
  const requested = params.get('secao');
  const editing = isSiteSectionId(requested) ? requested : null;

  const open = (id: SiteSectionId) =>
    setParams(
      (p) => {
        p.set('secao', id);
        return p;
      },
      { replace: true },
    );
  const close = () =>
    setParams(
      (p) => {
        p.delete('secao');
        return p;
      },
      { replace: true },
    );

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-ink-muted">
        Textos e fotos do site. Ao salvar, muda na hora para todo mundo, e dá para voltar ao original.
      </p>
      {SITE_GROUPS.map((group) => (
        <section key={group.title} aria-labelledby={`site-${group.title}`} className="flex flex-col gap-3">
          <div>
            <h2 id={`site-${group.title}`} className="font-display text-[1.625rem] leading-tight">
              {group.title}
            </h2>
            <p className="text-sm text-ink-muted">{group.intro}</p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {group.ids.map((id) => (
              <SectionCard key={id} id={id} content={content} onEdit={() => open(id)} />
            ))}
          </ul>
        </section>
      ))}
      {editing && <SectionEditor key={editing} id={editing} onClose={close} />}
    </div>
  );
}
