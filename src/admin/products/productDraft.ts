import { FINISH_LABEL, productSchema, type CatalogState, type Finish, type Product, type ProductImage, type Tag } from '../../data/schema';
import { sortedCategories } from '../../data/catalog';
import { centsToInput, parseBRL } from '../../lib/format';
import { newId } from '../../lib/id';
import { slugify, uniqueSlug } from '../../lib/slug';

export type DetailKey = keyof Product['details'];

export const DETAIL_FIELDS: { key: DetailKey; label: string; placeholder: string; max: number }[] = [
  { key: 'material', label: 'Material', placeholder: 'Ex.: latão', max: 160 },
  { key: 'plating', label: 'Banho', placeholder: 'Ex.: ouro 18k', max: 160 },
  { key: 'stones', label: 'Pedras', placeholder: 'Ex.: zircônias', max: 160 },
  { key: 'dimensions', label: 'Medidas', placeholder: 'Ex.: 2,5 cm', max: 160 },
  { key: 'clasp', label: 'Fecho', placeholder: 'Ex.: tarraxa', max: 160 },
  { key: 'weight', label: 'Peso', placeholder: 'Ex.: 3 g', max: 80 },
];

export const SIZE_PRESETS = [
  { label: 'Aros 12–22', value: '12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22' },
  { label: 'P, M, G', value: 'P, M, G' },
];

export interface DraftVariant {
  id: string;
  finish: Finish;
  sku: string;
  sizes: string;
  imageIds: string[];
  available: boolean;
}

export interface ProductDraft {
  id: string;
  isNew: boolean;
  createdAt: string;
  order: number;
  name: string;
  slug: string;
  /** False while the slug follows the name (new products). */
  slugEdited: boolean;
  categoryId: string;
  collectionIds: string[];
  price: string;
  promo: string;
  description: string;
  details: Record<DetailKey, string>;
  images: ProductImage[];
  /** Photos whose alt text still follows "{nome} em {acabamento}". */
  autoAltIds: string[];
  variants: DraftVariant[];
  available: boolean;
  featured: boolean;
  tags: Tag[];
}

export type DraftErrors = Partial<Record<string, string>>;

const emptyDetails = (): Record<DetailKey, string> => ({ material: '', plating: '', stones: '', dimensions: '', clasp: '', weight: '' });

export function draftFromProduct(p: Product): ProductDraft {
  const details = emptyDetails();
  for (const f of DETAIL_FIELDS) details[f.key] = p.details[f.key] ?? '';
  return {
    id: p.id,
    isNew: false,
    createdAt: p.createdAt,
    order: p.order,
    name: p.name,
    slug: p.slug,
    slugEdited: true, // keep links to existing products stable
    categoryId: p.categoryId,
    collectionIds: [...p.collectionIds],
    price: centsToInput(p.price),
    promo: centsToInput(p.promoPrice),
    description: p.description,
    details,
    images: p.images.map((img) => ({ ...img })),
    autoAltIds: [],
    variants: p.variants.map((v) => ({
      id: v.id,
      finish: v.finish,
      sku: v.sku ?? '',
      sizes: (v.sizes ?? []).join(', '),
      imageIds: [...v.imageIds],
      available: v.available,
    })),
    available: p.available,
    featured: p.featured,
    tags: [...p.tags],
  };
}

export function newVariant(finish: Finish): DraftVariant {
  return { id: newId('v'), finish, sku: '', sizes: '', imageIds: [], available: true };
}

export function emptyDraft(data: CatalogState, now: string): ProductDraft {
  return {
    id: newId('p'),
    isNew: true,
    createdAt: now,
    order: 0,
    name: '',
    slug: '',
    slugEdited: false,
    categoryId: sortedCategories(data)[0]?.id ?? '',
    collectionIds: [],
    price: '',
    promo: '',
    description: '',
    details: emptyDetails(),
    images: [],
    autoAltIds: [],
    variants: [newVariant('dourado')],
    available: true,
    featured: false,
    tags: [],
  };
}

/** A new, unsaved copy (new ids for the product, its photos and finishes). */
export function duplicateDraft(p: Product, now: string): ProductDraft {
  const base = draftFromProduct(p);
  const imageIds = new Map(base.images.map((img) => [img.id, newId('img')]));
  return {
    ...base,
    id: newId('p'),
    isNew: true,
    createdAt: now,
    name: `${p.name} (cópia)`.slice(0, 120),
    slug: '',
    slugEdited: false,
    images: base.images.map((img) => ({ ...img, id: imageIds.get(img.id)! })),
    variants: base.variants.map((v) => ({ ...v, id: newId('v'), imageIds: v.imageIds.map((id) => imageIds.get(id)!) })),
  };
}

export function altFor(name: string, finish: Finish): string {
  return `${name.trim() || 'Peça'} em ${FINISH_LABEL[finish]}`;
}

/** Finish a photo shows: the finish it is assigned to, else the first finish. */
export function imageFinish(draft: Pick<ProductDraft, 'variants'>, imageId: string): Finish {
  return (draft.variants.find((v) => v.imageIds.includes(imageId)) ?? draft.variants[0])?.finish ?? 'dourado';
}

/** Refreshes alt texts that still follow the default pattern. */
export function withAutoAlts(draft: ProductDraft): ProductDraft {
  if (!draft.autoAltIds.length) return draft;
  const auto = new Set(draft.autoAltIds);
  return {
    ...draft,
    images: draft.images.map((img) => (auto.has(img.id) ? { ...img, alt: altFor(draft.name, imageFinish(draft, img.id)) } : img)),
  };
}

export function parseSizes(text: string): string[] {
  return [...new Set(text.split(/[,;]/).map((s) => s.trim()).filter(Boolean))];
}

export function takenSlugs(data: CatalogState, exceptId: string): string[] {
  return data.products.filter((p) => p.id !== exceptId).map((p) => p.slug);
}

/** The slug that will be saved: follows the name until edited by hand. */
export function effectiveSlug(draft: ProductDraft, taken: string[]): string {
  return draft.slugEdited ? slugify(draft.slug) : uniqueSlug(draft.name, taken);
}

export type BuildResult = { ok: true; product: Product } | { ok: false; errors: DraftErrors };

/** Validates a draft and turns it into a Product (checked with productSchema). */
export function buildProduct(draft: ProductDraft, data: CatalogState, now: string): BuildResult {
  const errors: DraftErrors = {};
  const taken = takenSlugs(data, draft.id);
  const name = draft.name.trim();
  if (!name) errors.name = 'Informe o nome da peça.';

  const slug = effectiveSlug(draft, taken);
  if (!slug) errors.slug = 'Informe o endereço da peça (letras, números e hífens).';
  else if (taken.includes(slug)) errors.slug = 'Já existe outra peça com este endereço.';

  if (!data.categories.some((c) => c.id === draft.categoryId)) errors.categoryId = 'Escolha uma categoria.';

  const price = parseBRL(draft.price);
  if (price == null || price < 1) errors.price = 'Informe o preço, por exemplo 129,90.';
  let promoPrice: number | undefined;
  if (draft.promo.trim()) {
    const promo = parseBRL(draft.promo);
    if (promo == null || promo < 1) errors.promo = 'Valor inválido. Use o formato 99,90.';
    else if (price != null && promo >= price) errors.promo = 'O preço promocional precisa ser menor que o preço.';
    else promoPrice = promo;
  }

  for (const img of draft.images) {
    if (!img.alt.trim()) errors[`alt:${img.id}`] = 'Descreva a foto (ajuda quem usa leitor de tela).';
  }

  if (!draft.variants.length) errors.variants = 'Escolha pelo menos um acabamento.';
  const imageIds = new Set(draft.images.map((i) => i.id));
  const variants = draft.variants.map((v) => {
    const sizes = parseSizes(v.sizes);
    if (sizes.some((s) => s.length > 12)) errors[`sizes:${v.id}`] = 'Cada tamanho pode ter até 12 caracteres.';
    else if (sizes.length > 30) errors[`sizes:${v.id}`] = 'Use no máximo 30 tamanhos.';
    const sku = v.sku.trim();
    return {
      id: v.id,
      finish: v.finish,
      ...(sku ? { sku } : {}),
      ...(sizes.length ? { sizes } : {}),
      imageIds: v.imageIds.filter((id) => imageIds.has(id)),
      available: v.available,
    };
  });

  if (Object.keys(errors).length) return { ok: false, errors };

  const details: Product['details'] = {};
  for (const f of DETAIL_FIELDS) {
    const value = draft.details[f.key].trim();
    if (value) details[f.key] = value;
  }
  const order = draft.isNew ? Math.min(0, ...data.products.map((p) => p.order)) - 1 : draft.order;
  const candidate: Product = {
    id: draft.id,
    slug,
    name,
    categoryId: draft.categoryId,
    collectionIds: draft.collectionIds.filter((id) => data.collections.some((c) => c.id === id)),
    price: price!,
    ...(promoPrice != null ? { promoPrice } : {}),
    description: draft.description.trim(),
    details,
    images: draft.images.map((img) => ({ ...img, alt: img.alt.trim() })),
    variants,
    available: draft.available,
    featured: draft.featured,
    tags: draft.tags,
    order,
    createdAt: draft.createdAt,
    updatedAt: now,
  };
  const parsed = productSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, errors: { form: `Revise os dados da peça (${issue?.path.join('.') || 'formulário'}).` } };
  }
  return { ok: true, product: parsed.data };
}

/** Inserts or replaces a product in the catalog. */
export function upsertProduct(data: CatalogState, product: Product): CatalogState {
  const exists = data.products.some((p) => p.id === product.id);
  return { ...data, products: exists ? data.products.map((p) => (p.id === product.id ? product : p)) : [...data.products, product] };
}
