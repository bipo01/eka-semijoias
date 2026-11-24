import { describe, expect, it } from 'vitest';
import { defaultSections, factsOf, resolveSection, type ContentFacts } from '../content/defaults';
import { applyChanges, changeSetSchema, chunkChanges, diffCatalog, imageSourcesOf } from './changes';
import { contentImageSources, mapSectionImages, paragraphs, parseSection, SECTION_IDS, sectionSchemas, siteContentSchema } from './content';
import { catalogSchema } from './schema';
import { createCatalogSeed } from './seed';

const none: ContentFacts = { warrantyMonths: null, whatsapp: null, shipsNationwide: null, hypoallergenic: null, installments: null, plating: null, consignment: null, noUpfrontInvestment: null };
const all: ContentFacts = { warrantyMonths: 6, whatsapp: '5565999998888', shipsNationwide: true, hypoallergenic: true, installments: 3, plating: 'banho de ouro 18k', consignment: true, noUpfrontInvestment: true };
const MEDIA = `media/${'a'.repeat(64)}.webp`;

describe('built-in section texts', () => {
  it('are valid for every section, whatever the facts', () => {
    for (const facts of [none, all]) {
      const sections = defaultSections(facts);
      for (const id of SECTION_IDS) {
        const r = parseSection(id, sections[id]);
        expect(r, `${id}: ${r.ok ? '' : `${r.path} ${r.error}`}`).toMatchObject({ ok: true });
      }
    }
  });

  it('never claim unconfirmed facts', () => {
    const s = defaultSections(none);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/todo o Brasil|banho de qualidade|Sem investimento inicial|consignado|antialérgic/i);
    expect(s.perguntas.items.map((q) => q.id)).toEqual(['faq-pedido', 'faq-banho', 'faq-esgotada']);
    const withFacts = defaultSections(all);
    expect(withFacts.perguntas.items.map((q) => q.id)).toEqual(['faq-pedido', 'faq-garantia', 'faq-envio', 'faq-banho', 'faq-esgotada']);
    expect(withFacts.perguntas.items[1]!.answer).toContain('Garantia de 6 meses');
    expect(withFacts.revendedoras.benefits[0]!.title).toBe('Sem investimento inicial');
    expect(withFacts.revendedoras.faq[1]!.answer).toContain('consignado');
  });

  it('start without invented testimonials', () => {
    expect(defaultSections(all).depoimentos.items).toEqual([]);
  });

  it('use no banned words of the public site', () => {
    const text = JSON.stringify(defaultSections(all)).toLowerCase();
    for (const word of ['exemplo', 'demonstração', 'prévia', 'placeholder', 'ilustrativa', 'pendente', 'lorem']) expect(text).not.toContain(word);
  });
});

describe('facts', () => {
  it('layer the "loja" section over the built-in facts', () => {
    const seed = createCatalogSeed();
    const base = factsOf(seed.settings, undefined);
    expect(base.hypoallergenic).toBeNull();
    const loja = { hypoallergenic: true, shipsNationwide: false, installments: 0, plating: '  ', consignment: null, noUpfrontInvestment: true };
    const f = factsOf({ ...seed.settings, warrantyMonths: 0 }, { loja });
    expect(f).toMatchObject({ hypoallergenic: true, shipsNationwide: false, installments: null, plating: null, noUpfrontInvestment: true, warrantyMonths: null });
  });

  it('resolve to the saved section when there is one', () => {
    const saved = { ...defaultSections(none).contato, quickTitle: 'Escreva aqui' };
    expect(resolveSection('contato', { contato: saved }, none).quickTitle).toBe('Escreva aqui');
    expect(resolveSection('contato', {}, none).quickTitle).toBe('Mensagem rápida');
  });
});

describe('section schemas', () => {
  const testimonial = { id: 't1', text: 'Amei o brinco!', name: 'Ana', city: 'Cuiabá/MT', visible: true, authorized: true };

  it('trim texts and enforce the limits', () => {
    const r = parseSection('contato', { header: { eyebrow: ' Contato ', title: '  Fale  ', highlight: '', intro: '' }, quickTitle: 'x' });
    expect(r.ok && r.data.header.title).toBe('Fale');
    expect(parseSection('contato', { header: { eyebrow: '', title: '   ', highlight: '', intro: '' }, quickTitle: 'x' })).toMatchObject({ ok: false, path: 'header.title' });
    expect(parseSection('geral', { ...defaultSections(none).geral, footerTagline: 'a'.repeat(121) })).toMatchObject({ ok: false, path: 'footerTagline' });
  });

  it('require the customer authorization on every testimonial', () => {
    expect(parseSection('depoimentos', { items: [testimonial] }).ok).toBe(true);
    const r = parseSection('depoimentos', { items: [{ ...testimonial, authorized: false }] });
    expect(r).toMatchObject({ ok: false, path: 'items.0.authorized' });
    expect(parseSection('depoimentos', { items: Array.from({ length: 13 }, (_, i) => ({ ...testimonial, id: `t${i}` })) }).ok).toBe(false);
  });

  it('refuse images that are not built-in, uploaded or data URLs', () => {
    const inicio = defaultSections(none).inicio;
    expect(parseSection('inicio', { ...inicio, hero: { ...inicio.hero, image: { src: 'https://evil.example/x.png', alt: '' } } }).ok).toBe(false);
    expect(parseSection('inicio', { ...inicio, hero: { ...inicio.hero, image: { src: MEDIA, alt: 'Foto' } } }).ok).toBe(true);
  });

  it('a stored section this build cannot read falls back to the built-in text instead of breaking the catalog', () => {
    const parsed = siteContentSchema.parse({ contato: { nonsense: true }, futura: { x: 1 } });
    expect(parsed).toEqual({});
    const catalog = { ...createCatalogSeed(), content: { geral: defaultSections(none).geral, contato: 42 } };
    const r = catalogSchema.safeParse(catalog);
    expect(r.success).toBe(true);
    expect(r.success && Object.keys(r.data.content ?? {})).toEqual(['geral']);
  });

  it('every section id has a schema', () => {
    expect(Object.keys(sectionSchemas).sort()).toEqual([...SECTION_IDS].sort());
  });
});

describe('content change sets', () => {
  const seed = () => createCatalogSeed();
  const geral = { ...defaultSections(none).geral, footerTagline: 'Nova frase' };

  it('diff and apply: save, change, restore', () => {
    const a = seed();
    const b = { ...a, content: { geral } };
    const save = diffCatalog(a, b);
    expect(save).toEqual([{ kind: 'content', op: 'upsert', id: 'geral', data: geral }]);
    expect(applyChanges(a, save).content).toEqual({ geral });
    expect(diffCatalog(b, { ...b, content: { geral: { ...geral } } })).toEqual([]);
    const restore = diffCatalog(b, { ...b, content: {} });
    expect(restore).toEqual([{ kind: 'content', op: 'delete', id: 'geral' }]);
    expect(applyChanges(b, restore).content).toEqual({});
  });

  it('validate each section with the schema of its id', () => {
    const ok = changeSetSchema.safeParse({ baseVersion: 1, changes: [{ kind: 'content', op: 'upsert', id: 'geral', data: { ...geral, footerTagline: '  Frase  ' } }] });
    expect(ok.success && (ok.data.changes[0] as { data: { footerTagline: string } }).data.footerTagline).toBe('Frase');
    const unknown = changeSetSchema.safeParse({ baseVersion: 1, changes: [{ kind: 'content', op: 'upsert', id: 'banner', data: {} }] });
    expect(unknown.success).toBe(false);
    const bad = changeSetSchema.safeParse({ baseVersion: 1, changes: [{ kind: 'content', op: 'upsert', id: 'geral', data: { ...geral, bagEmptyTitle: '' } }] });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.some((i) => i.path.join('.') === 'changes.0.data.bagEmptyTitle')).toBe(true);
    expect(changeSetSchema.safeParse({ baseVersion: 1, changes: [{ kind: 'content', op: 'delete', id: 'geral' }] }).success).toBe(true);
  });

  it('content goes first in a chunked change set', () => {
    const changes = diffCatalog(seed(), { ...seed(), content: { geral }, settings: { ...seed().settings, announcement: 'Oi' } });
    expect(chunkChanges(changes)[0]!.map((c) => c.kind)).toEqual(['settings', 'content']);
  });

  it('images of the content are listed and swapped', () => {
    const inicio = defaultSections(none).inicio;
    const edited = { ...inicio, hero: { ...inicio.hero, image: { src: MEDIA, alt: 'x' } } };
    const content = { inicio: edited, compartilhar: { ...defaultSections(none).compartilhar, image: { src: 'images/lifestyle/l01-colo', alt: '' } } };
    const sources = contentImageSources(content);
    expect(sources).toContain(MEDIA);
    expect(sources).toContain('images/lifestyle/l01-colo');
    expect(sources).toContain('images/lifestyle/l02-mostruario-revendedora');
    expect(imageSourcesOf({ products: [], collections: [], content })).toEqual(sources);
    const swapped = mapSectionImages('inicio', edited, (img) => ({ ...img, src: img.src === MEDIA ? 'images/x' : img.src }));
    expect(swapped.hero.image.src).toBe('images/x');
    expect(swapped.instagram.map((i) => i.id)).toEqual(inicio.instagram.map((i) => i.id));
  });
});

describe('paragraphs', () => {
  it('split on blank lines and keep single line breaks', () => {
    expect(paragraphs('Um\nlinha\n\n\nDois\n  \nTrês ')).toEqual(['Um\nlinha', 'Dois', 'Três']);
  });
});
