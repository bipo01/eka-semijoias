import { useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Loader2, Sparkles, Star, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { Img } from '../../components/ui/Img';
import { cx } from '../../components/ui/cx';
import { productImageSources } from '../../lib/assets';
import { newId } from '../../lib/id';
import { processImage } from '../../lib/image';
import { toast } from '../../store/ui';
import { move } from '../lib/reorder';
import { altFor, imageFinish, type DraftErrors, type ProductDraft } from './productDraft';
import { photoBlob } from './standardize/photoSource';
import { StandInTag } from './StandInPhotos';
import StandardizeSheet, { type StandardizedPhoto } from './standardize/StandardizeSheet';

const MAX_PHOTOS = 20;

interface PhotoManagerProps {
  draft: ProductDraft;
  update: (fn: (d: ProductDraft) => ProductDraft) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  errors: DraftErrors;
}

const tileClass = 'relative aspect-[4/5] w-[88px] shrink-0 overflow-hidden rounded-[10px]';
/** Add/preparing tiles: as tall as a photo, at least as wide, and wider when the text needs it (keeps the padding). */
const actionTileClass = 'relative h-[110px] min-w-[88px] shrink-0 rounded-[10px]';

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

export function PhotoManager({ draft, update, selectedId, onSelect, errors }: PhotoManagerProps) {
  const [processing, setProcessing] = useState(0);
  const [standardize, setStandardize] = useState<{ id: string; source: Blob } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  /** Files picked in this session, by photo id: the standardizer starts from full resolution, even after a first pass. */
  const originals = useRef(new Map<string, File>());
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
      originals.current.set(id, file);
      update((d) => ({
        ...d,
        images: [...d.images, { id, src: result.src, thumb: result.thumb, alt: altFor(d.name, imageFinish(d, id)) }],
        autoAltIds: [...d.autoAltIds, id],
      }));
      onSelect(id);
    }
  }

  /** Removes a photo and offers to undo it: a tap in the wrong place must never cost a photo. */
  function remove(id: string) {
    const index = draft.images.findIndex((img) => img.id === id);
    const image = draft.images[index];
    if (!image) return;
    const autoAlt = draft.autoAltIds.includes(id);
    const linked = new Map(draft.variants.filter((v) => v.imageIds.includes(id)).map((v) => [v.id, v.imageIds.indexOf(id)]));
    const original = originals.current.get(id);
    originals.current.delete(id);
    update((d) => ({
      ...d,
      images: d.images.filter((img) => img.id !== id),
      autoAltIds: d.autoAltIds.filter((x) => x !== id),
      variants: d.variants.map((v) => ({ ...v, imageIds: v.imageIds.filter((x) => x !== id) })),
    }));
    if (selectedId === id) onSelect(null);
    toast(`Foto ${index + 1} removida.`, {
      action: {
        label: 'Desfazer',
        onClick: () => {
          if (original) originals.current.set(id, original);
          update((d) => {
            if (d.images.some((img) => img.id === id)) return d;
            const images = [...d.images];
            images.splice(Math.min(index, images.length), 0, image);
            return {
              ...d,
              images,
              autoAltIds: autoAlt ? [...d.autoAltIds, id] : d.autoAltIds,
              // Back in the finishes it was marked in, at the same place.
              variants: d.variants.map((v) => {
                const at = linked.get(v.id);
                if (at === undefined || v.imageIds.includes(id)) return v;
                const ids = [...v.imageIds];
                ids.splice(Math.min(at, ids.length), 0, id);
                return { ...v, imageIds: ids };
              }),
            };
          });
          onSelect(id);
        },
      },
      duration: 8000,
    });
  }

  async function openStandardizer(id: string) {
    const image = draft.images.find((img) => img.id === id);
    if (!image || opening) return;
    setOpening(id);
    try {
      const source = await photoBlob(image, originals.current.get(id));
      setStandardize({ id, source });
    } catch {
      toast('Não deu para abrir esta foto para padronizar. Confira a internet e tente de novo.', { tone: 'error' });
    } finally {
      setOpening(null);
    }
  }

  function applyStandardized(id: string, photo: StandardizedPhoto) {
    update((d) => ({ ...d, images: d.images.map((img) => (img.id === id ? { ...img, src: photo.src, thumb: photo.thumb } : img)) }));
    setStandardize(null);
    toast('Foto padronizada. Ela vai ser enviada quando você salvar a peça.', { tone: 'success' });
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

  const standIns = draft.images.filter((img) => img.placeholder).length;

  return (
    <div className="flex flex-col gap-3">
      {standIns > 0 && (
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-[#ecd6b4] bg-warning-tint/70 p-3.5 text-sm leading-snug">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-warning shadow-[0_1px_4px_rgb(138_90_18/0.18)]">
            <Camera size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <p className="min-w-0 text-ink">
            <span className="block font-medium">{standIns === 1 ? 'Esta peça está com uma foto provisória.' : `Esta peça está com ${standIns} fotos provisórias.`}</span>
            <span className="mt-0.5 block text-ink-muted">
              Adicione fotos reais desta peça e remova as marcadas como <span className="font-medium text-warning">Provisória</span> (no ×). Depois, toque em Salvar.
            </span>
          </p>
        </div>
      )}
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0" aria-label="Fotos da peça">
        {draft.images.map((img, i) => {
          const hasError = !!errors[`alt:${img.id}`];
          return (
            // The ring sits on the tile itself: on the photo button it was cut by the tile's rounded
            // clipping, so the selected photo looked like the others. The list's 4 px padding fits it.
            <li
              key={img.id}
              className={cx(tileClass, 'ring-offset-2 ring-offset-ivory', img.id === selectedId ? 'ring-2 ring-copper' : hasError ? 'ring-2 ring-danger' : '')}
            >
              <button
                type="button"
                aria-pressed={img.id === selectedId}
                // The name starts with what the tile shows ("Principal", "Provisória"), in that order.
                aria-label={`${i === 0 ? `Principal${img.placeholder ? ', provisória' : ''}, foto 1` : `${img.placeholder ? 'Provisória, foto' : 'Foto'} ${i + 1}`}: ${img.alt || 'sem descrição'}`}
                onClick={() => onSelect(img.id)}
                className="absolute inset-0 rounded-[10px]"
              >
                <Img {...productImageSources(img, true)} alt="" ratio="4 / 5" frameClassName="h-full w-full" width={88} height={110} />
                {i === 0 && <span className={cx('absolute left-1 rounded-full bg-ink/80 px-2 text-[0.75rem] leading-5 text-on-dark', img.placeholder ? 'bottom-[26px]' : 'bottom-1')}>Principal</span>}
                {/* Bottom strip, clear of the remove button; "Principal" moves up above it. The space keeps the
                    two words apart in the button's text ("Principal Provisória"). */}
                {img.placeholder && (
                  <>
                    {' '}
                    <StandInTag className="absolute inset-x-1 bottom-1 text-center" />
                  </>
                )}
              </button>
              {/* The remove target is the visible circle plus a small margin (32 px, above the 24 px
                  minimum): a bigger one covered half the tile, and a tap meant to pick the photo
                  removed it on the phone. Removing can be undone anyway. */}
              <button
                type="button"
                aria-label={`Remover foto ${i + 1}`}
                onClick={() => remove(img.id)}
                className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-white/90 text-ink shadow">
                  <X size={14} strokeWidth={2} />
                </span>
              </button>
            </li>
          );
        })}
        {Array.from({ length: processing }, (_, i) => (
          <li key={`processing-${i}`} className={cx(actionTileClass, 'flex flex-col items-center justify-center gap-1.5 bg-champagne px-3.5 text-center text-sm leading-tight text-ink-muted')}>
            <Loader2 size={20} strokeWidth={1.5} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Preparando
          </li>
        ))}
        {draft.images.length + processing < MAX_PHOTOS && (
          <li className={actionTileClass}>
            <PickerLabel onFiles={addFiles} className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-rose bg-white px-3.5 py-3 text-center text-sm leading-tight text-ink">
              <ImagePlus size={22} strokeWidth={1.5} aria-hidden="true" />
              {/* One word per line: the tile widens with a larger system font instead of crowding its border. */}
              <span className="block">Adicionar</span> <span className="block">foto</span>
            </PickerLabel>
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <PickerLabel capture onFiles={addFiles} className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-medium text-copper">
          <Camera size={18} strokeWidth={1.5} aria-hidden="true" /> Tirar foto agora
        </PickerLabel>
      </div>
      {draft.images.length === 0 && !processing && (
        <p className="text-sm text-ink-muted">Envie fotos em JPG ou PNG. A primeira foto é a principal. As fotos são otimizadas automaticamente e enviadas ao salvar.</p>
      )}

      {selected && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-3">
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
            <Button size="sm" variant="secondary" className="mr-1" onClick={() => openStandardizer(selected.id)} disabled={opening != null} aria-busy={opening === selected.id}>
              {opening === selected.id ? (
                <Loader2 size={16} strokeWidth={1.5} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" />
              )}
              Padronizar
            </Button>
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
          {selected.src.startsWith('data:') && <p className="text-sm text-ink-muted">Foto nova: vai ser enviada quando você salvar a peça.</p>}
        </div>
      )}

      {standardize && (
        <StandardizeSheet
          source={standardize.source}
          onApply={(photo) => applyStandardized(standardize.id, photo)}
          onClose={() => setStandardize(null)}
        />
      )}
    </div>
  );
}
