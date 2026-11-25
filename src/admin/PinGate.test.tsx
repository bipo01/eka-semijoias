import { describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockServer, TEST_PIN } from '../test/mockApi';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from './testUtils';

polyfillDialog();
resetStores();

async function typePin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  const keypad = await screen.findByRole('group', { name: 'Teclado do PIN' });
  for (const digit of pin) await user.click(within(keypad).getByRole('button', { name: digit }));
}

describe('PIN gate', { timeout: 20_000 }, () => {
  it('shows the gate without disclaimers', async () => {
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Painel ÉKA' })).toBeInTheDocument();
    expect(screen.getByText('Digite seu PIN para entrar')).toBeInTheDocument();
    expect(screen.queryByText(/demonstra|segurança/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar ao site/ })).toBeInTheDocument();
  });

  it('logs in on the server as soon as the PIN is complete', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await typePin(user, TEST_PIN);
    expect(await screen.findByRole('heading', { name: 'Produtos', level: 1 })).toBeInTheDocument();
    expect(mockServer.requests.filter((r) => r.path === '/api/admin/login')).toHaveLength(1);
  });

  it('keeps every digit of fast taps (two taps before a re-render)', async () => {
    renderAdmin();
    const keypad = await screen.findByRole('group', { name: 'Teclado do PIN' });
    // Click all keys in one synchronous burst: React has no chance to re-render between them.
    act(() => {
      for (const digit of TEST_PIN) within(keypad).getByRole('button', { name: digit }).click();
    });
    expect(await screen.findByRole('heading', { name: 'Produtos', level: 1 })).toBeInTheDocument();
    const login = mockServer.requests.filter((r) => r.path === '/api/admin/login');
    expect(login).toHaveLength(1);
    expect((login[0]!.body as { pin: string }).pin).toBe(TEST_PIN);
  });

  it('rejects a wrong PIN with an inline error and stays locked', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await typePin(user, '000001');
    expect(await screen.findByText('PIN incorreto. Tente de novo.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Produtos' })).not.toBeInTheDocument();
  });

  it('accepts the physical keyboard', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByRole('group', { name: 'Teclado do PIN' });
    await user.keyboard(TEST_PIN);
    expect(await screen.findByRole('heading', { name: 'Produtos', level: 1 })).toBeInTheDocument();
  });

  it('opens straight into the panel when the server session is still valid', async () => {
    unlockSession();
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Produtos', level: 1 })).toBeInTheDocument();
  });

  it('returns to the keypad when a save finds the session expired', async () => {
    unlockSession();
    const user = userEvent.setup();
    renderAdmin('/admin/configuracoes');
    await screen.findByRole('heading', { name: 'Configurações', level: 1 });
    mockServer.authenticated = false;
    await user.click(screen.getByRole('button', { name: 'Salvar informações' }));
    expect(await screen.findByRole('group', { name: 'Teclado do PIN' })).toBeInTheDocument();
  });
});
