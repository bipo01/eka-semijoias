import { z } from 'zod';
import { imageSrc } from './imageSrc';

/*
 * Site content the owner edits in Painel → Site (docs/conteudo/PLAN.md). Each
 * section is one catalog entity (change kind 'content', id = section id); only
 * edited sections are stored and published in the snapshot (`catalog.content`),
 * every other section shows the built-in text from src/content/defaults.ts.
 * Shared by the browser and the Worker: the server validates every section
 * with the schema of its id.
 */

export const SECTION_IDS = ['inicio', 'depoimentos', 'perguntas', 'sobre', 'cuidados', 'garantia', 'revendedoras', 'contato', 'geral', 'privacidade', 'compartilhar', 'loja'] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const isSectionId = (v: string): v is SectionId => (SECTION_IDS as readonly string[]).includes(v);

/** How the admin names each section (also used in conflict messages). */
export const SECTION_LABEL: Record<SectionId, string> = {
  inicio: 'Página inicial',
  depoimentos: 'Depoimentos',
  perguntas: 'Perguntas frequentes',
  sobre: 'Sobre',
  cuidados: 'Como cuidar',
  garantia: 'Garantia e trocas',
  revendedoras: 'Seja revendedora',
  contato: 'Contato',
  geral: 'Textos gerais',
  privacidade: 'Política de privacidade',
  compartilhar: 'Google e compartilhamento',
  loja: 'O que a loja oferece',
};

const FILL = 'Preencha este campo.';
/** Optional text: trimmed, may be empty (an empty optional text hides that element). */
const text = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);
/** Required text. */
const req = (max: number) => text(max).min(1, FILL);
/** Stable id of a list item (made in the browser), used for order and React keys. */
export const itemIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Item inválido');
const isoDate = z.string().max(40).refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida');

/** A site image: a built-in stem ("images/…"), an uploaded photo ("media/…") or, before saving, a data URL. */
export const contentImageSchema = z.object({
  src: imageSrc,
  thumb: imageSrc.optional(),
  alt: text(200),
});
export type ContentImage = z.infer<typeof contentImageSchema>;
const listImageSchema = contentImageSchema.extend({ id: itemIdSchema });

/** Page header: eyebrow, title with an optional italic word at the end, intro. */
export const pageHeaderSchema = z.object({
  eyebrow: text(40),
  title: req(80),
  highlight: text(30),
  intro: text(400),
});
export type PageHeader = z.infer<typeof pageHeaderSchema>;

const titledItem = (title: number, body: number) => z.object({ id: itemIdSchema, title: req(title), text: text(body) });
const textItem = (max: number) => z.object({ id: itemIdSchema, text: req(max) });
const qaItem = z.object({ id: itemIdSchema, question: req(140), answer: req(800) });
export type TitledItem = { id: string; title: string; text: string };
export type TextItem = { id: string; text: string };
export type QaItem = z.infer<typeof qaItem>;

/** Every stored section carries the moment of its last save (shown in the admin and on /privacidade). */
const stamped = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, updatedAt: isoDate.optional() });

export const testimonialSchema = z.object({
  id: itemIdSchema,
  text: req(400),
  name: req(40),
  city: text(40),
  // No "hidden" state on purpose: the snapshot is public, so a testimonial that leaves the site is deleted.
  /** The customer agreed to the publication (required to save). */
  authorized: z.literal(true, { error: 'Confirme que a cliente autorizou publicar.' }),
});
export type Testimonial = z.infer<typeof testimonialSchema>;

export const sectionSchemas = {
  inicio: stamped({
    hero: z.object({
      title: req(60),
      highlight: text(30),
      subtitle: text(160),
      primaryCta: req(30),
      secondaryCta: text(30),
      image: contentImageSchema,
    }),
    titles: z.object({
      categories: req(40),
      featured: req(40),
      newArrivals: req(40),
      care: req(40),
      testimonials: req(40),
      faq: req(40),
    }),
    resellerBand: z.object({
      show: z.boolean(),
      title: req(60),
      text: text(200),
      cta: req(30),
      image: contentImageSchema,
    }),
    careTips: z.array(titledItem(40, 160)).max(3, 'No máximo 3 dicas.'),
    instagram: z.array(listImageSchema).max(6, 'No máximo 6 fotos.'),
  }),
  depoimentos: stamped({
    items: z.array(testimonialSchema).max(12, 'No máximo 12 depoimentos.'),
  }),
  perguntas: stamped({
    items: z.array(qaItem).max(15, 'No máximo 15 perguntas.'),
  }),
  sobre: stamped({
    header: pageHeaderSchema,
    /** Paragraphs separated by a blank line. */
    story: req(4000),
    signature: text(40),
    /** Optional photo beside the story (the brand emblem when empty). */
    image: contentImageSchema.nullable(),
    valuesTitle: req(60),
    values: z.array(titledItem(40, 240)).max(6, 'No máximo 6 itens.'),
  }),
  cuidados: stamped({
    header: pageHeaderSchema,
    steps: z.array(titledItem(60, 300)).min(1, 'Deixe pelo menos 1 cuidado.').max(12, 'No máximo 12 cuidados.'),
    why: z.object({ title: text(60), text: text(1500) }),
    /** Short tips in the "Cuidados" box of every product page. */
    productTips: z.array(textItem(140)).max(6, 'No máximo 6 dicas.'),
  }),
  garantia: stamped({
    covered: z.array(textItem(200)).max(10, 'No máximo 10 itens.'),
    notCovered: z.array(textItem(200)).max(10, 'No máximo 10 itens.'),
    steps: z.array(textItem(240)).max(6, 'No máximo 6 passos.'),
    exchanges: text(800),
    /** Text of the warranty box on every product page. */
    productText: text(300),
  }),
  revendedoras: stamped({
    hero: z.object({
      eyebrow: text(40),
      title: req(80),
      highlight: text(30),
      text: text(300),
      cta: req(30),
      image: contentImageSchema,
    }),
    stepsTitle: req(60),
    steps: z.array(titledItem(60, 240)).max(6, 'No máximo 6 passos.'),
    benefitsTitle: req(60),
    benefits: z.array(titledItem(60, 200)).max(6, 'No máximo 6 vantagens.'),
    faqTitle: req(60),
    faq: z.array(qaItem).max(10, 'No máximo 10 perguntas.'),
    formTitle: req(60),
    formIntro: text(300),
    /** Line under "Seja revendedora" in the store menu. */
    menuText: text(60),
  }),
  contato: stamped({
    header: pageHeaderSchema,
    quickTitle: req(60),
  }),
  geral: stamped({
    footerTagline: text(120),
    bagEmptyTitle: req(60),
    bagEmptyText: text(200),
    afterOrderText: req(300),
    /** Not-found page, piece case (a piece that left the catalog or whose link changed). */
    notFoundTitle: req(60),
    notFoundText: text(200),
    /*
     * Added later, so optional: a section saved before them still validates, and the missing
     * fields show the built-in text (resolveSection fills them in).
     */
    categoryNotFoundTitle: req(60).optional(),
    categoryNotFoundText: text(200).optional(),
    pageNotFoundTitle: req(60).optional(),
    pageNotFoundText: text(200).optional(),
    /** Title of the row of suggested pieces on the not-found page; empty hides the row. */
    notFoundSuggestions: text(40).optional(),
  }),
  privacidade: stamped({
    header: pageHeaderSchema,
    blocks: z.array(titledItem(80, 3000)).min(1, 'Deixe pelo menos 1 bloco.').max(20, 'No máximo 20 blocos.'),
  }),
  compartilhar: stamped({
    /** <title> of the home page and the default title in link previews. */
    title: req(70),
    /** Google snippet and link preview text. */
    description: req(160),
    /** Picture of link previews (the built-in share picture when empty). */
    image: contentImageSchema.nullable(),
  }),
  loja: stamped({
    hypoallergenic: z.boolean().nullable(),
    shipsNationwide: z.boolean().nullable(),
    /** Interest-free installments (0 = not mentioned). */
    installments: z.number().int().min(0).max(24),
    /** Plating, e.g. "banho de ouro 18k" (empty = not mentioned). */
    plating: text(120),
    consignment: z.boolean().nullable(),
    noUpfrontInvestment: z.boolean().nullable(),
  }),
} satisfies Record<SectionId, z.ZodType>;

export type Sections = { [K in SectionId]: z.infer<(typeof sectionSchemas)[K]> };
export type SectionData<K extends SectionId> = Sections[K];

/** The stored sections (partial: a missing section shows the built-in text). */
export type SiteContent = Partial<Sections>;
// Not strict and each section falls back on its own: a section this build does not understand
// (newer app, older cache) shows the built-in text instead of breaking the whole catalog.
const sectionShape = {} as Record<SectionId, z.ZodType>;
for (const sid of SECTION_IDS) sectionShape[sid] = (sectionSchemas[sid] as z.ZodType).optional().catch(undefined);
export const siteContentSchema = z
  .object(sectionShape)
  .transform((sections) => Object.fromEntries(Object.entries(sections).filter(([, v]) => v !== undefined))) as unknown as z.ZodType<SiteContent>;


/** Validates a section by id; returns the parsed data or the first problem. */
export function parseSection<K extends SectionId>(id: K, data: unknown): { ok: true; data: Sections[K] } | { ok: false; error: string; path: string } {
  const r = sectionSchemas[id].safeParse(data);
  if (r.success) return { ok: true, data: r.data as Sections[K] };
  const issue = r.error.issues[0];
  return { ok: false, error: issue?.message ?? 'Dados inválidos.', path: (issue?.path ?? []).join('.') };
}

/** Every image source used by the stored content (for upload, existence checks and backups). */
export function contentImageSources(content: SiteContent | undefined): string[] {
  if (!content) return [];
  const out: string[] = [];
  const push = (img: ContentImage | null | undefined) => {
    if (!img) return;
    out.push(img.src, ...(img.thumb ? [img.thumb] : []));
  };
  const s = content;
  if (s.inicio) {
    push(s.inicio.hero.image);
    push(s.inicio.resellerBand.image);
    for (const img of s.inicio.instagram) push(img);
  }
  push(s.sobre?.image);
  push(s.revendedoras?.hero.image);
  push(s.compartilhar?.image);
  return out;
}

/** Applies `fn` to every image of a section (immutably), e.g. to swap data URLs for uploaded keys. */
export function mapSectionImages<K extends SectionId>(id: K, data: Sections[K], fn: (img: ContentImage) => ContentImage): Sections[K] {
  const d = data as Sections[SectionId];
  switch (id) {
    case 'inicio': {
      const s = d as Sections['inicio'];
      return {
        ...s,
        hero: { ...s.hero, image: fn(s.hero.image) },
        resellerBand: { ...s.resellerBand, image: fn(s.resellerBand.image) },
        instagram: s.instagram.map((img) => ({ ...fn(img), id: img.id })),
      } as Sections[K];
    }
    case 'sobre': {
      const s = d as Sections['sobre'];
      return { ...s, image: s.image ? fn(s.image) : null } as Sections[K];
    }
    case 'revendedoras': {
      const s = d as Sections['revendedoras'];
      return { ...s, hero: { ...s.hero, image: fn(s.hero.image) } } as Sections[K];
    }
    case 'compartilhar': {
      const s = d as Sections['compartilhar'];
      return { ...s, image: s.image ? fn(s.image) : null } as Sections[K];
    }
    default:
      return data;
  }
}

/** New stable id for a list item. */
export function newItemId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `i${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Splits a long text into paragraphs (blank line = new paragraph; single line breaks are kept inside). */
export const paragraphs = (value: string): string[] =>
  value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
