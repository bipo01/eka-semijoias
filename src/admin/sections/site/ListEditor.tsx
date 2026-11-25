import { useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { move } from '../../lib/reorder';
import { getIn, listLimits, pathKey, type Path } from './sectionDraft';
import { useEditor } from './fields';

/*
 * Generic ordered-list editor: add (up to the limit, "x de N"), delete with
 * confirmation, move up/down with focus kept on the moved item and a spoken
 * announcement. The order of the list is the order on the site.
 */

export interface ListEditorProps<T extends { id: string }> {
  title: string;
  hint?: ReactNode;
  items: readonly T[];
  onChange: (items: T[]) => void;
  max: number;
  min?: number;
  /** Lowercase item name ("pergunta"): "Pergunta 2", "Mover pergunta 2 para cima". */
  itemName: string;
  /** Grammatical gender of the item name ("esta pergunta" / "este depoimento"). */
  feminine?: boolean;
  addLabel: string;
  /** Makes a new item; or `onAdd` replaces the add action (e.g. pick a photo first). */
  newItem?: () => T;
  onAdd?: () => void;
  /** New items go first (and the add button sits above the list, as the main action). */
  addAt?: 'start' | 'end';
  renderItem: (item: T, index: number) => ReactNode;
  /** Item heading (defaults to "Pergunta 2"). */
  renderTitle?: (item: T, index: number) => ReactNode;
  /** Extra text in the delete confirmation. */
  deleteText?: (item: T) => string;
  /** Problem of the list as a whole (e.g. "Deixe pelo menos 1 cuidado."). */
  error?: string | undefined;
  /** Field key of the list, for focusing its error. */
  fieldKey?: string;
  empty?: ReactNode;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ListEditor<T extends { id: string }>({
  title,
  hint,
  items,
  onChange,
  max,
  min = 0,
  itemName,
  feminine = true,
  addLabel,
  newItem,
  onAdd,
  addAt = 'end',
  renderItem,
  renderTitle,
  deleteText,
  error,
  fieldKey,
  empty,
}: ListEditorProps<T>) {
  const uid = useId();
  const headingId = `${uid}-title`;
  const addRef = useRef<HTMLButtonElement>(null);
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const full = items.length >= max;
  const label = (i: number) => `${itemName} ${i + 1}`;
  const errorId = `${uid}-error`;

  function add() {
    if (full) return;
    if (onAdd) return onAdd();
    if (!newItem) return;
    const item = newItem();
    onChange(addAt === 'start' ? [item, ...items] : [...items, item]);
    setAnnouncement(`${cap(itemName)} ${feminine ? 'adicionada' : 'adicionado'}.`);
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(`[data-item="${uid}-${item.id}"] :is(input, textarea)`);
      field?.focus();
      field?.scrollIntoView?.({ block: 'center' });
    });
  }

  function moveItem(from: number, to: number) {
    const item = items[from];
    if (!item || to < 0 || to >= items.length) return;
    onChange(move(items, from, to));
    setAnnouncement(`${cap(itemName)} ${feminine ? 'movida' : 'movido'} para a posição ${to + 1} de ${items.length}.`);
    const dir = to < from ? 'up' : 'down';
    requestAnimationFrame(() => {
      const same = document.getElementById(`${uid}-${item.id}-${dir}`) as HTMLButtonElement | null;
      const other = document.getElementById(`${uid}-${item.id}-${dir === 'up' ? 'down' : 'up'}`) as HTMLButtonElement | null;
      (same && !same.disabled ? same : other)?.focus();
    });
  }

  function confirmDelete() {
    const item = pendingDelete;
    setPendingDelete(null);
    if (!item) return;
    onChange(items.filter((i) => i.id !== item.id));
    setAnnouncement(`${cap(itemName)} ${feminine ? 'apagada' : 'apagado'}.`);
    requestAnimationFrame(() => addRef.current?.focus());
  }

  const addButton = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        ref={addRef}
        variant={addAt === 'start' ? 'primary' : 'secondary'}
        size="sm"
        onClick={add}
        disabled={full}
        data-field={fieldKey}
        aria-describedby={error ? errorId : undefined}
      >
        <Plus size={18} strokeWidth={1.75} aria-hidden="true" /> {addLabel}
      </Button>
      <span className="text-sm text-ink-muted">
        {items.length} de {max}
        {full && ' · limite atingido'}
      </span>
    </div>
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-line pt-5">
      <div>
        <h3 id={headingId} className="font-display text-title">
          {title}
        </h3>
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      </div>
      {addAt === 'start' && addButton}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        empty && <div className="rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">{empty}</div>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, i) => (
            <li key={item.id} data-item={`${uid}-${item.id}`} className="min-w-0 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-3">
              <div className="-mt-1 -mr-1 flex items-center gap-1">
                <h4 className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{renderTitle ? renderTitle(item, i) : cap(label(i))}</h4>
                <IconButton id={`${uid}-${item.id}-up`} label={`Mover ${label(i)} para cima`} disabled={i === 0} onClick={() => moveItem(i, i - 1)} className="disabled:opacity-30">
                  <ChevronUp size={20} strokeWidth={1.5} />
                </IconButton>
                <IconButton
                  id={`${uid}-${item.id}-down`}
                  label={`Mover ${label(i)} para baixo`}
                  disabled={i === items.length - 1}
                  onClick={() => moveItem(i, i + 1)}
                  className="disabled:opacity-30"
                >
                  <ChevronDown size={20} strokeWidth={1.5} />
                </IconButton>
                <IconButton label={`Apagar ${label(i)}`} disabled={items.length <= min} onClick={() => setPendingDelete(item)} className="disabled:opacity-30">
                  <Trash2 size={18} strokeWidth={1.5} className="text-danger" />
                </IconButton>
              </div>
              <div className="mt-1 flex flex-col gap-3">{renderItem(item, i)}</div>
            </li>
          ))}
        </ol>
      )}
      {min > 0 && items.length <= min && <p className="text-sm text-ink-muted">Deixe pelo menos {min === 1 ? `1 ${itemName}` : `${min} itens`}.</p>}
      {addAt === 'end' && addButton}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ConfirmDialog
        open={!!pendingDelete}
        title={`Apagar ${feminine ? 'esta' : 'este'} ${itemName}?`}
        confirmLabel="Apagar"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <div className="flex flex-col gap-2">
          {pendingDelete && deleteText && <p className="[overflow-wrap:anywhere]">{deleteText(pendingDelete)}</p>}
          <p>{feminine ? 'Ela' : 'Ele'} sai do site quando você salvar. Até lá, dá para fechar sem salvar e nada muda.</p>
        </div>
      </ConfirmDialog>
    </section>
  );
}

type ListFieldProps<T extends { id: string }> = Omit<ListEditorProps<T>, 'items' | 'onChange' | 'max' | 'min' | 'renderItem' | 'error' | 'fieldKey'> & {
  path: Path;
  /** Renders an item; `itemPath` points at it in the draft (for its fields). */
  renderItem: (item: T, index: number, itemPath: Path) => ReactNode;
};

/** A list of the section draft, with its limits read from the schema. */
export function ListField<T extends { id: string }>({ path, renderItem, ...props }: ListFieldProps<T>) {
  const { id, draft, set, errors } = useEditor();
  const items = (getIn(draft, path) as T[] | undefined) ?? [];
  const { min, max } = listLimits(id, path);
  const key = pathKey(path);
  return (
    <ListEditor<T>
      {...props}
      items={items}
      onChange={(next) => set(path, next)}
      min={min}
      max={max}
      error={errors[key]}
      fieldKey={key}
      renderItem={(item, i) => renderItem(item, i, [...path, i])}
    />
  );
}
