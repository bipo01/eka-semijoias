import { forwardRef, useId } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ImagePlus, LayoutGrid, Save, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import type { Product } from '../../data/schema';
import { asset, productImageSources } from '../../lib/assets';
import { adminPath } from '../lib/paths';
import { useSetupStatus } from '../SetupProgress';
import { CARD } from '../ui';

/*
 * Produtos → the stand-in photos. The catalog starts with stand-in pictures (so the site is never
 * empty); the owner has to replace them with photos of her own pieces. The card says so plainly,
 * shows how far she is and, with "Trocar as fotos", narrows the list to the pieces still on a
 * stand-in, under a banner with the steps (StandInBanner): a change she can see, not just a URL.
 */

/**
 * The list's "only stand-in photos" filter, to carry into a piece and back: after saving one she
 * lands on the pieces still to fix, not on the whole catalog.
 */
export function standInSearch(search: string): string {
  return new URLSearchParams(search).get('fotos') === 'provisorias' ? '?fotos=provisorias' : '';
}

/** A small "Provisória" tag for a stand-in photo (list thumbnails, photo tiles). */
export function StandInTag({ className }: { className?: string }) {
  return (
    <span className={cx('pointer-events-none rounded-full bg-warning-tint/95 px-1.5 text-[0.6875rem] leading-[18px] font-medium text-warning shadow-[0_1px_3px_rgb(48_33_28/0.18)]', className)}>
      Provisória
    </span>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function StandInPhotosCard({ standIn, total, active, onShow }: { standIn: Product[]; total: number; active: boolean; onShow: () => void }) {
  const titleId = useId();
  const status = useSetupStatus();
  const real = total - standIn.length;
  const own = status.areas.find((a) => a.id === 'produtos');
  const missing = own ? own.total - own.done : 1;
  const shown = standIn.slice(0, 4);
  const more = standIn.length - shown.length;

  return (
    <section aria-labelledby={titleId} className={cx(CARD, 'relative overflow-hidden')}>
      {/* A soft champagne wash behind the illustration, as on the brand's other spot cards. */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-[radial-gradient(closest-side,#f3e6dc,transparent)]" />
      <div className="relative p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-[0.6875rem] text-ink-muted">Nesta área · {missing === 1 ? 'falta 1 item' : `faltam ${missing} itens`}</p>
            <h2 id={titleId} className="mt-1 font-display text-[1.5rem] leading-[1.15] font-semibold text-ink">
              Coloque as fotos reais das suas peças
            </h2>
          </div>
          <img
            src={asset('images/illustrations/fotografe-suas-pecas-320.webp')}
            srcSet={`${asset('images/illustrations/fotografe-suas-pecas-320.webp')} 320w, ${asset('images/illustrations/fotografe-suas-pecas-640.webp')} 640w`}
            sizes="96px"
            alt=""
            width={96}
            height={96}
            className="-mt-1 -mr-1 size-24 shrink-0"
            decoding="async"
          />
        </div>

        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink">
          As fotos de agora são <strong className="font-medium text-warning">provisórias</strong>: estão aqui só para o site não ficar vazio.
        </p>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
          Quem compra quer ver a peça que vai receber. Fotografe as suas e troque, peça por peça.
        </p>

        <div className="mt-4 flex items-center gap-3">
          {/* The pieces still waiting, as a small fanned stack. */}
          <ul aria-hidden="true" className="flex shrink-0 -space-x-3">
            {shown.map((p, i) => {
              const image = p.images[0];
              return (
                <li key={p.id} className="relative size-11 overflow-hidden rounded-full border-2 border-white bg-champagne shadow-[0_2px_6px_rgb(48_33_28/0.16)]" style={{ zIndex: shown.length - i }}>
                  {image && <img src={productImageSources(image, true).src} alt="" className="size-full object-cover" loading="lazy" decoding="async" />}
                </li>
              );
            })}
            {more > 0 && (
              <li className="relative z-0 flex size-11 items-center justify-center rounded-full border-2 border-white bg-champagne text-xs font-medium text-copper shadow-[0_2px_6px_rgb(48_33_28/0.16)]">
                +{more}
              </li>
            )}
          </ul>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="price font-semibold text-ink">{real}</span> <span className="text-ink-muted">de {plural(total, 'peça', 'peças')} com foto sua</span>
            </p>
            <div
              role="progressbar"
              aria-label="Peças com foto real"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={real}
              aria-valuetext={`${real} de ${total}`}
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#efe4dc]"
            >
              <span className="block h-full rounded-full bg-gradient-to-r from-rose to-copper transition-[width] duration-500 ease-out" style={{ width: `${total ? Math.max((real / total) * 100, real ? 4 : 0) : 0}%` }} />
            </div>
          </div>
        </div>

        {!active && (
          <Button className="mt-4 w-full sm:w-auto" onClick={onShow}>
            <Camera size={18} strokeWidth={1.75} aria-hidden="true" /> Trocar as fotos
          </Button>
        )}

        {status.done < status.total && (
          <p className="mt-4 border-t border-line pt-3 text-sm text-ink-muted">
            Na loja toda: {status.done} de {status.total}.{' '}
            <Link to={adminPath('configuracoes')} className="text-copper underline underline-offset-4">
              Ver tudo o que falta
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}

const STEPS = [
  { icon: LayoutGrid, text: 'Toque na peça' },
  { icon: ImagePlus, text: 'Adicione as suas fotos' },
  { icon: Trash2, text: 'Remova as provisórias' },
  { icon: Save, text: 'Salve' },
];

/** Above the list while only the pieces on a stand-in show: what the list is now, how to fix one, and the way out. */
export const StandInBanner = forwardRef<HTMLElement, { count: number; onClear: () => void }>(function StandInBanner({ count, onClear }, ref) {
  const titleId = useId();
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="scroll-mt-24 rounded-2xl border border-[#ecd6b4] bg-warning-tint/70 p-4 outline-none"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-warning shadow-[0_1px_4px_rgb(138_90_18/0.18)]">
          <Camera size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-sans text-base leading-snug font-medium text-ink">
            Mostrando só as peças com foto provisória
          </h2>
          <p className="price mt-0.5 text-sm text-warning">{plural(count, 'peça para trocar', 'peças para trocar')}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="-mt-1 -mr-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-copper hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-copper"
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" /> Ver todas
        </button>
      </div>
      <ol aria-label="Como trocar" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map(({ icon: Icon, text }, i) => (
          <li key={text} className="flex items-center gap-2 rounded-xl bg-white/80 px-2.5 py-2 text-sm leading-tight text-ink">
            <span className="price flex size-6 shrink-0 items-center justify-center rounded-full bg-copper text-xs font-semibold text-white">{i + 1}</span>
            <span className="min-w-0">{text}</span>
            <Icon size={15} strokeWidth={1.5} aria-hidden="true" className="ml-auto hidden shrink-0 text-ink-muted min-[380px]:block" />
          </li>
        ))}
      </ol>
    </section>
  );
});
