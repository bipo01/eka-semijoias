import { useState } from 'react';
import { Check } from 'lucide-react';
import { TextField } from '../../components/ui/Field';
import { Img } from '../../components/ui/Img';
import { Chip, SwatchDot } from '../../components/ui/Misc';
import { cx } from '../../components/ui/cx';
import { FINISHES, FINISH_LABEL, type Finish } from '../../data/schema';
import { productImageSources } from '../../lib/assets';
import { SwitchRow } from '../FormBits';
import { newVariant, SIZE_PRESETS, type DraftErrors, type DraftVariant, type ProductDraft } from './productDraft';

interface VariantsEditorProps {
  draft: ProductDraft;
  update: (fn: (d: ProductDraft) => ProductDraft) => void;
  errors: DraftErrors;
}

export function VariantsEditor({ draft, update, errors }: VariantsEditorProps) {
  const [notice, setNotice] = useState<string | null>(null);

  function patchVariant(id: string, patch: Partial<DraftVariant>) {
    update((d) => ({ ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  }

  function toggleFinish(finish: Finish) {
    const existing = draft.variants.find((v) => v.finish === finish);
    if (existing && draft.variants.length === 1) {
      setNotice('A peça precisa de pelo menos um acabamento.');
      return;
    }
    setNotice(null);
    update((d) => ({
      ...d,
      variants: existing ? d.variants.filter((v) => v.id !== existing.id) : [...d.variants, newVariant(finish)],
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Acabamentos (cores disponíveis)" className="flex flex-wrap gap-2">
        {FINISHES.map((f) => {
          const on = draft.variants.some((v) => v.finish === f);
          return (
            <Chip key={f} selected={on} onClick={() => toggleFinish(f)}>
              {on ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : <SwatchDot finish={f} />}
              {FINISH_LABEL[f]}
            </Chip>
          );
        })}
      </div>
      {(notice || errors.variants) && (
        <p role="alert" className="text-sm text-danger">
          {notice ?? errors.variants}
        </p>
      )}

      {draft.variants.map((v) => (
        <fieldset key={v.id} className="flex flex-col gap-4 rounded-[12px] border border-line bg-white p-3">
          <legend className="flex items-center gap-2 px-1 font-medium">
            <SwatchDot finish={v.finish} size={14} /> {FINISH_LABEL[v.finish]}
          </legend>

          <div>
            <p className="text-sm font-medium" id={`photos-${v.id}`}>
              Fotos deste acabamento
            </p>
            {draft.images.length ? (
              <>
                <ul aria-labelledby={`photos-${v.id}`} className="no-scrollbar mt-1.5 flex gap-2 overflow-x-auto py-1">
                  {draft.images.map((img, i) => {
                    const on = v.imageIds.includes(img.id);
                    return (
                      <li key={img.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`Foto ${i + 1}: ${img.alt || 'sem descrição'}`}
                          onClick={() => patchVariant(v.id, { imageIds: on ? v.imageIds.filter((x) => x !== img.id) : [...v.imageIds, img.id] })}
                          className={cx('relative block w-14 overflow-hidden rounded-[8px] ring-offset-1', on ? 'ring-2 ring-copper' : 'opacity-70')}
                        >
                          <Img {...productImageSources(img, true)} alt="" ratio="4 / 5" width={56} height={70} />
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
                <p className="mt-1 text-sm text-ink-muted">
                  {v.imageIds.length ? 'Neste acabamento aparecem só as fotos marcadas.' : 'Nenhuma foto marcada: neste acabamento aparecem todas as fotos.'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">Envie fotos acima para escolher quais mostram este acabamento.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <TextField
              label="Tamanhos"
              optional
              placeholder="Ex.: 14, 16, 18"
              value={v.sizes}
              onChange={(e) => patchVariant(v.id, { sizes: e.target.value })}
              error={errors[`sizes:${v.id}`]}
              hint="Separe por vírgula. Deixe vazio se a peça não tem tamanho."
            />
            <div className="flex flex-wrap gap-2">
              {SIZE_PRESETS.map((preset) => (
                <Chip key={preset.label} selected={v.sizes === preset.value} onClick={() => patchVariant(v.id, { sizes: preset.value })}>
                  {preset.label}
                </Chip>
              ))}
            </div>
          </div>

          <TextField label="Código de referência" optional hint="Aparece como “Ref.” na página da peça. Pode ser o código do fornecedor ou um seu, ex.: EKA‑BR‑001." maxLength={40} value={v.sku} onChange={(e) => patchVariant(v.id, { sku: e.target.value })} />
          <SwitchRow label={`Disponível em ${FINISH_LABEL[v.finish]}`} checked={v.available} onChange={(available) => patchVariant(v.id, { available })} />
        </fieldset>
      ))}
    </div>
  );
}
