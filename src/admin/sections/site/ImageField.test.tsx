import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createCatalogSeed } from '../../../data/seed';
import { processImage } from '../../../lib/image';
import { useCatalog } from '../../../store/catalog';
import { mockServer } from '../../../test/mockApi';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../../testUtils';

const PHOTO = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73/w==';

// jsdom has no canvas: the pipeline itself is covered in src/lib/image.test.ts.
vi.mock('../../../lib/image', async (original) => ({
  ...(await original<typeof import('../../../lib/image')>()),
  processImage: vi.fn(async () => ({ ok: true, src: PHOTO, thumb: PHOTO, bytes: 100 })),
}));

polyfillDialog();
resetStores();

function start() {
  unlockSession();
  const catalog = createCatalogSeed();
  mockServer.catalog = catalog;
  useCatalog.setState({ data: catalog, version: 1, status: 'ready' });
  return catalog;
}

const file = () => new File([new Uint8Array(10)], 'foto.jpg', { type: 'image/jpeg' });

describe('site images', { timeout: 20_000 }, () => {
  it('uploads banners with the wide profile and saves them as uploaded photos', async () => {
    start();
    renderAdmin('/admin/site?secao=inicio');
    // The first render here also loads the admin chunk (slow on a busy machine).
    const dialog = await screen.findByRole('region', { name: 'Página inicial' }, { timeout: 5000 });
    const band = within(dialog).getByRole('group', { name: 'Foto da faixa' });
    expect(within(band).queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument(); // the band always has a photo
    await userEvent.upload(within(band).getByLabelText(/Enviar outra foto/), file());
    expect(processImage).toHaveBeenLastCalledWith(expect.any(File), { profile: 'wide' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByText(/Página inicial: alterações salvas/);
    const saved = mockServer.catalog.content?.inicio?.resellerBand.image;
    expect(saved?.src).toMatch(/^media\//);
    expect(saved?.thumb).toMatch(/^media\//);
    expect(saved?.alt).toBe(''); // a new photo starts without the old picture's description
  });

  it('uses the product profile for the Sobre photo, picks product photos and removes where allowed', async () => {
    const catalog = start();
    renderAdmin('/admin/site?secao=sobre');
    const dialog = await screen.findByRole('region', { name: 'Sobre' });
    const photo = within(dialog).getByRole('group', { name: 'Foto ao lado da história' });
    await userEvent.upload(within(photo).getByLabelText(/Enviar foto/), file());
    expect(processImage).toHaveBeenLastCalledWith(expect.any(File), { profile: 'product' });
    await userEvent.click(within(photo).getByRole('button', { name: /Remover/ }));
    expect(within(photo).getByText('Sem foto, aparece o emblema da ÉKA.')).toBeInTheDocument();

    await userEvent.click(within(photo).getByRole('button', { name: /Escolher das fotos das peças/ }));
    const chooser = await screen.findByRole('dialog', { name: 'Fotos das peças' });
    const first = catalog.products.slice().sort((a, b) => a.order - b.order)[0]!;
    await userEvent.click(within(chooser).getByRole('button', { name: `Usar a foto 1 de ${first.name}` }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fotos das peças' })).not.toBeInTheDocument());
    expect(within(photo).getByRole('textbox', { name: /Descrição da foto/ })).toHaveValue(first.images[0]!.alt);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByText(/Sobre: alterações salvas/);
    expect(mockServer.catalog.content?.sobre?.image).toMatchObject({ src: first.images[0]!.src, alt: first.images[0]!.alt });
  });
});
