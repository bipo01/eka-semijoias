import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Misc';
import { cx } from '../../components/ui/cx';
import { sizeLabel } from '../../data/catalog';
import { FINISH_LABEL, type Product } from '../../data/schema';
import { MOVEMENT_REASON_LABEL, MOVEMENT_REASONS, type MovementReason } from '../../data/stock';
import { EmptyState } from '../FormBits';
import { formatDateTime } from '../lib/contact';
import type { StockMovement } from '../lib/stock';

/*
 * Stock history: every entry, exit, adjustment, order and kit movement, with
 * the reason label, the note, and "Pedido nº N" / "Maleta de <Nome>" when the
 * movement belongs to one.
 */

/** "Pedido nº 1042" / "Maleta de Ana" for movements that belong to an order or a kit. */
export function movementOrigin(m: Pick<StockMovement, 'orderNumber' | 'kitId' | 'resellerName'>): string | null {
  if (m.orderNumber) return `Pedido nº ${m.orderNumber}`;
  if (m.kitId) return m.resellerName ? `Maleta de ${m.resellerName}` : 'Maleta';
  return null;
}

/** Reasons present in the list, in the canonical order, with their counts. */
export function reasonCounts(movements: Pick<StockMovement, 'reason'>[]): { reason: MovementReason; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of movements) counts.set(m.reason, (counts.get(m.reason) ?? 0) + 1);
  return MOVEMENT_REASONS.filter((r) => counts.has(r)).map((reason) => ({ reason, count: counts.get(reason)! }));
}

export function MovementList({ movements, products, showProduct }: { movements: StockMovement[]; products: Product[]; showProduct: boolean }) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  return (
    <ul className="divide-y divide-line border-y border-line text-sm">
      {movements.map((m) => {
        const product = byId.get(m.productId);
        const variant = product?.variants.find((v) => v.id === m.variantId);
        const origin = movementOrigin(m);
        const label = MOVEMENT_REASON_LABEL[m.reason] ?? m.reason;
        return (
          <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              {showProduct && <p className="truncate font-medium">{product?.name ?? 'Peça removida do catálogo'}</p>}
              <p>
                {label}
                {origin && ` · ${origin}`}
              </p>
              {m.note && <p className="break-words text-ink-muted">{m.note}</p>}
              <p className="text-ink-muted">
                {variant ? FINISH_LABEL[variant.finish] : 'Acabamento removido'}
                {m.size && ` · ${sizeLabel(m.size)}`} · {formatDateTime(m.at)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={cx('price font-medium', m.delta < 0 ? 'text-danger' : 'text-success')}>{m.delta > 0 ? `+${m.delta}` : m.delta}</p>
              <p className="price text-ink-muted">fica {m.qtyAfter}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const PAGE = 40;

/** The whole history with a filter by reason. */
export function StockHistory({ movements, products }: { movements: StockMovement[]; products: Product[] }) {
  const [reason, setReason] = useState<MovementReason | 'todos'>('todos');
  const [limit, setLimit] = useState(PAGE);
  const reasons = reasonCounts(movements);
  const visible = reason === 'todos' ? movements : movements.filter((m) => m.reason === reason);

  return (
    <section aria-labelledby="stock-history" className="mt-8">
      <h2 id="stock-history" className="mb-1 font-display text-title">
        Histórico
      </h2>
      <p className="mb-3 text-sm text-ink-muted">Entradas, saídas, ajustes, pedidos e maletas, do mais recente ao mais antigo.</p>
      {movements.length > 0 && (
        <div role="group" aria-label="Filtrar histórico por motivo" className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip selected={reason === 'todos'} onClick={() => setReason('todos')}>
            Todos
            <span className={cx('price text-xs', reason === 'todos' ? 'text-white/85' : 'text-ink-muted')}>{movements.length}</span>
          </Chip>
          {reasons.map(({ reason: r, count }) => (
            <Chip key={r} selected={reason === r} onClick={() => setReason(r)}>
              {MOVEMENT_REASON_LABEL[r]}
              <span className={cx('price text-xs', reason === r ? 'text-white/85' : 'text-ink-muted')}>{count}</span>
            </Chip>
          ))}
        </div>
      )}
      {visible.length ? (
        <>
          <MovementList movements={visible.slice(0, limit)} products={products} showProduct />
          {visible.length > limit && (
            <Button variant="ghost" block className="mt-2" onClick={() => setLimit((n) => n + PAGE)}>
              Mostrar mais
            </Button>
          )}
        </>
      ) : (
        <EmptyState>Nenhuma movimentação ainda.</EmptyState>
      )}
    </section>
  );
}
