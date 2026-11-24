import { describe, expect, it } from 'vitest';
import { defaultSections, factsOf } from '../../../content/defaults';
import { createCatalogSeed } from '../../../data/seed';
import { getIn, isNullable, isRequired, listLimits, overLimit, putSection, removeSection, setIn, textLimit, validateSection } from './sectionDraft';

const defaults = () => {
  const seed = createCatalogSeed();
  return defaultSections(factsOf(seed.settings, undefined));
};

describe('limits read from the section schemas', () => {
  it('finds text limits, nested and inside list items', () => {
    expect(textLimit('inicio', ['hero', 'title'])).toBe(60);
    expect(textLimit('sobre', ['story'])).toBe(4000);
    expect(textLimit('perguntas', ['items', 0, 'answer'])).toBe(800);
    expect(textLimit('depoimentos', ['items', 3, 'text'])).toBe(400);
    expect(textLimit('sobre', ['image', 'alt'])).toBe(200); // through the nullable image
    expect(textLimit('inicio', ['nope'])).toBe(0);
  });

  it('knows which texts are required and which images may be removed', () => {
    expect(isRequired('contato', ['header', 'title'])).toBe(true);
    expect(isRequired('contato', ['header', 'eyebrow'])).toBe(false);
    expect(isNullable('sobre', ['image'])).toBe(true);
    expect(isNullable('compartilhar', ['image'])).toBe(true);
    expect(isNullable('inicio', ['hero', 'image'])).toBe(false);
  });

  it('finds list limits', () => {
    expect(listLimits('depoimentos', ['items'])).toEqual({ min: 0, max: 12 });
    expect(listLimits('cuidados', ['steps'])).toEqual({ min: 1, max: 12 });
    expect(listLimits('inicio', ['instagram'])).toEqual({ min: 0, max: 6 });
  });
});

describe('draft updates', () => {
  it('sets a nested value without touching the rest', () => {
    const before = defaults().inicio;
    const after = setIn(before, ['hero', 'title'], 'Novo título');
    expect(getIn(after, ['hero', 'title'])).toBe('Novo título');
    expect(before.hero.title).toBe('Brilho que acompanha');
    expect(after.titles).toBe(before.titles);
  });

  it('sets a value inside a list item', () => {
    const before = defaults().perguntas;
    const after = setIn(before, ['items', 1, 'question'], 'Outra?');
    expect(after.items[1]!.question).toBe('Outra?');
    expect(Array.isArray(after.items)).toBe(true);
    expect(after.items[0]).toBe(before.items[0]);
  });
});

describe('validateSection', () => {
  it('accepts every built-in section', () => {
    const all = defaults();
    for (const id of Object.keys(all) as (keyof typeof all)[]) expect(validateSection(id, all[id]).ok).toBe(true);
  });

  it('maps every problem to its field key, in schema order', () => {
    const draft = setIn(setIn(defaults().contato, ['header', 'title'], '  '), ['quickTitle'], 'x'.repeat(61));
    const result = validateSection('contato', draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.order).toEqual(['header.title', 'quickTitle']);
    expect(result.errors['header.title']).toBe('Preencha este campo.');
    expect(result.errors.quickTitle).toBe('Use no máximo 60 caracteres.');
  });

  it('requires the authorization of every testimonial', () => {
    const draft = { items: [{ id: 'd1', text: 'Amei!', name: 'Ana', city: '', visible: true, authorized: false }] };
    const result = validateSection('depoimentos', draft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['items.0.authorized']).toBe('Confirme que a cliente autorizou publicar.');
    expect(validateSection('depoimentos', { items: [{ ...draft.items[0], authorized: true }] }).ok).toBe(true);
  });

  it('trims texts on the way out', () => {
    const result = validateSection('contato', setIn(defaults().contato, ['quickTitle'], '  Fale já  '));
    expect(result.ok && result.data.quickTitle).toBe('Fale já');
  });

  it('flags a text over its limit while typing (trimmed length)', () => {
    expect(overLimit('abc  ', 3)).toBeUndefined();
    expect(overLimit('abcd', 3)).toBe('Use no máximo 3 caracteres (agora são 4).');
  });
});

describe('save and restore', () => {
  it('puts the section with the moment of the save, and restoring removes it', () => {
    const catalog = createCatalogSeed();
    const saved = putSection(catalog, 'contato', defaults().contato, '2026-11-24T10:00:00.000Z');
    expect(saved.content?.contato).toEqual({ ...defaults().contato, updatedAt: '2026-11-24T10:00:00.000Z' });
    expect(saved.products).toBe(catalog.products);
    const restored = removeSection(saved, 'contato');
    expect(restored.content).toEqual({});
    expect(restored.content).not.toHaveProperty('contato');
  });
});
