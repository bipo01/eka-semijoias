import { useId, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { IconButton } from '../components/ui/Button';
import { Switch } from '../components/ui/Misc';
import { cx } from '../components/ui/cx';

/** A labeled switch row ("Disponível no catálogo"). */
export function SwitchRow({ label, hint, checked, onChange, className }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  const hintId = useId();
  return (
    <div className={cx('flex items-center justify-between gap-4', className)}>
      <div>
        <p className="font-medium" aria-hidden="true">
          {label}
        </p>
        {hint && (
          <p id={hintId} className="text-sm text-ink-muted">
            {hint}
          </p>
        )}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function FormSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cx('flex flex-col gap-4 border-t border-line pt-5', className)}>
      <h3 id={id} className="font-display text-title">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Up/down buttons for ordered lists. */
export function MoveButtons({ name, index, count, onMove }: { name: string; index: number; count: number; onMove: (to: number) => void }) {
  return (
    <>
      <IconButton label={`Mover ${name} para cima`} disabled={index === 0} onClick={() => onMove(index - 1)} className="disabled:opacity-30">
        <ChevronUp size={20} strokeWidth={1.5} />
      </IconButton>
      <IconButton label={`Mover ${name} para baixo`} disabled={index === count - 1} onClick={() => onMove(index + 1)} className="disabled:opacity-30">
        <ChevronDown size={20} strokeWidth={1.5} />
      </IconButton>
    </>
  );
}

/** Empty-state box. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-[12px] border border-dashed border-line px-4 py-10 text-center text-ink-muted">{children}</div>;
}

/** Reorder, edit and delete buttons for a list row: a 2×2 grid on phones, one row from 640 px. */
export function RowActions({ name, index, count, onMove, onEdit, onDelete }: { name: string; index: number; count: number; onMove: (to: number) => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="grid shrink-0 grid-flow-col grid-rows-2 sm:flex sm:items-center">
      <MoveButtons name={name} index={index} count={count} onMove={onMove} />
      <IconButton label={`Editar ${name}`} onClick={onEdit}>
        <Pencil size={18} strokeWidth={1.5} />
      </IconButton>
      <IconButton label={`Excluir ${name}`} onClick={onDelete}>
        <Trash2 size={18} strokeWidth={1.5} className="text-danger" />
      </IconButton>
    </div>
  );
}
