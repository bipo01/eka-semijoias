import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductImage } from '../../data/schema';
import { productImageSources } from '../../lib/assets';
import { Sheet } from '../ui/Sheet';
import { cx } from '../ui/cx';

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };
const MAX_SCALE = 4;

/** Fullscreen viewer: pinch or double-tap to zoom, drag to pan, swipe to change photo. */
export function Lightbox({ images, index, onIndex, open, onClose, title }: { images: ProductImage[]; index: number; onIndex: (i: number) => void; open: boolean; onClose: () => void; title: string }) {
  const [t, setT] = useState<Transform>(IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startScale: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const image = images[index];

  const go = (i: number) => {
    setT(IDENTITY);
    onIndex((i + images.length) % images.length);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const dist = pts.length === 2 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
    gesture.current = { startDist: dist, startScale: t.scale, startX: t.x, startY: t.y, originX: e.clientX, originY: e.clientY, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g.startDist > 0) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const scale = Math.min(MAX_SCALE, Math.max(1, (g.startScale * dist) / g.startDist));
      setT((cur) => ({ ...cur, scale, ...(scale === 1 ? { x: 0, y: 0 } : {}) }));
      g.moved = true;
    } else if (pts.length === 1) {
      const dx = e.clientX - g.originX;
      const dy = e.clientY - g.originY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) g.moved = true;
      if (t.scale > 1) setT((cur) => ({ ...cur, x: g.startX + dx, y: g.startY + dy }));
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const g = gesture.current;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (!g || !wasSingle) return;
    const dx = e.clientX - g.originX;
    if (t.scale === 1 && Math.abs(dx) > 50 && images.length > 1) {
      go(index + (dx < 0 ? 1 : -1));
    } else if (!g.moved) {
      const now = Date.now();
      if (now - lastTap.current < 300) setT((cur) => (cur.scale > 1 ? IDENTITY : { scale: 2.5, x: 0, y: 0 }));
      lastTap.current = now;
    }
    gesture.current = null;
  };

  if (!image) return null;
  const src = productImageSources(image);
  return (
    <Sheet open={open} onClose={onClose} title={title} hideTitle side="full" className="!bg-ink text-on-dark on-dark [&_button[aria-label=Fechar]]:text-on-dark [&_button[aria-label=Fechar]:hover]:bg-white/10">
      <div className="relative flex h-[calc(100dvh-80px)] items-center justify-center overflow-hidden">
        <div
          className="flex h-full w-full touch-none items-center justify-center select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => setT((cur) => (cur.scale > 1 ? IDENTITY : { scale: 2.5, x: 0, y: 0 }))}
        >
          <img
            src={src.src}
            srcSet={src.srcSet}
            sizes="100vw"
            alt={image.alt}
            draggable={false}
            className="max-h-full max-w-full object-contain transition-transform duration-[120ms] ease-out"
            style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})` }}
          />
        </div>
        {images.length > 1 && (
          <>
            <button type="button" aria-label="Foto anterior" onClick={() => go(index - 1)} className="absolute top-1/2 left-2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50">
              <ChevronLeft size={24} strokeWidth={1.5} />
            </button>
            <button type="button" aria-label="Próxima foto" onClick={() => go(index + 1)} className="absolute top-1/2 right-2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50">
              <ChevronRight size={24} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
      <p className="mt-2 text-center text-sm text-on-dark/80" aria-live="polite">
        {index + 1} de {images.length}
        <span className={cx('ml-2 hidden', t.scale === 1 && 'sm:inline')}>· Toque duas vezes para ampliar</span>
      </p>
    </Sheet>
  );
}
