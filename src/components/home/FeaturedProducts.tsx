import { byOrder, isPurchasable } from '../../data/catalog';
import { useSection } from '../../hooks/useSection';
import { useCatalog } from '../../store/catalog';
import { ProductGrid } from '../product/ProductCard';
import { SectionHeading } from '../ui/Misc';
import { SeeAll } from './CategoryRail';

export function FeaturedProducts() {
  const products = useCatalog((s) => s.data.products);
  const stock = useCatalog((s) => s.data.stock);
  const { titles } = useSection('inicio');
  const featured = products.filter((p) => p.featured && isPurchasable(p, stock)).sort(byOrder).slice(0, 8);
  if (!featured.length) return null;
  return (
    <section aria-labelledby="home-mais-amadas" className="container-x pt-12 lg:pt-20">
      <SectionHeading id="home-mais-amadas" title={titles.featured} action={<SeeAll to="/catalogo" />} />
      <ProductGrid products={featured} dense />
    </section>
  );
}
