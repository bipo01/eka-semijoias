import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createCatalogSeed } from '../../data/seed';
import { useCatalog } from '../../store/catalog';
import { mockServer } from '../../test/mockApi';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../testUtils';

polyfillDialog();
resetStores();

describe('settings saves keep the message templates', () => {
  it('saving "Informações da loja" does not drop the owner’s messages', async () => {
    unlockSession();
    const catalog = createCatalogSeed();
    const messages = { active: { contato: 'contato.curta' }, edited: {}, custom: [] };
    mockServer.catalog = { ...catalog, settings: { ...catalog.settings, messages } };
    useCatalog.setState({ data: mockServer.catalog, version: 1, status: 'ready' });
    renderAdmin('/admin/configuracoes');
    const field = await screen.findByRole('textbox', { name: /Horário de atendimento/ });
    await userEvent.type(field, 'seg. a sex.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar informações' }));
    await screen.findByText('Informações da loja salvas.');
    expect(mockServer.catalog.settings.messages).toEqual(messages);
  });
});
