import { STORAGE_BUDGET_BYTES } from '../data/storage';
import { cx } from '../components/ui/cx';
import { formatBytes } from '../lib/format';
import { useStorageUsage } from './lib/persist';

export function StorageMeter({ className }: { className?: string }) {
  const used = useStorageUsage();
  const ratio = Math.min(1, used / STORAGE_BUDGET_BYTES);
  const percent = Math.round(ratio * 100);
  const level = ratio >= 0.9 ? 'danger' : ratio >= 0.7 ? 'warning' : 'ok';
  return (
    <section aria-label="Espaço de armazenamento" className={cx('rounded-[12px] border border-line bg-white px-4 py-3', className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p>
          Espaço usado: <span className="price">{formatBytes(used)}</span> de {formatBytes(STORAGE_BUDGET_BYTES)}
        </p>
        <p className={cx('price', level === 'danger' ? 'text-danger' : 'text-ink-muted')}>{percent}%</p>
      </div>
      <div
        role="meter"
        aria-label="Espaço usado"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% usado`}
        className="mt-2 h-2 overflow-hidden rounded-full bg-champagne"
      >
        <div
          className={cx('h-full rounded-full transition-[width] duration-[240ms]', level === 'danger' ? 'bg-danger' : level === 'warning' ? 'bg-copper-dark' : 'bg-rose')}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
      {level !== 'ok' && (
        <p className={cx('mt-2 text-sm', level === 'danger' ? 'text-danger' : 'text-ink')}>
          {level === 'danger'
            ? 'O espaço está quase no fim. Exporte um backup e remova fotos de peças que saíram do catálogo antes de enviar novas.'
            : 'O espaço está ficando cheio. Prefira 1 ou 2 fotos por peça e exporte um backup com frequência.'}
        </p>
      )}
    </section>
  );
}
