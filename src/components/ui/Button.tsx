import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ghost-danger' | 'danger' | 'on-dark';
export type ButtonSize = 'md' | 'sm' | 'lg';

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-medium select-none',
    'transition-[background-color,color,border-color,box-shadow] duration-[160ms] ease-[var(--ease)]',
    'disabled:opacity-50 aria-disabled:opacity-50',
    size === 'lg' && 'min-h-13 px-7 text-[1.0625rem]',
    size === 'md' && 'min-h-12 px-6 text-base',
    size === 'sm' && 'min-h-11 px-4 text-sm',
    variant === 'primary' && 'bg-copper text-white hover:bg-copper-dark active:bg-copper-dark',
    variant === 'secondary' && 'border border-copper text-copper bg-transparent hover:bg-champagne',
    variant === 'ghost' && 'text-ink hover:bg-champagne',
    // A text color passed in className would lose to text-ink (same specificity): destructive ghosts get their own variant.
    variant === 'ghost-danger' && 'text-danger hover:bg-[#f6e9e6]',
    variant === 'danger' && 'border border-danger text-danger bg-transparent hover:bg-[#f6e9e6]',
    variant === 'on-dark' && 'border border-rose-light text-rose-light hover:bg-white/5',
    block && 'w-full',
  );
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & Common>(
  ({ variant, size, block, className, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cx(buttonClass(variant, size, block), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export function ButtonLink({ variant, size, block, className, ...props }: LinkProps & Common) {
  return <Link className={cx(buttonClass(variant, size, block), className)} {...props} />;
}

/** External link styled as a button (WhatsApp, Instagram). Opens in a new tab. */
export function ButtonAnchor({ variant, size, block, className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & Common) {
  return <a target="_blank" rel="noopener noreferrer" className={cx(buttonClass(variant, size, block), className)} {...props} />;
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  ({ label, className, type = 'button', children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-[160ms] hover:bg-champagne',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
