import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCatalog } from '../store/catalog';
import { sha256Hex } from '../lib/hash';
import { SESSION_KEY } from './lib/session';
import { polyfillDialog, renderAdmin, resetStores } from './testUtils';

polyfillDialog();
resetStores();

async function typePin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  const keypad = screen.getByRole('group', { name: 'Teclado do PIN' });
  for (const digit of pin) await user.click(within(keypad).getByRole('button', { name: digit }));
}

describe('PIN gate', { timeout: 20_000 }, () => {
  it('shows the gate without disclaimers', () => {
    renderAdmin();
    expect(screen.getByRole('heading', { name: 'Painel ÉKA' })).toBeInTheDocument();
    expect(screen.getByText('Digite seu PIN para entrar')).toBeInTheDocument();
    expect(screen.queryByText(/demonstra|segurança/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar ao site/ })).toBeInTheDocument();
  });

  it('unlocks with the default PIN 2580 and remembers the session', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await typePin(user, '2580');
    expect(await screen.findByRole('heading', { name: 'Produtos', level: 1 })).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBe(useCatalog.getState().data.settings.pinHash);
  });

  it('rejects a wrong PIN with an inline error and stays locked', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await typePin(user, '1111');
    expect(await screen.findByText('PIN incorreto. Tente de novo.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Produtos' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('accepts the physical keyboard', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await user.keyboard('2580');
    expect(await screen.findByRole('heading', { name: 'Produtos', level: 1 })).toBeInTheDocument();
  });

  it('accepts a custom 6-digit PIN and reports a wrong one on "Entrar"', async () => {
    const pinHash = await sha256Hex('135790');
    const data = useCatalog.getState().data;
    useCatalog.setState({ data: { ...data, settings: { ...data.settings, pinHash } } });
    const user = userEvent.setup();
    renderAdmin();

    await user.keyboard('1357');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('PIN incorreto. Tente de novo.')).toBeInTheDocument();

    await user.keyboard('135790');
    expect(await screen.findByRole('heading', { name: 'Produtos', level: 1 })).toBeInTheDocument();
  });

  it('ends the session opened with an old PIN after the PIN changes', async () => {
    sessionStorage.setItem(SESSION_KEY, 'f'.repeat(64));
    renderAdmin();
    expect(screen.getByRole('heading', { name: 'Painel ÉKA' })).toBeInTheDocument();
  });
});
