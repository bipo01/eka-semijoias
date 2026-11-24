import { createContext, useContext, useId, type ReactNode } from 'react';
import { TextArea, TextField } from '../../../components/ui/Field';
import { cx } from '../../../components/ui/cx';
import { FormSection, SwitchRow } from '../../FormBits';
import type { SiteSectionId } from './siteSections';
import { getIn, isRequired, overLimit, pathKey, textLimit, type Path } from './sectionDraft';

/*
 * Fields of the site editor. Each one is bound to a path of the section
 * draft through EditorContext; limits and "required" come from the section's
 * schema, so what the counter allows is exactly what the server accepts.
 */

export interface EditorApi {
  id: SiteSectionId;
  draft: unknown;
  set: (path: Path, value: unknown) => void;
  /** Validation problems by field key ("hero.title", "items.2.text"). */
  errors: Record<string, string>;
}

const EditorContext = createContext<EditorApi | null>(null);
export const EditorProvider = EditorContext.Provider;

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error('useEditor outside the section editor');
  return api;
}

const PARAGRAPH_HINT = 'Deixe uma linha em branco para começar outro parágrafo.';

/** "12/60" with a spoken equivalent. */
function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span className={cx('shrink-0 tabular-nums', length > max && 'text-danger')}>
      <span aria-hidden="true">
        {length}/{max}
      </span>
      <span className="sr-only">
        {length} de {max} caracteres
      </span>
    </span>
  );
}

interface TextInputProps {
  path: Path;
  label: string;
  hint?: string;
  /** Multi-line text (TextArea). */
  long?: boolean;
  /** Long text where a blank line starts a new paragraph (adds the hint). */
  paragraphs?: boolean;
  rows?: number;
  placeholder?: string;
}

/** A text field of the section with a live character counter at the schema limit. */
export function TextInput({ path, label, hint, long, paragraphs, rows, placeholder }: TextInputProps) {
  const { id, draft, set, errors } = useEditor();
  const value = String(getIn(draft, path) ?? '');
  const max = textLimit(id, path);
  const required = isRequired(id, path);
  const key = pathKey(path);
  const error = errors[key] ?? overLimit(value, max);
  const text = [paragraphs ? PARAGRAPH_HINT : null, hint].filter(Boolean).join(' ');
  const fullHint = (
    <span className="flex items-start justify-between gap-3">
      <span>{text}</span>
      {max > 0 && <Counter length={value.trim().length} max={max} />}
    </span>
  );
  const common = {
    label,
    hint: fullHint,
    error,
    value,
    placeholder,
    required,
    optional: !required,
    'data-field': key,
  };
  return long || paragraphs ? (
    <TextArea {...common} rows={rows ?? (paragraphs ? 6 : 3)} onChange={(e) => set(path, e.target.value)} />
  ) : (
    <TextField {...common} onChange={(e) => set(path, e.target.value)} />
  );
}

/** A yes/no field of the section as a switch. */
export function Toggle({ path, label, hint }: { path: Path; label: string; hint?: string }) {
  const { draft, set } = useEditor();
  return <SwitchRow label={label} {...(hint ? { hint } : {})} checked={getIn(draft, path) === true} onChange={(v) => set(path, v)} />;
}

/** A required checkbox of the section (e.g. the testimonial authorization). */
export function Checkbox({ path, label, hint }: { path: Path; label: ReactNode; hint?: string }) {
  const { draft, set, errors } = useEditor();
  const uid = useId();
  const key = pathKey(path);
  const error = errors[key];
  const describedBy = [error ? `${uid}-error` : null, hint ? `${uid}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={uid} className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
        <input
          id={uid}
          type="checkbox"
          required
          data-field={key}
          className="mt-0.5 size-5 shrink-0 accent-copper"
          checked={getIn(draft, path) === true}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => set(path, e.target.checked)}
        />
        <span className="text-sm font-medium">
          {label}
          <span aria-hidden="true" className="text-copper">
            {' '}
            *
          </span>
        </span>
      </label>
      {hint && (
        <p id={`${uid}-hint`} className="pl-8 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${uid}-error`} role="alert" className="pl-8 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Page header: eyebrow, title with an italic word at the end, intro. */
export function HeaderFields({ path, title = 'Topo da página' }: { path: Path; title?: string }) {
  return (
    <Group title={title}>
      <TextInput path={[...path, 'eyebrow']} label="Chamada acima do título" hint="Palavra pequena que aparece em cima do título." />
      <TextInput path={[...path, 'title']} label="Título" />
      <TextInput path={[...path, 'highlight']} label="Destaque" hint="Palavra em itálico no fim do título." />
      <TextInput path={[...path, 'intro']} label="Introdução" long />
    </Group>
  );
}

/** A titled block of fields inside the editor. */
export function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <FormSection title={title}>
      {hint && <p className="-mt-2 text-sm text-ink-muted">{hint}</p>}
      {children}
    </FormSection>
  );
}
