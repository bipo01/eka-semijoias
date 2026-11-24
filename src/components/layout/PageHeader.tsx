import type { ReactNode } from 'react';
import type { PageHeader as PageHeaderContent } from '../../data/content';
import { cx } from '../ui/cx';

export function PageHeader({ eyebrow, title, intro, className }: { eyebrow?: string; title: ReactNode; intro?: ReactNode; className?: string }) {
  return (
    <header className={cx('container-x pt-8 pb-6 lg:pt-14 lg:pb-10', className)}>
      {eyebrow && <p className="eyebrow mb-2 text-ink-muted">{eyebrow}</p>}
      <h1 className="font-display text-display-l break-words lg:text-display-xl">{title}</h1>
      <span aria-hidden="true" className="mt-4 block h-px w-16 bg-rose" />
      {intro && <div className="mt-4 max-w-2xl text-lg leading-relaxed text-ink">{intro}</div>}
    </header>
  );
}

/** A title with the italic word at the end ("Fale com a <em>gente</em>"); no italic part when it is empty. */
export function Highlighted({ title, highlight }: { title: string; highlight: string }) {
  return (
    <>
      {title}
      {highlight && (
        <>
          {' '}
          <em className="font-medium italic">{highlight}</em>
        </>
      )}
    </>
  );
}

/** The page header of a content section (Painel → Site): eyebrow, title + italic word, intro. Empty parts hide. */
export function ContentPageHeader({ header, className }: { header: PageHeaderContent; className?: string }) {
  return (
    <PageHeader
      eyebrow={header.eyebrow}
      title={<Highlighted title={header.title} highlight={header.highlight} />}
      intro={header.intro ? <p className="whitespace-pre-line [overflow-wrap:anywhere]">{header.intro}</p> : null}
      {...(className ? { className } : {})}
    />
  );
}
