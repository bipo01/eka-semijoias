import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCatalogSeed } from '../../data/seed';
import { useCatalog } from '../../store/catalog';
import { OrderItemsEditor } from './OrderItemsEditor';

/*
 * The piece picker of "Novo pedido", "Editar peças" and the reseller kit: the whole catalog, split by
 * category (sections under "Todas", one category per chip), searchable, with no cap on the list.
 */

const seed = createCatalogSeed();

function show(catalog = seed) {
  useCatalog.setState({ data: catalog, version: 1, status: 'ready', offline: false });
  return render(<OrderItemsEditor lines={[]} onChange={() => {}} />);
}

const catalogList = () => screen.getByRole('list', { name: 'Peças do catálogo' });

describe('piece picker', () => {
  beforeEach(() => useCatalog.setState({ data: seed, version: 1, status: 'ready', offline: false }));

  it('lists every piece split into her categories, in her order, with a heading each', () => {
    show();
    const order = [...seed.categories].sort((a, b) => a.order - b.order).filter((c) => seed.products.some((p) => p.categoryId === c.id));
    const headings = within(catalogList()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.trim());
    expect(headings).toEqual(order.map((c) => c.name));
    for (const c of order) {
      const pieces = within(screen.getByRole('list', { name: `Peças de ${c.name}` })).getAllByRole('button');
      expect(pieces).toHaveLength(seed.products.filter((p) => p.categoryId === c.id).length);
    }
  });

  it('a category chip shows only its pieces (with its count), "Todas" brings everything back', async () => {
    const user = userEvent.setup();
    show();
    const brincos = seed.categories.find((c) => c.name === 'Brincos')!;
    const count = seed.products.filter((p) => p.categoryId === brincos.id).length;
    await user.click(screen.getByRole('button', { name: `Brincos ${count}` }));
    expect(screen.getByRole('button', { name: `Brincos ${count}` })).toHaveAttribute('aria-pressed', 'true');
    expect(within(catalogList()).queryAllByRole('heading')).toHaveLength(0);
    expect(within(catalogList()).getAllByRole('button')).toHaveLength(count);
    await user.click(screen.getByRole('button', { name: new RegExp(`^Todas ${seed.products.length}$`) }));
    expect(within(catalogList()).getAllByRole('button')).toHaveLength(seed.products.length);
  });

  it('search narrows every section; inside a category without a match it offers the other categories', async () => {
    const user = userEvent.setup();
    show();
    const colares = seed.categories.find((c) => c.name === 'Colares')!;
    await user.click(screen.getByRole('button', { name: new RegExp(`^Colares \\d+$`) }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar peça' }), 'argola');
    expect(screen.queryByRole('list', { name: 'Peças do catálogo' })).not.toBeInTheDocument();
    expect(screen.getByText(`Nenhuma peça com esse nome em ${colares.name}.`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ver em todas as categorias/ }));
    expect(within(catalogList()).getAllByRole('button').every((b) => /argola/i.test(b.textContent ?? ''))).toBe(true);
  });

  it('never stops at the first 30 pieces: a big catalog is fully reachable without typing', () => {
    const base = seed.products[0]!;
    const many = Array.from({ length: 45 }, (_, i) => ({ ...base, id: `p-many-${i}`, slug: `peca-${i}`, name: `Peça ${i + 1}`, order: i }));
    show({ ...seed, products: many });
    expect(within(catalogList()).getAllByRole('button')).toHaveLength(45);
  });
});
