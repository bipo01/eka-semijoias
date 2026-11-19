import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

const control =
  'w-full rounded-[10px] border border-line bg-white px-3.5 text-base text-ink placeholder:text-ink-muted transition-colors duration-[160ms] hover:border-[#d6c4b7] focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper aria-invalid:border-danger';

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

function FieldShell({ id, label, hint, error, optional, required, children, className }: FieldShellProps) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && <span aria-hidden="true" className="text-copper"> *</span>}
        {optional && <span className="font-normal text-ink-muted"> (opcional)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-sm text-ink-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Extra = { label: ReactNode; hint?: ReactNode; error?: string | undefined; optional?: boolean; wrapperClassName?: string; icon?: ReactNode };

function describedBy(id: string, hint: unknown, error: unknown) {
  return [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
}

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Extra>(
  ({ label, hint, error, optional, wrapperClassName, icon, className, id: idProp, required, ...props }, ref) => {
    const auto = useId();
    const id = idProp ?? auto;
    return (
      <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} required={required} className={wrapperClassName}>
        <div className="relative">
          {icon && <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted">{icon}</span>}
          <input
            ref={ref}
            id={id}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hint, error)}
            className={cx(control, 'min-h-12', icon && 'pl-11', className)}
            {...props}
          />
        </div>
      </FieldShell>
    );
  },
);
TextField.displayName = 'TextField';

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Extra>(
  ({ label, hint, error, optional, wrapperClassName, className, id: idProp, required, ...props }, ref) => {
    const auto = useId();
    const id = idProp ?? auto;
    return (
      <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} required={required} className={wrapperClassName}>
        <textarea
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cx(control, 'min-h-24 py-3 leading-normal', className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
TextArea.displayName = 'TextArea';

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Extra>(
  ({ label, hint, error, optional, wrapperClassName, className, id: idProp, required, children, ...props }, ref) => {
    const auto = useId();
    const id = idProp ?? auto;
    return (
      <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} required={required} className={wrapperClassName}>
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cx(control, 'min-h-12 appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236F574D%27 stroke-width=%271.5%27><path d=%27m6 9 6 6 6-6%27/></svg>")] bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10', className)}
          {...props}
        >
          {children}
        </select>
      </FieldShell>
    );
  },
);
SelectField.displayName = 'SelectField';

/** Plain search-style input without a visible label block (label via aria-label). */
export const BareInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(
  ({ icon, className, ...props }, ref) => (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted">{icon}</span>}
      <input ref={ref} className={cx(control, 'min-h-12 rounded-full', icon && 'pl-11', className)} {...props} />
    </div>
  ),
);
BareInput.displayName = 'BareInput';
