import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './cx';

export function AccordionItem({ title, children, defaultOpen = false, variant = 'card', headingLevel = 3 }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; variant?: 'card' | 'line'; headingLevel?: 2 | 3 }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={cx(variant === 'card' ? 'rounded-[12px] bg-champagne/70' : 'border-b border-line')}>
      <H className="font-sans text-base">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-button`}
          onClick={() => setOpen((o) => !o)}
          className={cx('flex min-h-13 w-full items-center justify-between gap-4 text-left', variant === 'card' ? 'px-4 py-3' : 'py-4')}
        >
          <span className={cx(variant === 'card' ? 'font-display text-title' : 'font-medium')}>{title}</span>
          <ChevronDown size={20} strokeWidth={1.5} className={cx('shrink-0 transition-transform duration-[240ms]', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </H>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-button`} hidden={!open} className={cx(variant === 'card' ? 'px-4 pb-4' : 'pb-4', 'text-ink-muted')}>
        {children}
      </div>
    </div>
  );
}
