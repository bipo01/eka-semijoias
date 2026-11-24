import { useId, useState, type ChangeEvent } from 'react';
import { ImagePlus, Images, Loader2, Trash2 } from 'lucide-react';
import { Button, buttonClass } from '../../../components/ui/Button';
import { TextField } from '../../../components/ui/Field';
import { Img } from '../../../components/ui/Img';
import { cx } from '../../../components/ui/cx';
import type { ContentImage } from '../../../data/content';
import { bannerSources, imageSources, type ImageSources } from '../../../lib/assets';
import { processImage, type ImageProfile } from '../../../lib/image';
import { toast } from '../../../store/ui';
import { useEditor } from './fields';
import { ProductPhotoChooser } from './ProductPhotoChooser';
import { getIn, isNullable, pathKey, textLimit, overLimit, type Path } from './sectionDraft';

/** Preview sources of a site image (built-in stems get their real widths; uploads use the thumb when small). */
export function contentImagePreview(img: ContentImage, wide: boolean): ImageSources {
  if (img.src.startsWith('images/')) return wide ? bannerSources(img.src) : imageSources(img.src);
  return imageSources(img.src, { thumb: img.thumb, small: !wide });
}

/** Reads a picked file through the photo pipeline (same as the product photos; `wide` for banners). */
export async function photoFromFile(file: File, profile: ImageProfile): Promise<{ ok: true; src: string; thumb: string } | { ok: false; message: string }> {
  const result = await processImage(file, { profile });
  return result.ok ? { ok: true, src: result.src, thumb: result.thumb } : { ok: false, message: result.message };
}

interface ImageFieldProps {
  label: string;
  hint?: string;
  value: ContentImage | null;
  onChange: (image: ContentImage | null) => void;
  /** Banner: uploads keep a 1600 px long side. */
  wide?: boolean;
  /** "Remover" only where the site works without a photo. */
  allowRemove?: boolean;
  /** What the site shows without a photo. */
  emptyText?: string;
  /** Aspect ratio of the preview. */
  ratio?: string;
  error?: string | undefined;
  altError?: string | undefined;
  altMax?: number;
  /** Field key, for focusing an error. */
  fieldKey?: string;
}

/** Site image: preview, description, upload, pick from the product photos and (when allowed) remove. */
export function ImageField({ label, hint, value, onChange, wide = false, allowRemove = false, emptyText, ratio, error, altError, altMax = 200, fieldKey }: ImageFieldProps) {
  const uid = useId();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const alt = value?.alt ?? '';

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setBusy(true);
    const result = await photoFromFile(file, wide ? 'wide' : 'product');
    setBusy(false);
    if (!result.ok) return void toast(result.message, { tone: 'error' });
    // A new photo: the old description would describe another picture.
    onChange({ src: result.src, thumb: result.thumb, alt: '' });
    toast('Foto pronta. Descreva o que aparece nela e salve para ir ao site.', { tone: 'success' });
  }

  return (
    <div role="group" aria-labelledby={`${uid}-label`} className="flex flex-col gap-3">
      <div>
        <p id={`${uid}-label`} className="text-sm font-medium">
          {label}
        </p>
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      </div>
      <div className={cx('overflow-hidden rounded-[12px] border border-line', wide ? 'max-w-[420px]' : 'max-w-[200px]')}>
        {value ? (
          <Img {...contentImagePreview(value, wide)} alt={value.alt || 'Foto sem descrição'} ratio={ratio ?? (wide ? '16 / 9' : '4 / 5')} />
        ) : (
          <div className="flex items-center justify-center bg-champagne px-4 text-center text-sm text-ink-muted" style={{ aspectRatio: ratio ?? (wide ? '16 / 9' : '4 / 5') }}>
            {emptyText ?? 'Sem foto'}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label
          className={cx(
            buttonClass('secondary', 'sm'),
            'cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-copper',
            busy && 'pointer-events-none opacity-50',
          )}
          aria-busy={busy || undefined}
        >
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={upload}
            disabled={busy}
            data-field={fieldKey}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${uid}-error` : undefined}
          />
          {busy ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ImagePlus size={16} strokeWidth={1.5} aria-hidden="true" />}
          {busy ? 'Preparando foto…' : value ? 'Enviar outra foto' : 'Enviar foto'}
        </label>
        <Button variant="secondary" size="sm" onClick={() => setChoosing(true)} disabled={busy}>
          <Images size={16} strokeWidth={1.5} aria-hidden="true" /> Escolher das fotos das peças
        </Button>
        {allowRemove && value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)} disabled={busy}>
            <Trash2 size={16} strokeWidth={1.5} className="text-danger" aria-hidden="true" /> Remover
          </Button>
        )}
      </div>
      {error && (
        <p id={`${uid}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {value && (
        <TextField
          label="Descrição da foto"
          optional
          value={alt}
          error={altError ?? overLimit(alt, altMax)}
          hint={`Conte o que aparece na foto. Ajuda quem usa leitor de tela. ${alt.trim().length}/${altMax}`}
          data-field={fieldKey ? `${fieldKey}.alt` : undefined}
          onChange={(e) => onChange({ ...value, alt: e.target.value })}
        />
      )}
      <ProductPhotoChooser
        open={choosing}
        onClose={() => setChoosing(false)}
        onPick={(img) => {
          setChoosing(false);
          onChange({ src: img.src, ...(img.thumb ? { thumb: img.thumb } : {}), alt: img.alt });
        }}
      />
    </div>
  );
}

/** An image of the section draft; "Remover" exists only where the schema allows no photo. */
export function ImageInput({ path, label, hint, wide, emptyText, ratio }: { path: Path; label: string; hint?: string; wide?: boolean; emptyText?: string; ratio?: string }) {
  const { id, draft, set, errors } = useEditor();
  const key = pathKey(path);
  const value = (getIn(draft, path) as ContentImage | null | undefined) ?? null;
  // Any problem inside the image (its source) shows on the field; the description has its own.
  const error = Object.entries(errors).find(([k]) => (k === key || k.startsWith(`${key}.`)) && k !== `${key}.alt`)?.[1];
  return (
    <ImageField
      label={label}
      {...(hint ? { hint } : {})}
      {...(emptyText ? { emptyText } : {})}
      {...(ratio ? { ratio } : {})}
      wide={!!wide}
      allowRemove={isNullable(id, path)}
      value={value}
      onChange={(img) => set(path, img)}
      error={error}
      altError={errors[`${key}.alt`]}
      altMax={textLimit(id, [...path, 'alt']) || 200}
      fieldKey={key}
    />
  );
}
