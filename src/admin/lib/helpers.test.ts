import { describe, expect, it } from 'vitest';
import { formatPhone, maskPhone, parseInstagram, parsePhone, whatsappDigits } from './contact';
import { move, reorderSubset } from './reorder';
import { leadsCsv } from '../sections/LeadsPage';
import { deleteCategory } from '../sections/CategoriesPage';
import { deleteCollection, upsertCollection } from '../sections/CollectionsPage';
import { parseStoreForm } from '../sections/SettingsPage';
import { createSeed } from '../../data/seed';

describe('contact helpers', () => {
  it('masks and parses Brazilian phones', () => {
    expect(maskPhone('67999998888')).toBe('(67) 99999-8888');
    expect(maskPhone('6733334444')).toBe('(67) 3333-4444');
    expect(maskPhone('5567999998888')).toBe('(67) 99999-8888');
    expect(parsePhone('(67) 99999-8888')).toBe('5567999998888');
    expect(parsePhone('')).toBe('');
    expect(parsePhone('(67) 9999')).toBeNull();
    expect(formatPhone('5567999998888')).toBe('(67) 99999-8888');
  });

  it('prefixes 55 to local WhatsApp numbers only', () => {
    expect(whatsappDigits('(67) 99999-8888')).toBe('5567999998888');
    expect(whatsappDigits('5567999998888')).toBe('5567999998888');
  });

  it('extracts the Instagram handle', () => {
    expect(parseInstagram('@ekasemijoias')).toBe('ekasemijoias');
    expect(parseInstagram('https://www.instagram.com/ekasemijoias/?hl=pt')).toBe('ekasemijoias');
    expect(parseInstagram(' eka.semi ')).toBe('eka.semi');
  });
});

describe('reorder', () => {
  it('moves an item', () => {
    expect(move(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(move(['a', 'b', 'c'], 2, 9)).toEqual(['a', 'b', 'c']);
  });

  it('reorders a filtered subset inside the slots it occupied', () => {
    const all = [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
      { id: 'd', order: 3 },
    ];
    const orders = reorderSubset(all, ['d', 'b']); // only b and d visible; d moved above b
    expect([...orders.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id)).toEqual(['a', 'd', 'c', 'b']);
  });
});

describe('settings form', () => {
  const base = { announcement: ' Oi ', whatsapp: '(67) 99999-8888', instagram: '@eka', city: 'Campo Grande/MS', showroom: '', openingHours: '', warrantyMonths: '6' };
  it('stores WhatsApp with 55 and the bare Instagram handle', () => {
    const result = parseStoreForm(base);
    expect(result.ok && result.patch).toMatchObject({ announcement: 'Oi', whatsapp: '5567999998888', instagram: 'eka', warrantyMonths: 6 });
  });
  it('rejects an incomplete phone and an out-of-range warranty', () => {
    const result = parseStoreForm({ ...base, whatsapp: '(67) 9999', warrantyMonths: '99' });
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['warrantyMonths', 'whatsapp']);
  });
});

describe('categories and collections', () => {
  it('moves products to another category when deleting one', () => {
    const data = createSeed();
    const next = deleteCategory(data, 'cat-brincos', 'cat-colares', 'now');
    expect(next.categories.some((c) => c.id === 'cat-brincos')).toBe(false);
    expect(next.products.some((p) => p.categoryId === 'cat-brincos')).toBe(false);
    expect(next.categories.map((c) => c.order)).toEqual(next.categories.map((_, i) => i));
  });

  it('removes a deleted collection from products', () => {
    const next = deleteCollection(createSeed(), 'col-rose', 'now');
    expect(next.products.some((p) => p.collectionIds.includes('col-rose'))).toBe(false);
  });

  it('keeps a single collection on the home page', () => {
    const data = createSeed();
    const presentes = data.collections.find((c) => c.id === 'col-presentes')!;
    const next = upsertCollection(data, { ...presentes, featuredOnHome: true });
    expect(next.collections.filter((c) => c.featuredOnHome).map((c) => c.id)).toEqual(['col-presentes']);
  });
});

describe('leads CSV', () => {
  it('exports newest first with formatted phone and neutralized formulas', () => {
    const csv = leadsCsv([
      { id: '1', name: 'Ana', whatsapp: '67999998888', city: 'Dourados', uf: 'MS', alreadySells: false, createdAt: '2026-11-01T10:00:00.000Z' },
      { id: '2', name: '=cmd()', whatsapp: '67988887777', city: 'Campo Grande', uf: 'MS', alreadySells: true, createdAt: '2026-11-02T10:00:00.000Z' },
    ]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Nome;WhatsApp;Cidade;UF;Instagram;Já revende;Origem;Data');
    expect(lines[1]!.startsWith("'=cmd();(67) 98888-7777;Campo Grande;MS;;Sim;;")).toBe(true);
    expect(lines[2]!.startsWith('Ana;(67) 99999-8888;Dourados;MS;;Não;;')).toBe(true);
  });
});
