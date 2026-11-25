import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCatalog } from '../../store/catalog';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../testUtils';
import { standInSearch } from './StandInPhotos';

polyfillDialog();
resetStores();
afterEach(() => vi.restoreAllMocks());

describe('stand-in photos on Produtos', { timeout: 20_000 }, () => {
  it('says the photos are stand-ins, and "Trocar as fotos" shows only those pieces under a banner with the steps', async () => {
    unlockSession();
    const user = userEvent.setup();
    const { router } = renderAdmin('/admin/produtos');
    const card = await screen.findByRole('region', { name: 'Coloque as fotos reais das suas peças' });
    expect(within(card).getByText(/provisórias/)).toBeInTheDocument();
    const total = useCatalog.getState().data.products.length;
    expect(within(card).getByRole('progressbar', { name: 'Peças com foto real' })).toHaveAttribute('aria-valuetext', `0 de ${total}`);
    // Every piece of the starting catalog is tagged on its row.
    expect(screen.getAllByText('Provisória').length).toBe(total);

    await user.click(within(card).getByRole('button', { name: 'Trocar as fotos' }));
    expect(router.state.location.search).toBe('?fotos=provisorias');
    const banner = await screen.findByRole('region', { name: 'Mostrando só as peças com foto provisória' });
    expect(within(banner).getByRole('list', { name: 'Como trocar' }).children).toHaveLength(4);
    expect(within(card).queryByRole('button', { name: 'Trocar as fotos' })).toBeNull();

    // A piece opened from here keeps the filter, so "Voltar" lands on the pieces still to fix.
    await user.click(screen.getAllByRole('link', { name: /^Editar/ })[0]!);
    expect(router.state.location.search).toBe('?fotos=provisorias');
    const editor = await screen.findByRole('region', { name: 'Editar peça' });
    expect(within(editor).getByRole('note')).toHaveTextContent(/foto(s)? provisória/);
    await user.click(screen.getByRole('link', { name: 'Voltar para Produtos' }));
    expect(router.state.location.pathname).toBe('/admin/produtos');
    expect(router.state.location.search).toBe('?fotos=provisorias');

    await user.click(within(await screen.findByRole('region', { name: 'Mostrando só as peças com foto provisória' })).getByRole('button', { name: 'Ver todas' }));
    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('region', { name: 'Mostrando só as peças com foto provisória' })).toBeNull();
  });

  it('carries only the stand-in filter into a piece', () => {
    expect(standInSearch('?fotos=provisorias&copiar=x')).toBe('?fotos=provisorias');
    expect(standInSearch('?copiar=x')).toBe('');
    expect(standInSearch('')).toBe('');
  });
});
