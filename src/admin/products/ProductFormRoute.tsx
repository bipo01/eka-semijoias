import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useCatalog } from '../../store/catalog';
import { adminPath } from '../lib/paths';
import { ProductForm, type FormSource } from './ProductForm';

/** /admin/produtos/nova (optionally ?copiar=<id>) and /admin/produtos/:id. */
export function ProductFormRoute() {
  const { productId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const products = useCatalog((s) => s.data.products);

  let source: FormSource | null;
  if (productId === 'nova') {
    const original = products.find((p) => p.id === params.get('copiar'));
    source = original ? { kind: 'copy', product: original } : { kind: 'new' };
  } else {
    const product = products.find((p) => p.id === productId);
    source = product ? { kind: 'edit', product } : null;
  }
  if (!source) return <Navigate to={adminPath('produtos')} replace />;
  // A new location (e.g. "Salvar e nova") starts a fresh form.
  return <ProductForm key={location.key} source={source} />;
}
