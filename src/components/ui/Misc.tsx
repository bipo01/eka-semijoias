import { Minus, Plus } from 'lucide-react';
import { FINISH_LABEL, type Finish } from '../../data/schema';
import { formatBRL } from '../../lib/format';
import { cx } from './cx';

export const FINISH_SWATCH: Record<Finish, string> = {
  rose: 'linear-gradient(135deg, #f1d2bf 0%, #c99a83 55%, #a77a66 100%)',
  dourado: 'linear-gradient(135deg, #f6e3a8 0%, #d6b25c 55%, #b48c3c 100%)',
  prateado: 'linear-gradient(135deg, #fbfbfb 0%, #cfcfcf 55%, #a9a9a9 100%)',
  'rodio-negro': 'linear-gradient(135deg, #7b7672 0%, #45403d 55%, #24201e 100%)',
};

export function SwatchDot({ finish, size = 12, className }: { finish: Finish; size?: number; className?: string }) {
  return (
    <span
      title={FINISH_LABEL[finish]}
      className={cx('inline-block shrink-0 rounded-full ring-1 ring-black/10', className)}
      style={{ width: size, height: size, background: FINISH_SWATCH[finish] }}
    />
  );
}

export function Price({ price, promoPrice, size = 'md', className }: { price: number; promoPrice?: number | undefined; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const onSale = promoPrice != null && promoPrice < price;
  const main = cx('price', size === 'lg' ? 'text-[1.375rem]' : size === 'md' ? 'text-base' : 'text-sm');
  return (
    <p className={cx('flex flex-wrap items-baseline gap-x-2', className)}>
      {onSale ? (
        <>
          <span className={cx(main, 'text-copper')}>
            <span className="sr-only">Preço promocional: </span>
            {formatBRL(promoPrice)}
          </span>
          <s className={cx('price text-ink-muted', size === 'lg' ? 'text-base' : 'text-sm', 'font-normal')}>
            <span className="sr-only">Preço anterior: </span>
            {formatBRL(price)}
          </s>
        </>
      ) : (
        <span className={main}>{formatBRL(price)}</span>
      )}
    </p>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20, label, size = 'md' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; size?: 'sm' | 'md' }) {
  const btn = cx('inline-flex items-center justify-center rounded-full text-ink hover:bg-champagne disabled:opacity-35', size === 'sm' ? 'size-10' : 'size-11');
  return (
    <div role="group" aria-label={label} className={cx('inline-flex items-center rounded-full border border-line bg-white', size === 'sm' ? 'h-11' : 'h-12')}>
      <button type="button" className={btn} aria-label="Diminuir quantidade" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={16} strokeWidth={1.5} />
      </button>
      <span aria-live="polite" className="price min-w-7 text-center">
        <span className="sr-only">Quantidade: </span>
        {value}
      </span>
      <button type="button" className={btn} aria-label="Aumentar quantidade" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function Chip({ selected, children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap transition-colors duration-[160ms]',
        'relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-[""]',
        selected ? 'border-copper bg-copper text-white' : 'border-line bg-white text-ink hover:border-copper',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-11 w-14 shrink-0 items-center justify-center', className)}
    >
      <span className={cx('h-7 w-12 rounded-full transition-colors duration-[160ms]', checked ? 'bg-copper' : 'bg-line')} />
      <span
        className={cx(
          'absolute top-1/2 left-1 size-6 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-[160ms]',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

export function SectionHeading({ title, action, id, as: Tag = 'h2', className }: { title: React.ReactNode; action?: React.ReactNode; id?: string; as?: 'h1' | 'h2'; className?: string }) {
  return (
    <div className={cx('mb-4 flex items-end justify-between gap-4 md:mb-6', className)}>
      <Tag id={id} className="font-display text-display-m md:text-display-l">
        {title}
      </Tag>
      {action}
    </div>
  );
}
