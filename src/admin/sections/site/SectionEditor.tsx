import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBlocker } from 'react-router-dom';
import { ExternalLink, RotateCcw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Sheet } from '../../../components/ui/Sheet';
import { jsonEqual } from '../../../data/changes';
import { SECTION_LABEL, type Sections } from '../../../data/content';
import { withBuiltIn } from '../../../content/defaults';
import { useContentFacts, useDefaultSection } from '../../../hooks/useSection';
import { useCatalog } from '../../../store/catalog';
import { formatDateTime } from '../../lib/contact';
import { save } from '../../lib/persist';
import { EditorProvider, type EditorApi } from './fields';
import { SECTION_FORMS } from './SectionForms';
import { pathKey, putSection, removeSection, setIn, validateSection, type Path } from './sectionDraft';
import { FOLLOWS_FACTS, SITE_SECTION_INFO, type SiteSectionId } from './siteSections';

/** "Editado em 24/11/2026, 14:05" or "Texto original". */
export function sectionState(stored: { updatedAt?: string | undefined } | undefined): string {
  if (!stored) return 'Texto original';
  const when = stored.updatedAt ? formatDateTime(stored.updatedAt) : '';
  return when ? `Editado em ${when}` : 'Editado';
}

/** Focuses the field of the first problem (or the closest field that holds it). */
function focusFirstError(root: HTMLElement | null, order: string[]) {
  if (!root) return;
  for (const key of order) {
    const parts = key.split('.');
    while (parts.length) {
      const el = root.querySelector<HTMLElement>(`[data-field="${parts.join('.')}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView?.({ block: 'center' });
        return;
      }
      parts.pop();
    }
  }
}

/**
 * Editor of one site section in a full-height sheet. The draft starts from
 * the saved section or the built-in text; "Salvar" validates with the
 * section's schema, saves through the catalog commit and shows success only
 * after the server confirmed; failures keep the draft and the message.
 */
export function SectionEditor({ id, onClose }: { id: SiteSectionId; onClose: () => void }) {
  type Data = Sections[typeof id];
  const label = SECTION_LABEL[id];
  const info = SITE_SECTION_INFO[id];
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const stored = useCatalog((s) => s.data.content?.[id]) as Data | undefined;
  const defaults = useDefaultSection(id) as Data;
  const facts = useContentFacts();
  /** The saved section, with fields added after she saved it taken from the built-in text. */
  const savedFull = useMemo(() => (stored ? withBuiltIn(id, stored, facts) : undefined), [id, stored, facts]) as Data | undefined;
  const [baseline, setBaseline] = useState<Data>(() => savedFull ?? defaults);
  const [draft, setDraft] = useState<Data>(baseline);
  /** The saved section as it was when the editor opened (or last saved here), to notice saves from another device. */
  const opened = useRef<Data | undefined>(stored);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [stale, setStale] = useState<Data | null>(null);
  const closing = useRef(false);
  const dirty = !jsonEqual(draft, baseline);

  // Saved elsewhere (or, for the built-in text, the store facts changed) while nothing was typed here: follow it.
  useEffect(() => {
    if (dirty || busy) return;
    const next = savedFull ?? defaults;
    if (jsonEqual(stored, opened.current) && jsonEqual(next, baseline)) return;
    opened.current = stored;
    setBaseline(next);
    setDraft(next);
  }, [stored, savedFull, defaults, baseline, dirty, busy]);

  // Leaving the panel or reloading with unsaved edits asks first.
  const blocker = useBlocker(() => dirty && !closing.current);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = useCallback((path: Path, value: unknown) => {
    setDraft((d) => setIn(d, path, value));
    const key = pathKey(path);
    setErrors((e) => {
      const stalePaths = Object.keys(e).filter((k) => k === key || k.startsWith(`${key}.`));
      if (!stalePaths.length) return e;
      const next = { ...e };
      for (const k of stalePaths) delete next[k];
      return next;
    });
    setFormError(null);
  }, []);

  const api = useMemo<EditorApi>(() => ({ id, draft, set, errors }), [id, draft, set, errors]);

  function close() {
    closing.current = true;
    onClose();
  }

  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else close();
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy || !dirty) return;
    const result = validateSection(id, draft);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(result.order.length === 1 ? 'Falta corrigir 1 campo, destacado abaixo.' : `Falta corrigir ${result.order.length} campos, destacados abaixo.`);
      requestAnimationFrame(() => focusFirstError(formRef.current, result.order));
      return;
    }
    setErrors({});
    setFormError(null);
    const current = useCatalog.getState().data.content?.[id];
    if (!jsonEqual(current, opened.current)) return setStale(result.data as Data);
    void write(result.data as Data);
  }

  async function write(data: Data) {
    setStale(null);
    setServerError(null);
    setBusy('Salvando…');
    const ok = await save((d) => putSection(d, id, data), `${label}: alterações salvas. O site já mostra a versão nova.`, {
      onProgress: setBusy,
      onError: (r) => {
        if (r.code !== 'unauthenticated') setServerError(r.conflict ? `${r.message} O que você escreveu continua aqui.` : r.message);
      },
    });
    setBusy(null);
    if (!ok) return;
    // Start over from what the server holds now (uploaded photos replaced their data URLs).
    const saved = (useCatalog.getState().data.content?.[id] as Data | undefined) ?? data;
    opened.current = saved;
    setBaseline(saved);
    setDraft(saved);
  }

  async function restore() {
    setConfirmRestore(false);
    if (busy) return;
    setServerError(null);
    setBusy('Restaurando…');
    const ok = await save((d) => removeSection(d, id), `${label}: o site voltou ao texto original.`, {
      onError: (r) => {
        if (r.code !== 'unauthenticated') setServerError(r.message);
      },
    });
    setBusy(null);
    if (!ok) return;
    opened.current = undefined;
    setBaseline(defaults);
    setDraft(defaults);
    setErrors({});
    setFormError(null);
  }

  const Form = SECTION_FORMS[id];

  return (
    <Sheet
      open
      side="right"
      className="md:w-[min(100vw,640px)]!"
      title={label}
      onClose={requestClose}
      footer={
        <div className="flex flex-col gap-2">
          {serverError && (
            <p role="alert" className="rounded-[10px] bg-danger-tint px-3 py-2 text-sm text-danger">
              {serverError}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            {!dirty && !busy && <p className="hidden text-sm text-ink-muted sm:block">Nenhuma alteração para salvar.</p>}
            <Button type="submit" form={formId} className="min-w-40 flex-1 sm:flex-none" disabled={!dirty || !!busy} aria-busy={!!busy}>
              {busy ?? 'Salvar'}
            </Button>
          </div>
        </div>
      }
    >
      <form id={formId} ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-5 pt-1">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">{info.description} O que você salvar aqui aparece no site para todo mundo na hora.</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] bg-champagne/60 px-3 py-1.5 text-sm">
            <span className="font-medium">{sectionState(stored)}</span>
            {info.href && (
              <a href={info.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-copper underline underline-offset-4">
                Ver no site <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">{' (abre em outra aba)'}</span>
              </a>
            )}
            {stored && (
              <button type="button" className="inline-flex min-h-11 items-center gap-1.5 text-copper underline underline-offset-4" onClick={() => setConfirmRestore(true)} disabled={!!busy}>
                <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" /> Restaurar o texto original
              </button>
            )}
          </div>
          {!stored && FOLLOWS_FACTS.has(id) && (
            <p className="text-sm text-ink-muted">Enquanto você não salvar, este texto se ajusta sozinho às informações da loja (garantia, envio, banho…). Depois de salvo, ele fica como você escreveu.</p>
          )}
          {formError && (
            <p role="alert" className="rounded-[10px] bg-danger-tint px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          )}
        </div>
        <EditorProvider value={api}>
          <Form />
        </EditorProvider>
      </form>

      <ConfirmDialog
        open={confirmRestore}
        title="Restaurar o texto original?"
        confirmLabel="Restaurar"
        tone="danger"
        onConfirm={() => void restore()}
        onCancel={() => setConfirmRestore(false)}
      >
        O site volta a mostrar o texto e as fotos originais de “{label}” para todo mundo. O que você escreveu aqui é apagado.
      </ConfirmDialog>
      <ConfirmDialog
        open={!!stale}
        title="Esta parte do site mudou em outro aparelho"
        confirmLabel="Salvar minha versão"
        cancelLabel="Voltar ao editor"
        onConfirm={() => void (stale && write(stale))}
        onCancel={() => setStale(null)}
      >
        Alguém salvou “{label}” em outro aparelho ou aba depois que você abriu este editor. Se salvar, a versão de lá é substituída pela daqui.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDiscard || blocker.state === 'blocked'}
        title="Descartar alterações?"
        confirmLabel="Descartar"
        tone="danger"
        cancelLabel="Continuar editando"
        onConfirm={() => {
          setConfirmDiscard(false);
          if (blocker.state === 'blocked') {
            closing.current = true;
            blocker.proceed();
          } else close();
        }}
        onCancel={() => {
          setConfirmDiscard(false);
          if (blocker.state === 'blocked') blocker.reset();
        }}
      >
        As alterações de “{label}” ainda não foram salvas.
      </ConfirmDialog>
    </Sheet>
  );
}
