import { useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, Star } from 'lucide-react';
import { IconButton } from '../../components/ui/Button';
import { Img } from '../../components/ui/Img';
import { Price, Switch } from '../../components/ui/Misc';
import { cx } from '../../components/ui/cx';
import type { Product } from '../../data/schema';
import { productImageSources } from '../../lib/assets';
import { MoveButtons } from '../FormBits';
import { adminPath } from '../lib/paths';
import { save } from '../lib/persist';
import { move } from '../lib/reorder';

const GAP = 8; // px between rows (gap-2)

interface Drag {
  index: number;
  startY: number;
  offset: number;
  rowHeight: number;
}

function patchProduct(id: string, patch: Partial<Product>) {
  const now = new Date().toISOString();
  void save((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now } : p)) }));
}

interface ProductListProps {
  products: Product[];
  categoryName: Map<string, string>;
  /** Receives the visible product ids in their new order. */
  onReorder: (ids: string[]) => void;
}

/** Product rows with drag-to-reorder (pointer events) and up/down buttons as the accessible path. */
export function ProductList({ products, categoryName, onReorder }: ProductListProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const ids = products.map((p) => p.id);
  const clampIndex = (i: number) => Math.max(0, Math.min(products.length - 1, i));
  const target = drag ? clampIndex(drag.index + Math.round(drag.offset / drag.rowHeight)) : null;

  function startDrag(e: PointerEvent<HTMLElement>, index: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const row = e.currentTarget.closest('li');
    if (!row) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ index, startY: e.clientY, offset: 0, rowHeight: row.getBoundingClientRect().height + GAP });
  }

  function endDrag() {
    if (drag && target != null && target !== drag.index) onReorder(move(ids, drag.index, target));
    setDrag(null);
  }

  function rowShift(i: number): number {
    if (!drag || target == null || i === drag.index) return 0;
    if (drag.index < i && i <= target) return -drag.rowHeight;
    if (target <= i && i < drag.index) return drag.rowHeight;
    return 0;
  }

  return (
    <ul className="flex flex-col gap-2">
      {products.map((p, i) => {
        const dragging = drag?.index === i;
        const image = p.images[0];
        const editPath = adminPath('produtos', p.id);
        return (
          <li
            key={p.id}
            className={cx(
              'relative rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-3',
              dragging ? 'z-10 shadow-[var(--shadow-1)]' : 'transition-transform duration-[160ms]',
            )}
            style={{ transform: `translateY(${dragging ? drag.offset : rowShift(i)}px)` }}
          >
            <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-x-3">
              <Link to={editPath} tabIndex={-1} aria-hidden="true" className="row-span-2 self-start">
                {image ? (
                  <Img {...productImageSources(image, true)} alt="" ratio="4 / 5" frameClassName={cx('w-16 rounded-[8px]', !p.available && 'opacity-60')} width={64} height={80} />
                ) : (
                  <span className="block aspect-[4/5] w-16 rounded-[8px] bg-champagne" />
                )}
              </Link>
              <div className="min-w-0 py-0.5">
                <Link to={editPath} className="line-clamp-2 leading-snug font-medium hover:text-copper">
                  <span className="sr-only">Editar </span>
                  {p.name}
                </Link>
                <p className="truncate text-sm text-ink-muted">
                  {categoryName.get(p.categoryId) ?? 'Sem categoria'}
                  {!p.available && ' · Indisponível'}
                </p>
                <Price price={p.price} promoPrice={p.promoPrice} size="sm" className="mt-0.5" />
              </div>
              {/* Visible caption: on its own the switch did not say what it turns on and off (off = "Esgotado" on the site). */}
              <div className="-mt-1 flex flex-col items-center">
                <Switch checked={p.available} onChange={(v) => patchProduct(p.id, { available: v })} label={`Disponível: ${p.name}`} />
                <span aria-hidden="true" className="-mt-1 text-xs text-ink-muted">{p.available ? 'À venda' : 'Esgotada'}</span>
              </div>
              <div className="col-start-2 -ml-2.5 flex items-center">
                <IconButton
                  label={`Destaque na home: ${p.name}`}
                  aria-pressed={p.featured}
                  onClick={() => patchProduct(p.id, { featured: !p.featured })}
                >
                  <Star size={20} strokeWidth={1.5} fill={p.featured ? 'currentColor' : 'none'} className={p.featured ? 'text-copper' : 'text-ink-muted'} />
                </IconButton>
                <MoveButtons name={p.name} index={i} count={products.length} onMove={(to) => onReorder(move(ids, i, to))} />
              </div>
              <span
                aria-hidden="true"
                title="Arraste para reordenar"
                className={cx('flex size-11 touch-none items-center justify-center self-end justify-self-center rounded-full text-ink-muted', dragging ? 'cursor-grabbing' : 'cursor-grab')}
                onPointerDown={(e) => startDrag(e, i)}
                onPointerMove={(e) => drag && setDrag({ ...drag, offset: e.clientY - drag.startY })}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
              >
                <GripVertical size={20} strokeWidth={1.5} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
