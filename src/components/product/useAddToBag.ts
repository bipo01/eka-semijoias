import { useCallback } from 'react';
import { sizeLabel } from '../../data/catalog';
import { FINISH_LABEL, type Product, type Variant } from '../../data/schema';
import { useCart } from '../../store/cart';
import { useUi } from '../../store/ui';

export function useAddToBag() {
  const add = useCart((s) => s.add);
  const toast = useUi((s) => s.toast);
  return useCallback(
    (product: Product, variant: Variant, opts: { size?: string; qty?: number; quiet?: boolean } = {}) => {
      add({ productId: product.id, variantId: variant.id, qty: opts.qty ?? 1, ...(opts.size ? { size: opts.size } : {}) });
      if (opts.quiet) return;
      // Same words as the bag line ("Rosé · aro 16"): the finish when there is a choice, and the size.
      const parts = [product.variants.length > 1 ? FINISH_LABEL[variant.finish] : null, opts.size ? sizeLabel(opts.size) : null].filter(Boolean);
      const detail = parts.length ? ` (${parts.join(' · ')})` : '';
      toast(`Adicionado à sacola${detail}`, { tone: 'success', action: { label: 'Ver sacola', onClick: () => useUi.getState().openPanel('bag') } });
    },
    [add, toast],
  );
}
