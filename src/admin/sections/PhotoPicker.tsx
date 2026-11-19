import { useState, type ChangeEvent } from 'react';
import { Check, ImagePlus, Loader2 } from 'lucide-react';
import { Img } from '../../components/ui/Img';
import { cx } from '../../components/ui/cx';
import type { ProductImage } from '../../data/schema';
import { productImageSources } from '../../lib/assets';
import { processImage } from '../../lib/image';
import { toast } from '../../store/ui';

interface PhotoPickerProps {
  label: string;
  hint?: string;
  images: ProductImage[];
  isSelected: (img: ProductImage) => boolean;
  onPick: (img: ProductImage) => void;
  /** Label of the "no photo" option (e.g. automatic choice). */
  noneLabel: string;
  noneSelected: boolean;
  onNone: () => void;
  /** When set, offers uploading a new photo; receives the processed data URL. */
  onUpload?: (src: string) => void;
}

const tile = 'relative block w-[72px] shrink-0 overflow-hidden rounded-[8px] ring-offset-2 ring-offset-white';

/** Grid of product photos to choose from, plus an optional upload. */
export function PhotoPicker({ label, hint, images, isSelected, onPick, noneLabel, noneSelected, onNone, onUpload }: PhotoPickerProps) {
  const [busy, setBusy] = useState(false);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUpload) return;
    setBusy(true);
    const result = await processImage(file);
    setBusy(false);
    if (result.ok) onUpload(result.src);
    else toast(result.message, { tone: 'error' });
  }

  return (
    <div role="group" aria-label={label}>
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      <ul className="mt-2 flex max-h-[260px] flex-wrap gap-2 overflow-y-auto p-1">
        <li>
          <button
            type="button"
            aria-pressed={noneSelected}
            onClick={onNone}
            className={cx(tile, 'flex aspect-[4/5] items-center justify-center bg-champagne px-1 text-center text-[0.75rem] leading-tight', noneSelected && 'ring-2 ring-copper')}
          >
            {noneLabel}
          </button>
        </li>
        {onUpload && (
          <li>
            <label className={cx(tile, 'flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-rose text-center text-[0.75rem] focus-within:outline-2 focus-within:outline-copper')}>
              <input type="file" accept="image/*" className="sr-only" onChange={upload} disabled={busy} />
              {busy ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ImagePlus size={18} strokeWidth={1.5} aria-hidden="true" />}
              {busy ? 'Preparando' : 'Enviar foto'}
            </label>
          </li>
        )}
        {images.map((img) => {
          const on = isSelected(img);
          return (
            <li key={img.id}>
              <button type="button" aria-pressed={on} aria-label={img.alt || 'Foto sem descrição'} onClick={() => onPick(img)} className={cx(tile, on && 'ring-2 ring-copper')}>
                <Img {...productImageSources(img, true)} alt="" ratio="4 / 5" width={72} height={90} />
                {on && (
                  <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-copper text-white">
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
