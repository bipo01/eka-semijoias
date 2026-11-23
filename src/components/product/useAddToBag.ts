import { useCallback } from 'react';
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
      const detail = product.variants.length > 1 ? ` (${FINISH_LABEL[variant.finish]})` : '';
      toast(`Adicionado à sacola${detail}`, { tone: 'success', action: { label: 'Ver sacola', onClick: () => useUi.getState().openPanel('bag') } });
    },
    [add, toast],
  );
}
