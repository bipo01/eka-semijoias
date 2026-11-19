import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSeed } from '../../data/seed';
import { useCatalog } from '../../store/catalog';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../testUtils';
import { buildProduct, draftFromProduct, duplicateDraft, emptyDraft } from './productDraft';
import { restoreProduct } from './ProductForm';

polyfillDialog();
resetStores();
afterEach(() => vi.restoreAllMocks());

const NOW = '2026-11-19T15:00:00.000Z';

describe('buildProduct', () => {
  it('rejects a promo price equal to or above the price', () => {
    const data = createSeed();
    const draft = { ...draftFromProduct(data.products[0]!), price: '129,90', promo: '129,90' };
    const result = buildProduct(draft, data, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.promo).toBe('O preço promocional precisa ser menor que o preço.');
    expect(buildProduct({ ...draft, promo: '150,00' }, data, NOW).ok).toBe(false);
  });

  it('accepts a valid promo and stores centavos', () => {
    const data = createSeed();
    const result = buildProduct({ ...draftFromProduct(data.products[0]!), price: 'R$ 1.299,90', promo: '999' }, data, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.product.price).toBe(129990);
      expect(result.product.promoPrice).toBe(99900);
      expect(result.product.updatedAt).toBe(NOW);
    }
  });

  it('requires a name, a price and alt text for every photo', () => {
    const data = createSeed();
    const base = draftFromProduct(data.products[0]!);
    const draft = { ...base, name: ' ', price: '', images: base.images.map((img, i) => (i === 0 ? { ...img, alt: '' } : img)) };
    const result = buildProduct(draft, data, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.price).toBeDefined();
      expect(result.errors[`alt:${base.images[0]!.id}`]).toBeDefined();
    }
  });

  it('gives new products a unique slug and puts them first', () => {
    const data = createSeed();
    const draft = { ...emptyDraft(data, NOW), name: data.products[0]!.name, price: '50' };
    const result = buildProduct(draft, data, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.product.slug).toBe(`${data.products[0]!.slug}-2`);
      expect(result.product.order).toBeLessThan(Math.min(...data.products.map((p) => p.order)));
    }
  });

  it('rejects a hand-edited slug that another product uses', () => {
    const data = createSeed();
    const draft = { ...draftFromProduct(data.products[1]!), slug: data.products[0]!.slug };
    const result = buildProduct(draft, data, NOW);
    expect(!result.ok && result.errors.slug).toBe('Já existe outra peça com este endereço.');
  });

  it('duplicates with new ids and keeps finish photos linked', () => {
    const original = createSeed().products[0]!;
    const copy = duplicateDraft(original, NOW);
    expect(copy.id).not.toBe(original.id);
    expect(copy.images.map((i) => i.id)).not.toContain(original.images[0]!.id);
    const linked = copy.variants.flatMap((v) => v.imageIds);
    expect(linked.every((id) => copy.images.some((img) => img.id === id))).toBe(true);
  });
});

describe('restoreProduct (undo delete)', () => {
  it('puts the product back at its index', () => {
    const data = createSeed();
    const removed = data.products[2]!;
    const without = { ...data, products: data.products.filter((p) => p.id !== removed.id) };
    expect(restoreProduct(without, removed, 2).products[2]!.id).toBe(removed.id);
  });
});

describe('product form', { timeout: 20_000 }, () => {
  it('shows an inline error when the promo price is not below the price', async () => {
    unlockSession();
    const user = userEvent.setup();
    renderAdmin('/admin/produtos/prod-p02');
    const dialog = await screen.findByRole('dialog', { name: 'Editar peça' });
    const promo = within(dialog).getByLabelText(/Preço promocional/);
    await user.clear(promo);
    await user.type(promo, '200,00');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('O preço promocional precisa ser menor que o preço.')).toBeInTheDocument();
    expect(useCatalog.getState().data.products.find((p) => p.id === 'prod-p02')!.promoPrice).toBeUndefined();
  });

  it('keeps the form open with the edits when storage is full', async () => {
    unlockSession();
    const user = userEvent.setup();
    const { router } = renderAdmin('/admin/produtos/prod-p02');
    const dialog = await screen.findByRole('dialog', { name: 'Editar peça' });
    const name = within(dialog).getByLabelText(/Nome da peça/);
    await user.clear(name);
    await user.type(name, 'Argola Cravejada Grande');

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    const toastAlert = await screen.findByText(/Espaço do navegador cheio/);
    expect(toastAlert.closest('[role="alert"]')).not.toBeNull();
    expect(router.state.location.pathname).toBe('/admin/produtos/prod-p02');
    expect(within(dialog).getByLabelText(/Nome da peça/)).toHaveValue('Argola Cravejada Grande');
    expect(useCatalog.getState().data.products.find((p) => p.id === 'prod-p02')!.name).toBe('Argola Cravejada');
  });

  it('saves edits and returns to the list', async () => {
    unlockSession();
    const user = userEvent.setup();
    const { router } = renderAdmin('/admin/produtos/prod-p02');
    const dialog = await screen.findByRole('dialog', { name: 'Editar peça' });
    const name = within(dialog).getByLabelText(/Nome da peça/);
    await user.clear(name);
    await user.type(name, 'Argola Cravejada Média');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(router.state.location.pathname).toBe('/admin/produtos');
    expect(useCatalog.getState().data.products.find((p) => p.id === 'prod-p02')!.name).toBe('Argola Cravejada Média');
  });
});
