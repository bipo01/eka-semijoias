import { FINISH_LABEL, type Catalog, type Category, type Product, type ProductImage, type Variant } from './schema';

export const effectivePrice = (p: Product): number => p.promoPrice ?? p.price;
export const isOnSale = (p: Product): boolean => p.promoPrice != null && p.promoPrice < p.price;

/** A product can be bought when the master switch is on and at least one finish is available. */
export const isPurchasable = (p: Product): boolean => p.available && p.variants.some((v) => v.available);

export function defaultVariant(p: Product): Variant {
  return p.variants.find((v) => v.available) ?? p.variants[0]!;
}

export function findVariant(p: Product, variantId: string | null | undefined): Variant | undefined {
  return p.variants.find((v) => v.id === variantId);
}

export interface VariantGallery {
  images: ProductImage[];
  /** Set when the photos show another finish than the selected one, e.g. "Foto no acabamento Rosé". */
  caption: string | null;
}

/**
 * Photos for a finish. A finish without its own photos shows the product's
 * photos plus a caption naming the finish they depict.
 */
export function galleryFor(p: Product, variant: Variant): VariantGallery {
  const byId = new Map(p.images.map((img) => [img.id, img]));
  const own = variant.imageIds.map((id) => byId.get(id)).filter((img): img is ProductImage => !!img);
  if (own.length) return { images: own, caption: null };
  const owner = p.variants.find((v) => v.imageIds.length > 0);
  const photoFinish = owner ? FINISH_LABEL[owner.finish] : photoFinishFromAlt(p.images[0]);
  return {
    images: p.images,
    caption: photoFinish && photoFinish !== FINISH_LABEL[variant.finish] ? `Foto no acabamento ${photoFinish}` : null,
  };
}

function photoFinishFromAlt(img: ProductImage | undefined): string | null {
  if (!img) return null;
  const label = Object.values(FINISH_LABEL).find((l) => img.alt.includes(` em ${l}`));
  return label ?? null;
}

export const mainImage = (p: Product): ProductImage | undefined => p.images[0];

export type ProductBadge = 'esgotado' | 'novo' | 'mais-vendido' | null;

/** One tag at most, by priority. */
export function productBadge(p: Product): ProductBadge {
  if (!isPurchasable(p)) return 'esgotado';
  if (p.tags.includes('novo')) return 'novo';
  if (p.tags.includes('mais-vendido')) return 'mais-vendido';
  return null;
}

export const BADGE_LABEL: Record<Exclude<ProductBadge, null>, string> = {
  esgotado: 'Esgotado',
  novo: 'Novo',
  'mais-vendido': 'Mais vendido',
};

export const sortedCategories = (data: Catalog): Category[] =>
  [...data.categories].sort((a, b) => a.order - b.order);

export const byOrder = (a: Product, b: Product) => a.order - b.order;

export function categoryProducts(data: Catalog, categoryId: string): Product[] {
  return data.products.filter((p) => p.categoryId === categoryId);
}

/** Lowest current price among purchasable products of a category, or null when empty. */
export function categoryFromPrice(data: Catalog, categoryId: string): number | null {
  const prices = categoryProducts(data, categoryId).filter(isPurchasable).map(effectivePrice);
  return prices.length ? Math.min(...prices) : null;
}

/** Image representing a category: its chosen image, else the first product's main photo. */
export function categoryImage(data: Catalog, category: Category): ProductImage | undefined {
  if (category.imageId) {
    for (const p of data.products) {
      const img = p.images.find((i) => i.id === category.imageId);
      if (img) return img;
    }
  }
  return categoryProducts(data, category.id).sort(byOrder).find((p) => p.images.length)?.images[0];
}

export function sizeLabel(size: string): string {
  return /^\d+$/.test(size) ? `aro ${size}` : `tam. ${size}`;
}

export function sizeFieldLabel(sizes: string[]): string {
  return sizes.every((s) => /^\d+$/.test(s)) ? 'Aro' : 'Tamanho';
}
