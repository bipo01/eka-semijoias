import type { ReactNode } from 'react';
import { cx } from '../ui/cx';

export function PageHeader({ eyebrow, title, intro, className }: { eyebrow?: string; title: ReactNode; intro?: ReactNode; className?: string }) {
  return (
    <header className={cx('container-x pt-8 pb-6 lg:pt-14 lg:pb-10', className)}>
      {eyebrow && <p className="eyebrow mb-2 text-ink-muted">{eyebrow}</p>}
      <h1 className="font-display text-display-l lg:text-display-xl">{title}</h1>
      <span aria-hidden="true" className="mt-4 block h-px w-16 bg-rose" />
      {intro && <div className="mt-4 max-w-2xl text-lg leading-relaxed text-ink">{intro}</div>}
    </header>
  );
}
