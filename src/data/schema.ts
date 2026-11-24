import { z } from 'zod';
import { imageSrc } from './imageSrc';
import { siteContentSchema } from './content';
import { normalizePixKey, pixKeyKind } from '../lib/pix';
import { messageSettingsSchema } from './messages';

export const FINISHES = ['rose', 'dourado', 'prateado', 'rodio-negro'] as const;
export type Finish = (typeof FINISHES)[number];

export const FINISH_LABEL: Record<Finish, string> = {
  rose: 'Rosé',
  dourado: 'Dourado',
  prateado: 'Prateado',
  'rodio-negro': 'Ródio negro',
};

export const TAGS = ['novo', 'mais-vendido'] as const;
export type Tag = (typeof TAGS)[number];

export const SCHEMA_VERSION = 2;

const id = z.string().min(1).max(64);
const shortText = (max: number) => z.string().max(max);
const isoDate = z.string().max(40).refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida');
const cents = z.number().int().nonnegative().max(100_000_000);

export { ASSET_STEM_PATTERN, DATA_URL_PATTERN, imageSrc, isDataUrl, MEDIA_KEY_PATTERN } from './imageSrc';

export const productImageSchema = z.object({
  id,
  src: imageSrc,
  thumb: imageSrc.optional(),
  alt: shortText(200),
  placeholder: z.boolean().optional(),
});

export const variantSchema = z.object({
  id,
  finish: z.enum(FINISHES),
  sku: shortText(40).optional(),
  sizes: z.array(shortText(12)).max(30).optional(),
  imageIds: z.array(id).max(20),
  available: z.boolean(),
});

export const productSchema = z
  .object({
    id,
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
    name: shortText(120).min(1),
    categoryId: id,
    collectionIds: z.array(id).max(20),
    price: cents.min(1),
    promoPrice: cents.min(1).optional(),
    description: shortText(4000),
    details: z.object({
      material: shortText(160).optional(),
      plating: shortText(160).optional(),
      stones: shortText(160).optional(),
      dimensions: shortText(160).optional(),
      clasp: shortText(160).optional(),
      weight: shortText(80).optional(),
    }),
    images: z.array(productImageSchema).max(20),
    variants: z.array(variantSchema).min(1).max(8),
    available: z.boolean(),
    featured: z.boolean(),
    tags: z.array(z.enum(TAGS)).max(2),
    order: z.number().int(),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .refine((p) => p.promoPrice == null || p.promoPrice < p.price, {
    message: 'O preço promocional precisa ser menor que o preço',
    path: ['promoPrice'],
  });

export const categorySchema = z.object({
  id,
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  name: shortText(60).min(1),
  order: z.number().int(),
  imageId: id.optional(),
});

export const collectionSchema = z.object({
  id,
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  name: shortText(80).min(1),
  description: shortText(600).optional(),
  heroImage: imageSrc.optional(),
  featuredOnHome: z.boolean(),
  order: z.number().int().optional(),
});

export const resellerLeadSchema = z.object({
  id,
  name: shortText(120),
  whatsapp: shortText(20),
  city: shortText(80),
  uf: shortText(2),
  instagram: shortText(60).optional(),
  alreadySells: z.boolean(),
  source: shortText(200).optional(),
  createdAt: isoDate,
  /** Review state (docs/revenda/PLAN.md §2); absent on older rows = 'nova'. */
  status: z.enum(['nova', 'analise', 'aprovada', 'recusada', 'efetivada']).optional(),
  /** Internal note of the owner. */
  note: shortText(600).optional(),
  /** The reseller created from this application. */
  resellerId: id.optional(),
});

export const settingsSchema = z.object({
  announcement: shortText(140),
  whatsapp: z.string().regex(/^(\d{12,13})?$/), // 55 + DDD + number, or empty while pending
  instagram: z.string().regex(/^[A-Za-z0-9._]{0,30}$/),
  city: shortText(80),
  showroom: shortText(200).optional(),
  openingHours: shortText(120).optional(),
  warrantyMonths: z.number().int().min(0).max(60),
  /** What the warranty covers and how an exchange works (page /garantia and the purchase messages). */
  warrantyTerms: shortText(600).optional(),
  /** Static Pix shown after an order is registered. Absent until the owner fills it in. */
  pix: z
    .object({
      // Stored normalized (see src/lib/pix.ts); anything else would make a code the banks refuse.
      key: z
        .string()
        .min(1)
        .max(77)
        .refine((k) => /^[\x21-\x7E]+$/.test(k) && (({ ok, key }) => ok && key === k)(normalizePixKey(pixKeyKind(k), k) as { ok: boolean; key?: string }), 'Chave Pix inválida'),
      name: z.string().min(1).max(25),
      city: z.string().min(1).max(15),
    })
    .optional(),
  /** "Últimas unidades" shows when a tracked piece has this many or fewer left (default 2). */
  lowStockThreshold: z.number().int().min(0).max(20).optional(),
  /** WhatsApp message templates the owner changed (src/data/messages.ts); absent = built-in defaults. */
  messages: messageSettingsSchema.optional(),
});

export const MAX_PRODUCTS = 500;
export const MAX_CATEGORIES = 50;
export const MAX_COLLECTIONS = 50;
export const MAX_LEADS = 20_000;

/**
 * Public stock: productId → "<variantId>|<size>" → units (capped, see src/data/stock.ts).
 * Only products with stock control appear. Materialized by the server from the
 * stock_levels table; the browser never writes it.
 */
export const stockMapSchema = z.record(z.string().max(64), z.record(z.string().max(80), z.number().int().min(0).max(100_000)));

/** The public catalog, as served by GET /api/catalog (no leads, no credentials). */
export const catalogSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  products: z.array(productSchema).max(MAX_PRODUCTS),
  categories: z.array(categorySchema).max(MAX_CATEGORIES),
  collections: z.array(collectionSchema).max(MAX_COLLECTIONS),
  settings: settingsSchema,
  stock: stockMapSchema.optional(),
  /** Site texts and images the owner edited (missing sections show the built-in text, see src/content/defaults.ts). */
  content: siteContentSchema.optional(),
});

/** Full backup: the catalog plus reseller leads. */
export const catalogStateSchema = catalogSchema.extend({
  leads: z.array(resellerLeadSchema).max(MAX_LEADS),
});

export type ProductImage = z.infer<typeof productImageSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type Product = z.infer<typeof productSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type ResellerLead = z.infer<typeof resellerLeadSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogState = z.infer<typeof catalogStateSchema>;
export type StockMap = z.infer<typeof stockMapSchema>;

export const cartItemSchema = z.object({
  productId: id,
  variantId: id,
  size: shortText(12).optional(),
  qty: z.number().int().min(1).max(99),
});
export type CartItem = z.infer<typeof cartItemSchema>;
export const cartSchema = z.object({ items: z.array(cartItemSchema).max(100) });

export const favoritesSchema = z.object({ ids: z.array(id).max(500) });

export const customerSchema = z.object({ name: shortText(80), city: shortText(80) });
export type Customer = z.infer<typeof customerSchema>;
