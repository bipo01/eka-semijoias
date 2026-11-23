import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SelectField, TextField } from '../../components/ui/Field';
import { Img } from '../../components/ui/Img';
import { Sheet } from '../../components/ui/Sheet';
import { categoryImage, sortedCategories } from '../../data/catalog';
import type { Catalog, Category } from '../../data/schema';
import { productImageSources } from '../../lib/assets';
import { newId } from '../../lib/id';
import { slugify, uniqueSlug } from '../../lib/slug';
import { useCatalog } from '../../store/catalog';
import { EmptyState, RowActions } from '../FormBits';
import { save } from '../lib/persist';
import { move } from '../lib/reorder';
import { PhotoPicker } from './PhotoPicker';

const withDenseOrder = (list: Category[]): Category[] => list.map((c, i) => ({ ...c, order: i }));

/** Removes a category, moving its products to `targetId`. */
export function deleteCategory(data: Catalog, id: string, targetId: string | null, now: string): Catalog {
  return {
    ...data,
    categories: withDenseOrder(sortedCategories(data).filter((c) => c.id !== id)),
    products: targetId ? data.products.map((p) => (p.categoryId === id ? { ...p, categoryId: targetId, updatedAt: now } : p)) : data.products,
  };
}

interface Editing {
  category: Category;
  isNew: boolean;
}

function CategoryEditor({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const data = useCatalog((s) => s.data);
  const [name, setName] = useState(editing.category.name);
  const [slug, setSlug] = useState(editing.category.slug);
  const [slugEdited, setSlugEdited] = useState(!editing.isNew);
  const [imageId, setImageId] = useState(editing.category.imageId);
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [busy, setBusy] = useState(false);
  const taken = data.categories.filter((c) => c.id !== editing.category.id).map((c) => c.slug);
  const effectiveSlug = slugEdited ? slugify(slug) : uniqueSlug(name, taken);
  const own = data.products.filter((p) => p.categoryId === editing.category.id).flatMap((p) => p.images);
  const images = own.length ? own : data.products.flatMap((p) => p.images.slice(0, 1));

  async function submit() {
    if (busy) return;
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Informe o nome da categoria.';
    if (!effectiveSlug) next.slug = 'Informe o endereço (letras, números e hífens).';
    else if (taken.includes(effectiveSlug)) next.slug = 'Já existe outra categoria com este endereço.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const category: Category = { id: editing.category.id, slug: effectiveSlug, name: name.trim(), order: editing.category.order, ...(imageId ? { imageId } : {}) };
    setBusy(true);
    const ok = await save(
      (d) => ({
        ...d,
        // Upsert: if another tab deleted it meanwhile, saving brings it back instead of silently doing nothing.
        categories: d.categories.some((c) => c.id === category.id)
          ? d.categories.map((c) => (c.id === category.id ? category : c))
          : [...d.categories, { ...category, order: d.categories.length }],
      }),
      editing.isNew ? 'Categoria criada.' : 'Categoria salva.',
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing.isNew ? 'Nova categoria' : 'Editar categoria'}
      className="md-center"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={busy} aria-busy={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <TextField label="Nome" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <TextField
          label="Endereço"
          required
          maxLength={80}
          value={slugEdited ? slug : effectiveSlug}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase());
            setSlugEdited(true);
          }}
          onBlur={() => slugEdited && setSlug(slugify(slug))}
          error={errors.slug}
          hint={`Aparece no link: …/catalogo/${effectiveSlug || 'nome'}`}
          autoCapitalize="none"
          spellCheck={false}
        />
        <PhotoPicker
          label="Foto da categoria"
          hint={own.length ? 'Fotos das peças desta categoria.' : 'Ainda não há peças nesta categoria; escolha qualquer foto.'}
          images={images}
          isSelected={(img) => img.id === imageId}
          onPick={(img) => setImageId(img.id)}
          noneLabel="Automática"
          noneSelected={!imageId}
          onNone={() => setImageId(undefined)}
        />
      </div>
    </Sheet>
  );
}

export function CategoriesPage() {
  const data = useCatalog((s) => s.data);
  const categories = sortedCategories(data);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [target, setTarget] = useState('');
  const count = (id: string) => data.products.filter((p) => p.categoryId === id).length;

  function reorder(from: number, to: number) {
    void save((d) => ({ ...d, categories: withDenseOrder(move(sortedCategories(d), from, to)) }));
  }

  function askDelete(c: Category) {
    setTarget(categories.find((x) => x.id !== c.id)?.id ?? '');
    setDeleting(c);
  }

  const deletingCount = deleting ? count(deleting.id) : 0;
  const others = deleting ? categories.filter((c) => c.id !== deleting.id) : [];
  const blocked = deletingCount > 0 && others.length === 0;

  async function confirmDelete() {
    if (!deleting || blocked) return setDeleting(null);
    const moveTo = deletingCount ? target : null;
    const targetName = others.find((c) => c.id === moveTo)?.name;
    const ok = await save(
      (d) => deleteCategory(d, deleting.id, moveTo, new Date().toISOString()),
      deletingCount && targetName ? `Categoria excluída. ${deletingCount === 1 ? 'A peça foi' : `As ${deletingCount} peças foram`} para ${targetName}.` : 'Categoria excluída.',
    );
    if (ok) setDeleting(null);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">A ordem aqui é a ordem do menu e da página inicial.</p>
        <Button size="sm" className="shrink-0" onClick={() => setEditing({ isNew: true, category: { id: newId('cat'), slug: '', name: '', order: categories.length } })}>
          <Plus size={18} strokeWidth={1.75} /> Nova categoria
        </Button>
      </div>

      {categories.length ? (
        <ul className="flex flex-col gap-2">
          {categories.map((c, i) => {
            const image = categoryImage(data, c);
            const n = count(c.id);
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-[12px] border border-line bg-white p-3">
                {image ? (
                  <Img {...productImageSources(image, true)} alt="" ratio="4 / 5" frameClassName="w-12 shrink-0 rounded-[8px]" width={48} height={60} />
                ) : (
                  <span className="aspect-[4/5] w-12 shrink-0 rounded-[8px] bg-champagne" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-sm text-ink-muted">{n === 1 ? '1 peça' : `${n} peças`}</p>
                </div>
                <RowActions
                  name={c.name}
                  index={i}
                  count={categories.length}
                  onMove={(to) => reorder(i, to)}
                  onEdit={() => setEditing({ isNew: false, category: c })}
                  onDelete={() => askDelete(c)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>Nenhuma categoria ainda. Crie a primeira para organizar as peças.</EmptyState>
      )}

      {editing && <CategoryEditor key={editing.category.id} editing={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!deleting}
        title={blocked ? 'Não dá para excluir ainda' : `Excluir ${deleting?.name ?? 'categoria'}?`}
        confirmLabel={blocked ? 'Entendi' : 'Excluir'}
        tone={blocked ? 'primary' : 'danger'}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      >
        {blocked ? (
          <p>Esta é a única categoria e ela tem peças. Crie outra categoria para receber as peças antes de excluir esta.</p>
        ) : deletingCount ? (
          <div className="flex flex-col gap-3">
            <p>{deletingCount === 1 ? 'Esta categoria tem 1 peça.' : `Esta categoria tem ${deletingCount} peças.`} Para qual categoria elas vão?</p>
            <SelectField label="Mover as peças para" value={target} onChange={(e) => setTarget(e.target.value)}>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>
        ) : (
          <p>A categoria não tem peças e sai do menu do site.</p>
        )}
      </ConfirmDialog>
    </>
  );
}
