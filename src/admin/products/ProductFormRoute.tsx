import { useState } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useCatalog } from '../../store/catalog';
import { adminPath } from '../lib/paths';
import { ProductForm, type FormSource } from './ProductForm';

/** /admin/produtos/nova (optionally ?copiar=<id>) and /admin/produtos/:id. */
export function ProductFormRoute() {
  const location = useLocation();
  // A new location (e.g. "Salvar e nova") starts a fresh form.
  return <ResolvedForm key={location.key} />;
}

function ResolvedForm() {
  const { productId } = useParams();
  const [params] = useSearchParams();
  // Resolved once: if another tab deletes the product meanwhile, the open form (and its edits) stays.
  const [source] = useState<FormSource | null>(() => {
    const products = useCatalog.getState().data.products;
    if (productId === 'nova') {
      const original = products.find((p) => p.id === params.get('copiar'));
      return original ? { kind: 'copy', product: original } : { kind: 'new' };
    }
    const product = products.find((p) => p.id === productId);
    return product ? { kind: 'edit', product } : null;
  });
  if (!source) return <Navigate to={adminPath('produtos')} replace />;
  return <ProductForm source={source} />;
}
