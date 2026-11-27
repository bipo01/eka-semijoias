import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSeed } from '../../data/seed';
import { useCatalog } from '../../store/catalog';
import { mockServer } from '../../test/mockApi';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../testUtils';
import { buildProduct, draftFromProduct, duplicateDraft, emptyDraft } from './productDraft';
import { restoreProduct } from './ProductForm';

// The photo pipeline needs a real canvas: any picked file becomes this small WebP.
const NEW_PHOTO = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
vi.mock('../../lib/image', async (orig) => ({
  ...(await orig<typeof import('../../lib/image')>()),
  processImage: async () => ({ ok: true, src: NEW_PHOTO, thumb: NEW_PHOTO }),
}));

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
    expect(!result.ok && result.errors.slug).toBe('Já existe outra peça com este link.');
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
  it('a removed photo comes back with "Desfazer", at the same place', async () => {
    unlockSession();
    const user = userEvent.setup();
    renderAdmin('/admin/produtos/prod-p05');
    const dialog = await screen.findByRole('region', { name: 'Editar peça' });
    const photos = () => within(within(dialog).getByRole('list', { name: 'Fotos da peça' })).getAllByRole('button', { name: /^(Principal(, provisória)?, foto 1|(Provisória, foto|Foto) \d+):/ });
    const before = photos().map((b) => b.getAttribute('aria-label'));
    expect(before.length).toBeGreaterThanOrEqual(2);
    await user.click(within(dialog).getByRole('button', { name: 'Remover foto 1' }));
    expect(photos()).toHaveLength(before.length - 1);
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }));
    expect(photos().map((b) => b.getAttribute('aria-label'))).toEqual(before);
    // The photo is selected again, ready for "Tornar principal"/"Mover".
    expect(photos()[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('swaps a photo in place, keeps its finishes and description, and can undo it', async () => {
    unlockSession();
    const user = userEvent.setup();
    renderAdmin('/admin/produtos/prod-p05');
    const dialog = await screen.findByRole('region', { name: 'Editar peça' });
    const strip = () => within(dialog).getByRole('list', { name: 'Fotos da peça' });
    const tiles = () => within(strip()).getAllByRole('button', { name: /^(Principal(, provisória)?, foto 1|(Provisória, foto|Foto) \d+):/ });
    const before = useCatalog.getState().data.products.find((p) => p.id === 'prod-p05')!;
    const first = before.images[0]!;
    expect(within(dialog).getByText('Fotos removidas ou trocadas saem do site quando você salva e são apagadas do servidor um dia depois.')).toBeInTheDocument();
    await user.click(tiles()[0]!);
    const picker = within(dialog).getByText('Trocar foto').closest('label')!.querySelector('input[type=file]') as HTMLInputElement;
    expect(picker.multiple).toBe(false);
    await user.upload(picker, new File([new Uint8Array([1, 2, 3])], 'nova.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('Foto trocada. A antiga sai do site quando você salvar.')).toBeInTheDocument();
    // Same place and description; no longer a stand-in.
    expect(tiles()).toHaveLength(before.images.length);
    expect(tiles()[0]).toHaveAttribute('aria-label', `Principal, foto 1: ${first.alt}`);
    expect(within(dialog).getByText('Foto nova: vai ser enviada quando você salvar a peça.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(tiles()[0]).toHaveAttribute('aria-label', `Principal${first.placeholder ? ', provisória' : ''}, foto 1: ${first.alt}`);

    // Swapped again and saved: the new photo is uploaded and linked to the same finishes.
    await user.upload(picker, new File([new Uint8Array([1, 2, 3])], 'nova.jpg', { type: 'image/jpeg' }));
    await screen.findAllByText('Foto trocada. A antiga sai do site quando você salvar.');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(mockServer.requests.some((r) => r.path === '/api/admin/changes')).toBe(true));
    const sent = mockServer.requests.find((r) => r.path === '/api/admin/changes')!.body as { changes: { data: { images: { id: string; src: string; placeholder?: boolean }[]; variants: { imageIds: string[] }[] } }[] };
    const saved = sent.changes[0]!.data;
    expect(saved.images[0]!.id).toBe(first.id);
    expect(saved.images[0]!.src).toMatch(/^media\//);
    expect(saved.images[0]!.placeholder).toBeUndefined();
    expect(saved.variants.map((v) => v.imageIds)).toEqual(before.variants.map((v) => v.imageIds));
  });

  it('shows an inline error when the promo price is not below the price', async () => {
    unlockSession();
    const user = userEvent.setup();
    renderAdmin('/admin/produtos/prod-p02');
    const dialog = await screen.findByRole('region', { name: 'Editar peça' });
    const promo = within(dialog).getByLabelText(/Preço promocional/);
    await user.clear(promo);
    await user.type(promo, '200,00');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('O preço promocional precisa ser menor que o preço.')).toBeInTheDocument();
    expect(useCatalog.getState().data.products.find((p) => p.id === 'prod-p02')!.promoPrice).toBeUndefined();
  });

  it('keeps the form open with the edits when the server refuses the save', async () => {
    unlockSession();
    const user = userEvent.setup();
    const { router } = renderAdmin('/admin/produtos/prod-p02');
    const dialog = await screen.findByRole('region', { name: 'Editar peça' });
    const name = within(dialog).getByLabelText(/Nome da peça/);
    await user.clear(name);
    await user.type(name, 'Argola Cravejada Grande');

    mockServer.failNext = { status: 409, code: 'conflict', message: 'Outro aparelho alterou “Argola Cravejada” agora há pouco.' };
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    const toastAlert = await screen.findByText(/Outro aparelho alterou/);
    expect(toastAlert.closest('[role="alert"]')).not.toBeNull();
    expect(router.state.location.pathname).toBe('/admin/produtos/prod-p02');
    expect(within(dialog).getByLabelText(/Nome da peça/)).toHaveValue('Argola Cravejada Grande');
    expect(useCatalog.getState().data.products.find((p) => p.id === 'prod-p02')!.name).toBe('Argola Cravejada');
  });

  it('keeps a position changed on another device when saving the form', async () => {
    unlockSession();
    const user = userEvent.setup();
    renderAdmin('/admin/produtos/prod-p02');
    const dialog = await screen.findByRole('region', { name: 'Editar peça' });
    // Another device moves this product to the end of the list while the form is open.
    useCatalog.setState((s) => ({ data: { ...s.data, products: s.data.products.map((p) => (p.id === 'prod-p02' ? { ...p, order: 999 } : p)) } }));
    await user.type(within(dialog).getByLabelText(/Nome da peça/), ' Nova');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Alterações salvas.');
    expect(mockServer.catalog.products.find((p) => p.id === 'prod-p02')!.order).toBe(999);
  });

  it('saves edits and returns to the list', async () => {
    unlockSession();
    const user = userEvent.setup();
    const { router } = renderAdmin('/admin/produtos/prod-p02');
    const dialog = await screen.findByRole('region', { name: 'Editar peça' });
    const name = within(dialog).getByLabelText(/Nome da peça/);
    await user.clear(name);
    await user.type(name, 'Argola Cravejada Média');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(router.state.location.pathname).toBe('/admin/produtos');
    expect(useCatalog.getState().data.products.find((p) => p.id === 'prod-p02')!.name).toBe('Argola Cravejada Média');
  });
});
