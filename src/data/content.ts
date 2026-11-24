import { z } from 'zod';
import { FRAME_DEFAULT, INTERVAL_DEFAULT, INTERVAL_MAX, INTERVAL_MIN, SLIDES_MAX, ZOOM_MAX, ZOOM_MIN, type HeroFrameId } from './heroFrames';
import { imageSrc } from './imageSrc';

/*
 * Site content the owner edits in Painel → Site (docs/conteudo/PLAN.md). Each
 * section is one catalog entity (change kind 'content', id = section id); only
 * edited sections are stored and published in the snapshot (`catalog.content`),
 * every other section shows the built-in text from src/content/defaults.ts.
 * Shared by the browser and the Worker: the server validates every section
 * with the schema of its id.
 */

export const SECTION_IDS = ['inicio', 'depoimentos', 'perguntas', 'sobre', 'cuidados', 'garantia', 'revendedoras', 'contato', 'geral', 'privacidade', 'compartilhar', 'loja', 'pagamento', 'revenda'] as const;
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
  pagamento: 'Página de pagamento',
  revenda: 'Painel da revendedora',
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
  // Name and city are optional: some testimonials go out with the comment only.
  name: text(40),
  city: text(40),
  // No "hidden" state on purpose: the snapshot is public, so a testimonial that leaves the site is deleted.
  /** The customer agreed to the publication (required to save). */
  authorized: z.literal(true, { error: 'Confirme que a cliente autorizou publicar.' }),
});
export type Testimonial = z.infer<typeof testimonialSchema>;

/** "Name · City", either one alone, or nothing (a testimonial may go out with the comment only). */
export const testimonialSignature = (t: { name: string; city: string }) => [t.name.trim(), t.city.trim()].filter(Boolean).join(' · ');

const percent = z.number().int('Use um número inteiro.').min(0, 'Escolha um ponto dentro da foto.').max(100, 'Escolha um ponto dentro da foto.');

/** How a slide shows on one screen shape (src/data/heroFrames.ts): its own photo and/or framing. */
export const heroFrameSchema = z.object({
  /** A photo only for this screen; without it the frame shows the slide's main photo. */
  image: contentImageSchema.optional(),
  /** Focus point, in % of the photo from the left/top: it stays in place when zooming. */
  x: percent.default(FRAME_DEFAULT.x),
  y: percent.default(FRAME_DEFAULT.y),
  zoom: z.number().min(ZOOM_MIN, `O zoom vai de ${ZOOM_MIN * 100}% a ${ZOOM_MAX * 100}%.`).max(ZOOM_MAX, `O zoom vai de ${ZOOM_MIN * 100}% a ${ZOOM_MAX * 100}%.`).default(FRAME_DEFAULT.zoom),
});
export type HeroFrame = z.infer<typeof heroFrameSchema>;

export const heroSlideSchema = z.object({
  id: itemIdSchema,
  alt: text(200),
  /** The main photo, used by every frame without its own. */
  image: contentImageSchema,
  /** Only the frames she adjusted (a missing one is the main photo, centered). */
  frames: z
    .object({
      celular: heroFrameSchema.optional(),
      tablet: heroFrameSchema.optional(),
      quadrado: heroFrameSchema.optional(),
      computador: heroFrameSchema.optional(),
      amplo: heroFrameSchema.optional(),
    } satisfies Record<HeroFrameId, z.ZodType>)
    .default({}),
});
export type HeroSlide = z.infer<typeof heroSlideSchema>;

/**
 * The hero was one photo (`image`) before the slider: a stored section of that time reads as a
 * single slide with the automatic framing, so nothing she saved breaks.
 */
function migrateHero(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { image, ...rest } = value as Record<string, unknown> & { image?: unknown };
  if ('slides' in rest || image === undefined) return rest;
  const alt = image && typeof image === 'object' && typeof (image as { alt?: unknown }).alt === 'string' ? (image as { alt: string }).alt : '';
  return { ...rest, slides: [{ id: 'principal', alt, image, frames: {} }] };
}

export const sectionSchemas = {
  inicio: stamped({
    hero: z.preprocess(
      migrateHero,
      z.object({
        title: req(60),
        highlight: text(30),
        subtitle: text(160),
        primaryCta: req(30),
        secondaryCta: text(30),
        slides: z.array(heroSlideSchema).min(1, 'Deixe pelo menos 1 foto.').max(SLIDES_MAX, `No máximo ${SLIDES_MAX} fotos.`),
        /** Seconds between slides. */
        interval: z
          .number()
          .int('Use um número inteiro.')
          .min(INTERVAL_MIN, `Escolha entre ${INTERVAL_MIN} e ${INTERVAL_MAX} segundos.`)
          .max(INTERVAL_MAX, `Escolha entre ${INTERVAL_MIN} e ${INTERVAL_MAX} segundos.`)
          .default(INTERVAL_DEFAULT),
      }),
    ),
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
  /*
   * Texts of the payment link page (/pagamento/<token>). Texts with a value in the middle take the
   * message variables ({pedido}, {primeiro_nome}, {total}) and optional [ … ] parts, rendered with
   * renderTemplate (src/data/messages.ts) like the WhatsApp templates.
   */
  pagamento: stamped({
    header: z.object({
      /** Followed by "nº <number>". */
      title: req(60),
      /** Line above the title per situation (after "Oi, <name>! "). */
      waiting: req(40),
      review: req(40),
      paid: req(40),
      cancelled: req(40),
    }),
    pix: z.object({
      title: req(40),
      step1: req(200),
      /** {total} */
      step2: req(200),
      step3: req(200),
      qrHint: text(120),
      /** Shown instead of the Pix when the store has no Pix key. */
      unavailable: req(300),
    }),
    autoPix: z.object({
      intro: req(300),
      /** {total} */
      step2: req(200),
      step3: req(200),
      notYet: req(200),
    }),
    receipt: z.object({
      title: req(60),
      againTitle: req(60),
    }),
    status: z.object({
      paidTitle: req(60),
      /** {primeiro_nome}, {pedido} */
      paidText: req(300),
      reviewTitle: req(60),
      /** {primeiro_nome} */
      reviewText: req(300),
      cancelledTitle: req(60),
      cancelledText: req(300),
    }),
    problem: z.object({
      goneTitle: req(80),
      failedTitle: req(80),
      /** WhatsApp message of the problem page. */
      message: req(300),
    }),
    help: z.object({
      question: text(80),
      /** WhatsApp messages, {pedido}. */
      message: req(300),
      cancelledMessage: req(300),
    }),
  }),
  /** Texts of the reseller panel (/revenda). Greetings take {primeiro_nome}. */
  revenda: stamped({
    login: z.object({
      title: req(60),
      text: text(200),
      forgot: text(200),
    }),
    invite: z.object({
      /** {primeiro_nome} */
      greeting: text(60),
      title: req(60),
      text: text(200),
      textNoContract: text(200),
      goneTitle: req(60),
      welcome: req(120),
    }),
    contract: z.object({
      updateTitle: req(80),
      updateText: text(200),
      accepted: req(120),
    }),
    panel: z.object({
      /** {primeiro_nome} */
      greeting: text(60),
      title: req(60),
      topTier: req(120),
      showcaseTitle: req(60),
      showcaseText: text(200),
      installText: text(200),
    }),
    kit: z.object({
      empty: req(200),
      soldOut: req(120),
    }),
    sale: z.object({
      phoneHint: text(120),
      done: text(200),
      registered: req(120),
      undone: req(120),
    }),
    history: z.object({
      salesEmpty: req(120),
      settlementsEmpty: req(120),
    }),
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
    for (const slide of s.inicio.hero.slides) {
      push(slide.image);
      for (const frame of Object.values(slide.frames)) push(frame?.image);
    }
    push(s.inicio.resellerBand.image);
    for (const img of s.inicio.instagram) push(img);
  }
  push(s.sobre?.image);
  push(s.revendedoras?.hero.image);
  push(s.compartilhar?.image);
  return out;
}

function mapSlideImages(slide: HeroSlide, fn: (img: ContentImage) => ContentImage): HeroSlide {
  const frames: HeroSlide['frames'] = {};
  for (const [id, frame] of Object.entries(slide.frames) as [HeroFrameId, HeroFrame | undefined][]) {
    if (frame) frames[id] = frame.image ? { ...frame, image: fn(frame.image) } : frame;
  }
  return { ...slide, image: fn(slide.image), frames };
}

/** Applies `fn` to every image of a section (immutably), e.g. to swap data URLs for uploaded keys. */
export function mapSectionImages<K extends SectionId>(id: K, data: Sections[K], fn: (img: ContentImage) => ContentImage): Sections[K] {
  const d = data as Sections[SectionId];
  switch (id) {
    case 'inicio': {
      const s = d as Sections['inicio'];
      return {
        ...s,
        hero: { ...s.hero, slides: s.hero.slides.map((slide) => mapSlideImages(slide, fn)) },
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
