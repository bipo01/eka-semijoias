import { useEffect, useRef, useState } from 'react';
import { Expand } from 'lucide-react';
import type { ProductImage } from '../../data/schema';
import { productImageSources } from '../../lib/assets';
import { Img } from '../ui/Img';
import { cx } from '../ui/cx';
import { Lightbox } from './Lightbox';

/**
 * Mobile: scroll-snap rail with a peek of the next photo and dots.
 * Desktop: main photo + thumbnails. Tapping opens the fullscreen viewer.
 */
export function Gallery({ images, name, caption }: { images: ProductImage[]; name: string; caption: string | null }) {
  const rail = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const key = images.map((i) => i.id).join();

  // New photo set (finish changed): go back to the first photo.
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setActive(0);
  }
  useEffect(() => {
    rail.current?.scrollTo({ left: 0 });
  }, [key]);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(items.indexOf(e.target as HTMLElement));
      },
      { root: el, threshold: 0.6 },
    );
    items.forEach((i) => observer.observe(i));
    return () => observer.disconnect();
  }, [key]);

  if (!images.length) return <Img src="" alt={name} frameClassName="rounded-[12px]" />;

  return (
    <div>
      {/* Mobile / tablet rail */}
      <ul ref={rail} aria-label={`Fotos de ${name}`} className="no-scrollbar -mx-[var(--gutter)] flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-2 overflow-x-auto px-[var(--gutter)] lg:hidden">
        {images.map((img, i) => {
          const src = productImageSources(img);
          return (
            <li key={img.id} className={cx('shrink-0 snap-start', images.length > 1 ? 'w-[84%] sm:w-[60%]' : 'w-full sm:w-[60%]')}>
              <button type="button" onClick={() => setViewer(i)} aria-label={`Ampliar foto ${i + 1} de ${images.length}`} className="block w-full rounded-[12px]">
                <Img src={src.src} srcSet={src.srcSet} sizes="(min-width: 640px) 60vw, 84vw" alt={img.alt} priority={i === 0} width={960} height={1200} frameClassName="rounded-[12px]" />
              </button>
            </li>
          );
        })}
      </ul>
      {images.length > 1 && (
        <div className="mt-3 flex justify-center gap-2 lg:hidden" aria-hidden="true">
          {images.map((img, i) => (
            <span key={img.id} className={cx('h-1.5 rounded-full transition-all duration-[240ms]', i === active ? 'w-5 bg-copper' : 'w-1.5 bg-line')} />
          ))}
        </div>
      )}

      {/* Desktop */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[72px_1fr]">
        <ul className="flex flex-col gap-3" aria-label={`Miniaturas de ${name}`}>
          {images.map((img, i) => {
            const src = productImageSources(img, true);
            return (
              <li key={img.id}>
                <button type="button" aria-label={`Ver foto ${i + 1}`} aria-pressed={i === active} onClick={() => setActive(i)} className={cx('block w-full rounded-[8px] ring-offset-2 ring-offset-ivory transition-shadow', i === active ? 'ring-1 ring-copper' : 'opacity-80 hover:opacity-100')}>
                  <Img src={src.src} srcSet={src.srcSet} sizes="72px" alt="" frameClassName="rounded-[8px]" />
                </button>
              </li>
            );
          })}
        </ul>
        {images[active] && (
          <button type="button" onClick={() => setViewer(active)} className="group relative block cursor-zoom-in rounded-[12px]" aria-label="Ampliar foto">
            <Img {...productImageSources(images[active]!)} sizes="(min-width: 1264px) 560px, 45vw" alt={images[active]!.alt} priority width={960} height={1200} frameClassName="rounded-[12px]" />
            <span className="absolute right-3 bottom-3 inline-flex size-10 items-center justify-center rounded-full bg-white/85 text-ink opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">
              <Expand size={18} strokeWidth={1.5} />
            </span>
          </button>
        )}
      </div>
      {caption && <p className="mt-2 text-sm text-ink-muted">{caption}</p>}

      <Lightbox images={images} index={viewer ?? 0} onIndex={setViewer} open={viewer != null} onClose={() => setViewer(null)} title={`Fotos de ${name}`} />
    </div>
  );
}
