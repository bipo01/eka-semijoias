import { useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Loader2, Star, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { Img } from '../../components/ui/Img';
import { cx } from '../../components/ui/cx';
import type { ProductImage } from '../../data/schema';
import { STORAGE_BUDGET_BYTES } from '../../data/storage';
import { productImageSources } from '../../lib/assets';
import { formatBytes } from '../../lib/format';
import { newId } from '../../lib/id';
import { processImage } from '../../lib/image';
import { toast } from '../../store/ui';
import { stringCost, useStorageUsage } from '../lib/persist';
import { move } from '../lib/reorder';
import { altFor, imageFinish, type DraftErrors, type ProductDraft } from './productDraft';

const MAX_PHOTOS = 20;
/** Typical storage cost of one uploaded photo + thumbnail (base64, UTF-16), for the "about N photos" hint. */
// A 180 KB photo plus its thumb measures ~560 KB in the meter (data URL as UTF-16).
const TYPICAL_PHOTO_COST = 560 * 1024;

export const photoCost = (img: ProductImage) => (img.src.startsWith('data:') ? stringCost(img.src) + stringCost(img.thumb) : 0);

interface PhotoManagerProps {
  draft: ProductDraft;
  /** Ids of photos already saved in the catalog (their cost is already counted). */
  savedImageIds: Set<string>;
  update: (fn: (d: ProductDraft) => ProductDraft) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  errors: DraftErrors;
}

const tileClass = 'relative aspect-[4/5] w-[88px] shrink-0 overflow-hidden rounded-[10px]';

function PickerLabel({ capture, onFiles, children, className }: { capture?: boolean; onFiles: (files: File[]) => void; children: React.ReactNode; className: string }) {
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow picking the same file again
    if (files.length) onFiles(files);
  }
  return (
    <label className={cx(className, 'cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-copper')}>
      <input type="file" accept="image/*" className="sr-only" multiple={!capture} {...(capture ? { capture: 'environment' as const } : {})} onChange={onChange} />
      {children}
    </label>
  );
}

export function PhotoManager({ draft, savedImageIds, update, selectedId, onSelect, errors }: PhotoManagerProps) {
  const [processing, setProcessing] = useState(0);
  const used = useStorageUsage();
  const pending = draft.images.filter((img) => !savedImageIds.has(img.id)).reduce((sum, img) => sum + photoCost(img), 0);
  const free = Math.max(0, STORAGE_BUDGET_BYTES - used - pending);
  const selectedIndex = draft.images.findIndex((img) => img.id === selectedId);
  const selected = draft.images[selectedIndex];

  async function addFiles(files: File[]) {
    const room = MAX_PHOTOS - draft.images.length - processing;
    if (room <= 0) {
      toast(`Cada peça pode ter até ${MAX_PHOTOS} fotos.`, { tone: 'error' });
      return;
    }
    const batch = files.slice(0, room);
    setProcessing((n) => n + batch.length);
    for (const file of batch) {
      const result = await processImage(file);
      setProcessing((n) => n - 1);
      if (!result.ok) {
        toast(`${file.name}: ${result.message}`, { tone: 'error' });
        continue;
      }
      const id = newId('img');
      update((d) => ({
        ...d,
        images: [...d.images, { id, src: result.src, thumb: result.thumb, alt: altFor(d.name, imageFinish(d, id)) }],
        autoAltIds: [...d.autoAltIds, id],
      }));
      onSelect(id);
    }
  }

  function remove(id: string) {
    update((d) => ({
      ...d,
      images: d.images.filter((img) => img.id !== id),
      autoAltIds: d.autoAltIds.filter((x) => x !== id),
      variants: d.variants.map((v) => ({ ...v, imageIds: v.imageIds.filter((x) => x !== id) })),
    }));
    if (selectedId === id) onSelect(null);
  }

  function reorder(from: number, to: number) {
    update((d) => ({ ...d, images: move(d.images, from, to) }));
  }

  function setAlt(id: string, alt: string) {
    update((d) => ({
      ...d,
      images: d.images.map((img) => (img.id === id ? { ...img, alt } : img)),
      autoAltIds: d.autoAltIds.filter((x) => x !== id),
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-1" aria-label="Fotos da peça">
        {draft.images.map((img, i) => {
          const hasError = !!errors[`alt:${img.id}`];
          return (
            <li key={img.id} className={tileClass}>
              <button
                type="button"
                aria-pressed={img.id === selectedId}
                aria-label={`${i === 0 ? 'Principal, foto 1' : `Foto ${i + 1}`}: ${img.alt || 'sem descrição'}`}
                onClick={() => onSelect(img.id)}
                className={cx(
                  'absolute inset-0 rounded-[10px] ring-offset-2 ring-offset-ivory',
                  img.id === selectedId ? 'ring-2 ring-copper' : hasError ? 'ring-2 ring-danger' : '',
                )}
              >
                <Img {...productImageSources(img, true)} alt="" ratio="4 / 5" frameClassName="h-full w-full" width={88} height={110} />
                {i === 0 && <span className="absolute bottom-1 left-1 rounded-full bg-ink/80 px-2 text-[0.75rem] leading-5 text-on-dark">Principal</span>}
              </button>
              <button
                type="button"
                aria-label={`Remover foto ${i + 1}`}
                onClick={() => remove(img.id)}
                className="absolute top-0 right-0 flex size-11 items-start justify-end p-1.5"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-white/90 text-ink shadow">
                  <X size={14} strokeWidth={2} />
                </span>
              </button>
            </li>
          );
        })}
        {Array.from({ length: processing }, (_, i) => (
          <li key={`processing-${i}`} className={cx(tileClass, 'flex flex-col items-center justify-center gap-1 bg-champagne text-sm text-ink-muted')}>
            <Loader2 size={20} strokeWidth={1.5} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Preparando
          </li>
        ))}
        {draft.images.length + processing < MAX_PHOTOS && (
          <li className={tileClass}>
            <PickerLabel onFiles={addFiles} className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-rose bg-white text-center text-sm text-ink">
              <ImagePlus size={22} strokeWidth={1.5} aria-hidden="true" />
              Adicionar foto
            </PickerLabel>
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <PickerLabel capture onFiles={addFiles} className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-medium text-copper">
          <Camera size={18} strokeWidth={1.5} aria-hidden="true" /> Tirar foto agora
        </PickerLabel>
        <p className="text-sm text-ink-muted">
          Espaço livre: {formatBytes(free)} (cerca de {Math.floor(free / TYPICAL_PHOTO_COST)} fotos)
        </p>
      </div>
      {draft.images.length === 0 && !processing && (
        <p className="text-sm text-ink-muted">Envie fotos em JPG ou PNG. A primeira foto é a principal. As fotos são reduzidas automaticamente para caber no espaço do navegador.</p>
      )}

      {selected && (
        <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-white p-3">
          <TextField
            label={`Descrição da foto ${selectedIndex + 1}`}
            required
            maxLength={200}
            value={selected.alt}
            onChange={(e) => setAlt(selected.id, e.target.value)}
            error={errors[`alt:${selected.id}`]}
            hint="Ex.: Brinco Gota em Rosé. Ajuda quem usa leitor de tela."
          />
          <div className="flex flex-wrap items-center gap-1">
            {selectedIndex > 0 && (
              <Button size="sm" variant="ghost" onClick={() => reorder(selectedIndex, 0)}>
                <Star size={16} strokeWidth={1.5} /> Tornar principal
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={selectedIndex === 0} onClick={() => reorder(selectedIndex, selectedIndex - 1)} aria-label="Mover foto para a esquerda">
              <ArrowLeft size={16} strokeWidth={1.5} /> Mover
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={selectedIndex === draft.images.length - 1}
              onClick={() => reorder(selectedIndex, selectedIndex + 1)}
              aria-label="Mover foto para a direita"
            >
              Mover <ArrowRight size={16} strokeWidth={1.5} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove(selected.id)}>
              <span className="inline-flex items-center gap-2 text-danger">
                <Trash2 size={16} strokeWidth={1.5} /> Remover
              </span>
            </Button>
          </div>
          <p className="text-sm text-ink-muted">{photoCost(selected) ? `Esta foto ocupa ${formatBytes(photoCost(selected))}.` : 'Foto incluída no site (não ocupa espaço do navegador).'}</p>
        </div>
      )}
    </div>
  );
}
