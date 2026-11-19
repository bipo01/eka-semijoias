import { Heart } from 'lucide-react';
import { useFavorites } from '../../store/favorites';
import { useUi } from '../../store/ui';
import { cx } from '../ui/cx';

export function FavoriteButton({ productId, name, className }: { productId: string; name: string; className?: string }) {
  const active = useFavorites((s) => s.ids.includes(productId));
  const toggle = useFavorites((s) => s.toggle);
  const toast = useUi((s) => s.toast);
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Remover ${name} dos favoritos` : `Salvar ${name} nos favoritos`}
      onClick={(e) => {
        e.preventDefault();
        const added = toggle(productId);
        toast(added ? 'Salvo nos favoritos' : 'Removido dos favoritos', added ? { action: { label: 'Ver favoritos', to: '/favoritos' } } : {});
      }}
      className={cx('inline-flex size-11 items-center justify-center rounded-full text-ink transition-colors hover:text-copper', className)}
    >
      <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm">
        <Heart size={18} strokeWidth={1.5} className={cx(active && 'fill-copper text-copper')} />
      </span>
    </button>
  );
}
