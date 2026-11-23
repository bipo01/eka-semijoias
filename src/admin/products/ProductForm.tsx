import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import { Copy, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SelectField, TextArea, TextField } from '../../components/ui/Field';
import { Chip } from '../../components/ui/Misc';
import { Sheet } from '../../components/ui/Sheet';
import { sortedCategories } from '../../data/catalog';
import { TAGS, type Catalog, type Product, type Tag } from '../../data/schema';
import { centsToInput, parseBRL } from '../../lib/format';
import { slugify, uniqueSlug } from '../../lib/slug';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { FormSection, SwitchRow } from '../FormBits';
import { adminPath } from '../lib/paths';
import { save } from '../lib/persist';
import { PhotoManager } from './PhotoManager';
import { VariantsEditor } from './VariantsEditor';
import {
  buildProduct,
  DETAIL_FIELDS,
  draftFromProduct,
  duplicateDraft,
  effectiveSlug,
  emptyDraft,
  takenSlugs,
  upsertProduct,
  withAutoAlts,
  type DraftErrors,
  type ProductDraft,
} from './productDraft';

export type FormSource = { kind: 'new' } | { kind: 'edit'; product: Product } | { kind: 'copy'; product: Product };

const TAG_LABEL: Record<Tag, string> = { novo: 'Novo', 'mais-vendido': 'Mais vendido' };

function initialDraft(source: FormSource): ProductDraft {
  const now = new Date().toISOString();
  if (source.kind === 'edit') return draftFromProduct(source.product);
  if (source.kind === 'copy') return duplicateDraft(source.product, now);
  return emptyDraft(useCatalog.getState().data, now);
}

/** Puts a deleted product back where it was (undo). */
export function restoreProduct(data: Catalog, product: Product, index: number): Catalog {
  if (data.products.some((p) => p.id === product.id)) return data;
  const categoryId = data.categories.some((c) => c.id === product.categoryId) ? product.categoryId : sortedCategories(data)[0]?.id;
  const restored: Product = {
    ...product,
    categoryId: categoryId ?? product.categoryId,
    slug: uniqueSlug(product.slug, data.products.map((p) => p.slug)),
    collectionIds: product.collectionIds.filter((id) => data.collections.some((c) => c.id === id)),
  };
  const products = [...data.products];
  products.splice(Math.min(index, products.length), 0, restored);
  return { ...data, products };
}

export function ProductForm({ source }: { source: FormSource }) {
  const navigate = useNavigate();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const data = useCatalog((s) => s.data);
  const [draft, setDraft] = useState(() => initialDraft(source));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [dirty, setDirty] = useState(source.kind === 'copy');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Set right before navigating away after a save/delete, so the unsaved-changes guard lets it through. */
  const leaving = useRef(false);
  const blocker = useBlocker(() => dirty && !leaving.current);
  /** Version of the product when the form opened, to detect saves from another tab. */
  const openedAt = useRef(source.kind === 'edit' ? source.product.updatedAt : null);
  const [conflict, setConflict] = useState<{ product: Product; then: 'close' | 'new'; deleted: boolean } | null>(null);
  /** Progress text while a save is in flight (photos uploading, saving); blocks double submits. */
  const [saving, setSaving] = useState<string | null>(null);

  // Reloading or closing the tab with unsaved edits asks the browser to confirm.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const categories = sortedCategories(data);
  const taken = useMemo(() => takenSlugs(data, draft.id), [data, draft.id]);
  const slug = effectiveSlug(draft, taken);

  const update = (fn: (d: ProductDraft) => ProductDraft) => {
    setDraft((d) => withAutoAlts(fn(d)));
    setDirty(true);
  };
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => update((d) => ({ ...d, [key]: value }));
  const clearError = (key: string) => {
    if (!errors[key]) return;
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  function leave(to: string) {
    leaving.current = true;
    navigate(to);
  }

  function submit(then: 'close' | 'new') {
    if (saving) return;
    const result = buildProduct(draft, useCatalog.getState().data, new Date().toISOString());
    if (!result.ok) {
      setErrors(result.errors);
      const altError = Object.keys(result.errors).find((k) => k.startsWith('alt:'));
      if (altError && Object.keys(result.errors).length === 1) setSelectedPhoto(altError.slice(4));
      toast(result.errors.form ?? 'Revise os campos destacados.', { tone: 'error' });
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    if (openedAt.current) {
      const stored = useCatalog.getState().data.products.find((p) => p.id === result.product.id);
      if (!stored || stored.updatedAt !== openedAt.current) return setConflict({ product: result.product, then, deleted: !stored });
    }
    void write(result.product, then);
  }

  async function write(product: Product, then: 'close' | 'new') {
    setConflict(null);
    setSaving('Salvando…');
    // On a failed write (offline, conflict) the form stays open with every edit.
    // The form does not edit the list position: keep the one stored now (it may have been reordered elsewhere).
    const ok = await save(
      (d) => upsertProduct(d, { ...product, order: d.products.find((p) => p.id === product.id)?.order ?? product.order }),
      draft.isNew ? 'Peça cadastrada.' : 'Alterações salvas.',
      { onProgress: setSaving },
    );
    setSaving(null);
    if (!ok) return;
    leave(then === 'new' ? adminPath('produtos', 'nova') : adminPath('produtos'));
  }

  async function remove() {
    setConfirmDelete(false);
    const current = useCatalog.getState().data;
    const index = current.products.findIndex((p) => p.id === draft.id);
    const removed = current.products[index];
    if (!removed) return leave(adminPath('produtos'));
    leaving.current = true;
    setSaving('Excluindo…');
    const ok = await save((d) => ({ ...d, products: d.products.filter((p) => p.id !== removed.id) }), {
      message: `“${removed.name}” foi excluída.`,
      action: { label: 'Desfazer', onClick: () => void save((d) => restoreProduct(d, removed, index), 'Peça restaurada.') },
    });
    setSaving(null);
    if (ok) navigate(adminPath('produtos'));
    else leaving.current = false;
  }

  const priceBlur = (key: 'price' | 'promo') => {
    const cents = parseBRL(draft[key]);
    if (cents != null && centsToInput(cents) !== draft[key]) set(key, centsToInput(cents));
  };

  return (
    <Sheet
      open
      side="full"
      title={draft.isNew ? (source.kind === 'copy' ? 'Nova peça (cópia)' : 'Nova peça') : 'Editar peça'}
      onClose={() => navigate(adminPath('produtos'))}
      footer={
        <div className="mx-auto flex max-w-[720px] items-center justify-between gap-3">
          {draft.isNew ? (
            <Button variant="ghost" onClick={() => navigate(adminPath('produtos'))}>
              Cancelar
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              <span className="text-danger">Excluir</span>
            </Button>
          )}
          <Button type="submit" form={formId} className="min-w-40 flex-1 sm:flex-none" disabled={saving != null} aria-busy={saving != null}>
            {saving ?? 'Salvar'}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        ref={formRef}
        noValidate
        className="mx-auto flex max-w-[720px] flex-col gap-5 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit('close');
        }}
      >
        <PhotoManager draft={draft} update={update} selectedId={selectedPhoto} onSelect={setSelectedPhoto} errors={errors} />

        <TextField
          label="Nome da peça"
          required
          maxLength={120}
          value={draft.name}
          onChange={(e) => {
            set('name', e.target.value);
            clearError('name');
          }}
          error={errors.name}
        />
        <TextField
          label="Endereço da peça"
          required
          maxLength={80}
          value={draft.slugEdited ? draft.slug : slug}
          onChange={(e) => {
            update((d) => ({ ...d, slug: e.target.value.toLowerCase(), slugEdited: true }));
            clearError('slug');
          }}
          onBlur={() => draft.slugEdited && set('slug', slugify(draft.slug))}
          error={errors.slug}
          hint={`Aparece no link: …/produto/${slug || 'nome-da-peca'}`}
          autoCapitalize="none"
          spellCheck={false}
        />
        {categories.length ? (
          <SelectField label="Categoria" required value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)} error={errors.categoryId}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <p role="alert" className="text-sm text-danger">
            Cadastre uma categoria antes de salvar a peça em{' '}
            <Link className="link-underline" to={adminPath('categorias')}>
              Categorias
            </Link>
            .
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Preço"
            required
            inputMode="decimal"
            placeholder="0,00"
            icon={<span className="text-sm">R$</span>}
            value={draft.price}
            onChange={(e) => {
              set('price', e.target.value);
              clearError('price');
            }}
            onBlur={() => priceBlur('price')}
            error={errors.price}
          />
          <TextField
            label="Preço promocional"
            hint="Opcional"
            inputMode="decimal"
            placeholder="0,00"
            icon={<span className="text-sm">R$</span>}
            value={draft.promo}
            onChange={(e) => {
              set('promo', e.target.value);
              clearError('promo');
            }}
            onBlur={() => priceBlur('promo')}
            error={errors.promo}
          />
        </div>

        <FormSection title="Acabamentos (cores disponíveis)">
          <VariantsEditor draft={draft} update={update} errors={errors} />
        </FormSection>

        <FormSection title="Descrição e detalhes">
          <TextArea label="Descrição" maxLength={4000} rows={4} value={draft.description} onChange={(e) => set('description', e.target.value)} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DETAIL_FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                optional
                maxLength={f.max}
                placeholder={f.placeholder}
                value={draft.details[f.key]}
                onChange={(e) => update((d) => ({ ...d, details: { ...d.details, [f.key]: e.target.value } }))}
              />
            ))}
          </div>
        </FormSection>

        <FormSection title="Exibição">
          <div role="group" aria-label="Etiquetas" className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium">Etiquetas</span>
            {TAGS.map((t) => {
              const on = draft.tags.includes(t);
              return (
                <Chip key={t} selected={on} onClick={() => set('tags', on ? draft.tags.filter((x) => x !== t) : [...draft.tags, t])}>
                  {TAG_LABEL[t]}
                </Chip>
              );
            })}
          </div>
          <SwitchRow label="Disponível no catálogo" hint="Desligado, a peça aparece como esgotada." checked={draft.available} onChange={(v) => set('available', v)} />
          <SwitchRow label="Destaque na home" checked={draft.featured} onChange={(v) => set('featured', v)} />
        </FormSection>

        <FormSection title="Mais ações">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => submit('new')}>
              <Plus size={18} strokeWidth={1.5} /> Salvar e cadastrar outra
            </Button>
            {source.kind === 'edit' && (
              <Button variant="secondary" onClick={() => navigate(`${adminPath('produtos', 'nova')}?copiar=${encodeURIComponent(draft.id)}`)}>
                <Copy size={18} strokeWidth={1.5} /> Duplicar peça
              </Button>
            )}
          </div>
          {errors.form && (
            <p role="alert" className="text-sm text-danger">
              {errors.form}
            </p>
          )}
        </FormSection>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir esta peça?"
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      >
        “{draft.name || 'Esta peça'}” sai do catálogo. Logo depois você ainda pode desfazer.
      </ConfirmDialog>
      <ConfirmDialog
        open={!!conflict}
        title={conflict?.deleted ? 'Esta peça foi excluída em outro aparelho' : 'Esta peça mudou em outro aparelho'}
        confirmLabel={conflict?.deleted ? 'Salvar como peça' : 'Salvar minha versão'}
        cancelLabel="Voltar ao formulário"
        onConfirm={() => void (conflict && write(conflict.product, conflict.then))}
        onCancel={() => setConflict(null)}
      >
        {conflict?.deleted
          ? 'Se você salvar, a peça volta para o catálogo com as informações deste formulário.'
          : 'Ela foi salva em outro aparelho ou aba depois que você abriu este formulário. Se salvar, as alterações feitas lá serão substituídas pelas daqui.'}
      </ConfirmDialog>
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Descartar alterações?"
        confirmLabel="Descartar"
        tone="danger"
        cancelLabel="Continuar editando"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        As alterações desta peça ainda não foram salvas.
      </ConfirmDialog>
    </Sheet>
  );
}
