import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../components/ui/cx';

/*
 * The panel's building blocks (design direction in docs/admin/REDESIGN.md): cards with a clear edge,
 * tinted pills that mean something, KPI tiles and segmented tabs. Pages compose these instead of
 * styling each box by hand, so every area separates its content the same way.
 */

export const CARD = 'rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)]';

export function Card({ className, children, as: As = 'div', ...rest }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'li' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx(CARD, className)} {...rest}>
      {children}
    </As>
  );
}

/** Section title with an optional action on the right ("Ver relatório"). */
export function SectionHeading({ title, id, action, eyebrow, className }: { title: ReactNode; id?: string; action?: ReactNode; eyebrow?: string; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-0.5 text-[0.6875rem] text-ink-muted">{eyebrow}</p>}
        <h2 id={id} className="font-display text-[1.5rem] leading-tight font-semibold">
          {title}
        </h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export type Tone = 'neutral' | 'copper' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const TONE: Record<Tone, string> = {
  neutral: 'bg-champagne text-ink',
  copper: 'bg-copper text-white',
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  info: 'bg-info-tint text-info',
  muted: 'bg-[#f1ece8] text-ink-muted',
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-rose',
  copper: 'bg-copper',
  success: 'bg-success',
  warning: 'bg-[#c58a2a]',
  danger: 'bg-danger',
  info: 'bg-info',
  muted: 'bg-ink-muted/60',
};

/** A small rounded label whose color says what it means (paid = green, waiting = amber, late = red). */
export function Pill({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap', TONE[tone], className)}>
      {dot && <span aria-hidden="true" className={cx('size-1.5 rounded-full', TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

/** A number with its label, for summaries. */
export function Kpi({ label, value, hint, tone, className, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'success' | 'warning' | 'danger'; className?: string; icon?: ReactNode }) {
  return (
    <div className={cx(CARD, 'flex min-w-0 flex-col gap-1 p-4', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
        {icon}
        {label}
      </p>
      <p className={cx('price text-[1.5rem] leading-tight font-semibold sm:text-[1.625rem]', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger')}>{value}</p>
      {hint && <p className="text-xs leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number | undefined;
  /** Counts that need her attention get the copper badge. */
  alert?: boolean | undefined;
}

/**
 * Segmented tabs (ARIA tabs pattern: arrow keys move between them). `panelId` is the id of the
 * element that shows the selected tab's content.
 */
export function Tabs<T extends string>({ items, value, onChange, label, panelId, className, size = 'md', variant = 'segmented' }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; panelId?: string; className?: string; size?: 'md' | 'sm'; variant?: 'segmented' | 'underline' }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  function onKey(e: KeyboardEvent, i: number) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + items.length) % items.length;
    onChange(items[next]!.id);
    refs.current[next]?.focus();
  }
  const underline = variant === 'underline';
  return (
    <div className={cx(!underline && 'no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <div role="tablist" aria-label={label} className={underline ? 'flex border-b border-line' : 'inline-flex min-w-full gap-1 rounded-2xl border border-line bg-[#f6efe9] p-1 sm:min-w-0'}>
        {items.map((t, i) => {
          const selected = t.id === value;
          const badge = t.count != null && (!underline || t.count > 0);
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${baseId}-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              {...(panelId ? { 'aria-controls': panelId } : {})}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cx(
                'relative inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap transition-[background-color,color,box-shadow] duration-[160ms]',
                underline
                  ? cx('min-h-11 px-1 text-[0.875rem]', selected ? 'font-medium text-copper' : 'text-ink-muted hover:text-ink')
                  : cx('gap-1.5 rounded-xl px-3.5 text-sm', size === 'sm' ? 'min-h-10' : 'min-h-11', selected ? 'bg-white font-medium text-ink shadow-[0_1px_3px_rgb(48_33_28/0.12)]' : 'text-ink-muted hover:text-ink'),
              )}
            >
              {t.label}
              {badge && (
                <span
                  className={cx(
                    'price inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[0.6875rem] leading-[18px]',
                    t.alert && (t.count ?? 0) > 0 ? 'bg-copper text-white' : selected ? 'bg-champagne text-ink' : 'bg-white/70 text-ink-muted',
                  )}
                >
                  {t.count}
                </span>
              )}
              {underline && <span aria-hidden="true" className={cx('absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-copper transition-opacity', selected ? 'opacity-100' : 'opacity-0')} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Initials in a round copper badge (resellers, customers). */
export function Avatar({ name, size = 44, className }: { name: string; size?: number; className?: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '·';
  return (
    <span
      aria-hidden="true"
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f6e8de] to-[#ecd5c6] font-display font-semibold text-copper ring-1 ring-[#e6cdbd]', className)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

/** Empty state: a small illustration, a title, one sentence and at most one action. */
export function Empty({ title, children, action, image }: { title: string; children?: ReactNode; action?: ReactNode; image?: ReactNode }) {
  return (
    <div className={cx(CARD, 'flex flex-col items-center gap-2 px-6 py-10 text-center')}>
      {image}
      <p className="font-display text-[1.375rem] leading-tight font-semibold">{title}</p>
      {children && <p className="max-w-sm text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
