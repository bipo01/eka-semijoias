import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TextArea, TextField } from '../../components/ui/Field';
import { Img } from '../../components/ui/Img';
import { Sheet } from '../../components/ui/Sheet';
import type { Catalog, Collection } from '../../data/schema';
import { imageSources } from '../../lib/assets';
import { newId } from '../../lib/id';
import { slugify, uniqueSlug } from '../../lib/slug';
import { useCatalog } from '../../store/catalog';
import { EmptyState, RowActions, SwitchRow } from '../FormBits';
import { save } from '../lib/persist';
import { move } from '../lib/reorder';
import { PhotoPicker } from './PhotoPicker';

export function sortedCollections(data: Catalog): Collection[] {
  return data.collections.map((c, i) => ({ c, key: c.order ?? i })).sort((a, b) => a.key - b.key).map(({ c }) => c);
}

const withDenseOrder = (list: Collection[]): Collection[] => list.map((c, i) => ({ ...c, order: i }));

/** Saves a collection; only one collection can be featured on the home page. */
export function upsertCollection(data: Catalog, collection: Collection): Catalog {
  const exists = data.collections.some((c) => c.id === collection.id);
  const list = exists ? data.collections.map((c) => (c.id === collection.id ? collection : c)) : [...data.collections, collection];
  return { ...data, collections: collection.featuredOnHome ? list.map((c) => (c.id === collection.id ? c : { ...c, featuredOnHome: false })) : list };
}

/** Removes a collection and drops its id from every product. */
export function deleteCollection(data: Catalog, id: string, now: string): Catalog {
  return {
    ...data,
    collections: withDenseOrder(sortedCollections(data).filter((c) => c.id !== id)),
    products: data.products.map((p) => (p.collectionIds.includes(id) ? { ...p, collectionIds: p.collectionIds.filter((x) => x !== id), updatedAt: now } : p)),
  };
}

interface Editing {
  collection: Collection;
  isNew: boolean;
}

function CollectionEditor({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const data = useCatalog((s) => s.data);
  const [form, setForm] = useState(editing.collection);
  const [slugEdited, setSlugEdited] = useState(!editing.isNew);
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [busy, setBusy] = useState(false);
  const taken = data.collections.filter((c) => c.id !== form.id).map((c) => c.slug);
  const slug = slugEdited ? slugify(form.slug) : uniqueSlug(form.name, taken);
  const productPhotos = data.products.flatMap((p) => p.images.slice(0, 2));
  const heroIsUpload = !!form.heroImage && !productPhotos.some((img) => img.src === form.heroImage);
  const patch = (p: Partial<Collection>) => setForm((f) => ({ ...f, ...p }));

  async function submit() {
    if (busy) return;
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Informe o nome da coleção.';
    if (!slug) next.slug = 'Informe o endereço (letras, números e hífens).';
    else if (taken.includes(slug)) next.slug = 'Já existe outra coleção com este endereço.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const description = form.description?.trim();
    const collection: Collection = {
      id: form.id,
      name: form.name.trim(),
      slug,
      featuredOnHome: form.featuredOnHome,
      ...(description ? { description } : {}),
      ...(form.heroImage ? { heroImage: form.heroImage } : {}),
      order: editing.isNew ? data.collections.length : form.order,
    };
    setBusy(true);
    const ok = await save((d) => upsertCollection(d, collection), editing.isNew ? 'Coleção criada.' : 'Coleção salva.');
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing.isNew ? 'Nova coleção' : 'Editar coleção'}
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
        <TextField label="Nome" required maxLength={80} value={form.name} onChange={(e) => patch({ name: e.target.value })} error={errors.name} />
        <TextField
          label="Endereço"
          required
          maxLength={80}
          value={slugEdited ? form.slug : slug}
          onChange={(e) => {
            patch({ slug: e.target.value.toLowerCase() });
            setSlugEdited(true);
          }}
          onBlur={() => slugEdited && patch({ slug: slugify(form.slug) })}
          error={errors.slug}
          hint={`Aparece no link: …/colecao/${slug || 'nome'}`}
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextArea label="Descrição" optional maxLength={600} rows={3} value={form.description ?? ''} onChange={(e) => patch({ description: e.target.value })} />
        <SwitchRow
          label="Mostrar na página inicial"
          hint="Só uma coleção aparece na home por vez."
          checked={form.featuredOnHome}
          onChange={(featuredOnHome) => patch({ featuredOnHome })}
        />
        {heroIsUpload && form.heroImage && (
          <div>
            <p className="mb-2 text-sm font-medium">Foto de capa atual</p>
            <Img {...imageSources(form.heroImage)} alt="" ratio="4 / 5" frameClassName="w-24 rounded-[8px]" width={96} height={120} />
          </div>
        )}
        <PhotoPicker
          label="Foto de capa"
          hint="Escolha uma foto das peças ou envie uma nova."
          images={productPhotos}
          isSelected={(img) => img.src === form.heroImage}
          onPick={(img) => patch({ heroImage: img.src })}
          noneLabel="Sem foto"
          noneSelected={!form.heroImage}
          onNone={() => patch({ heroImage: undefined })}
          onUpload={(src) => patch({ heroImage: src })}
        />
      </div>
    </Sheet>
  );
}

export function CollectionsPage() {
  const data = useCatalog((s) => s.data);
  const collections = sortedCollections(data);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);
  const count = (id: string) => data.products.filter((p) => p.collectionIds.includes(id)).length;

  function reorder(from: number, to: number) {
    void save((d) => ({ ...d, collections: withDenseOrder(move(sortedCollections(d), from, to)) }));
  }

  async function confirmDelete() {
    if (!deleting) return;
    if (await save((d) => deleteCollection(d, deleting.id, new Date().toISOString()), 'Coleção excluída.')) setDeleting(null);
  }

  const deletingCount = deleting ? count(deleting.id) : 0;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Escolha as peças de cada coleção no cadastro da peça.</p>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => setEditing({ isNew: true, collection: { id: newId('col'), slug: '', name: '', featuredOnHome: false, order: collections.length } })}
        >
          <Plus size={18} strokeWidth={1.75} /> Nova coleção
        </Button>
      </div>

      {collections.length ? (
        <ul className="flex flex-col gap-2">
          {collections.map((c, i) => {
            const n = count(c.id);
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-[12px] border border-line bg-white p-3">
                {c.heroImage ? (
                  <Img {...imageSources(c.heroImage, { small: true })} alt="" ratio="4 / 5" frameClassName="w-12 shrink-0 rounded-[8px]" width={48} height={60} />
                ) : (
                  <span className="aspect-[4/5] w-12 shrink-0 rounded-[8px] bg-champagne" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-sm text-ink-muted">
                    {n === 1 ? '1 peça' : `${n} peças`}
                    {c.featuredOnHome && ' · Na página inicial'}
                  </p>
                </div>
                <RowActions
                  name={c.name}
                  index={i}
                  count={collections.length}
                  onMove={(to) => reorder(i, to)}
                  onEdit={() => setEditing({ isNew: false, collection: c })}
                  onDelete={() => setDeleting(c)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>Nenhuma coleção ainda. Coleções agrupam peças por tema, como “Para presentear”.</EmptyState>
      )}

      {editing && <CollectionEditor key={editing.collection.id} editing={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!deleting}
        title={`Excluir ${deleting?.name ?? 'coleção'}?`}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      >
        {deletingCount
          ? `${deletingCount === 1 ? 'A peça desta coleção continua' : `As ${deletingCount} peças desta coleção continuam`} no catálogo; só saem da coleção.`
          : 'A coleção não tem peças.'}
      </ConfirmDialog>
    </>
  );
}
