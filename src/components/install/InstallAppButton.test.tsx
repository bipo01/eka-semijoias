import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetInstallStateForTests } from '../../hooks/useInstallPrompt';
import { dismissKey } from '../../lib/install';
import { useUi } from '../../store/ui';
import { InstallAppButton } from './InstallAppButton';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.36.83 (iPhone15,3; iOS 18_5; pt_BR; pt; scale=3.00; 1290x2796; 761469043)',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
};

function device(userAgent: string, maxTouchPoints = 5) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  // jsdom has no maxTouchPoints.
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

/** A Chromium `beforeinstallprompt` whose user picks `outcome`. */
function installPromptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
  return { event, prompt };
}

beforeAll(() => {
  // jsdom has no showModal; the open attribute is enough here.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  useUi.setState({ toasts: [], openDialogs: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
  // Remove the own properties defined by the tests (jsdom has neither).
  const nav = navigator as unknown as Record<string, unknown>;
  delete nav.standalone;
  delete nav.maxTouchPoints;
  resetInstallStateForTests();
});

describe('InstallAppButton', () => {
  it('shows the Safari steps on iPhone and hides for 30 days after "Agora não"', async () => {
    device(UA.iphoneSafari);
    resetInstallStateForTests();
    const user = userEvent.setup();
    render(<InstallAppButton />);

    await user.click(screen.getByRole('button', { name: 'Instalar o app' }));
    const guide = await screen.findByRole('dialog', { name: 'Instalar o app da ÉKA' });
    expect(within(guide).getAllByText('Compartilhar').length).toBeGreaterThan(0);
    expect(within(guide).getByText('Adicionar à Tela de Início')).toBeInTheDocument();
    // Every step shows its real screenshot, the last one with the store's own icon and name.
    const photos = within(guide).getAllByRole('img').filter((img) => img.getAttribute('src')?.startsWith('/images/install/'));
    expect(photos.map((img) => img.getAttribute('src'))).toEqual([
      '/images/install/ios-1.webp',
      '/images/install/ios-2.webp',
      '/images/install/ios-3.webp',
      '/images/install/ios-4.webp',
      '/images/install/ios-5-store.webp',
      '/images/install/ios-6-store.webp',
    ]);
    expect(photos.every((img) => img.getAttribute('alt'))).toBe(true);

    await user.click(within(guide).getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('button', { name: 'Instalar o app' })).not.toBeInTheDocument();
    expect(Number(localStorage.getItem(dismissKey('store')))).toBeGreaterThan(0);
  });

  it('keeps the button after the guide is just closed ("Entendi")', async () => {
    device(UA.iphoneChrome);
    resetInstallStateForTests();
    const user = userEvent.setup();
    render(<InstallAppButton />);

    await user.click(screen.getByRole('button', { name: 'Instalar o app' }));
    const guide = await screen.findByRole('dialog', { name: 'Instalar o app da ÉKA' });
    expect(within(guide).getByText(/ao lado do endereço/)).toBeInTheDocument();
    await user.click(within(guide).getByRole('button', { name: 'Entendi' }));
    expect(screen.getByRole('button', { name: 'Instalar o app' })).toBeInTheDocument();
    expect(localStorage.getItem(dismissKey('store'))).toBeNull();
  });

  it('hides every install button on the page at once when one is dismissed', async () => {
    device(UA.iphoneSafari);
    resetInstallStateForTests();
    const user = userEvent.setup();
    render(
      <>
        <InstallAppButton variant="menu" />
        <InstallAppButton variant="footer" />
      </>,
    );
    expect(screen.getAllByRole('button', { name: 'Instalar o app' })).toHaveLength(2);
    await user.click(screen.getAllByRole('button', { name: 'Instalar o app' })[0]!);
    await user.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.queryAllByRole('button', { name: 'Instalar o app' })).toHaveLength(0);
  });

  it('renders nothing while a recent dismissal is on record, and the panel is remembered apart', () => {
    device(UA.iphoneSafari);
    localStorage.setItem(dismissKey('store'), String(Date.now() - 2 * 24 * 60 * 60 * 1000));
    resetInstallStateForTests();
    render(
      <>
        <InstallAppButton />
        <InstallAppButton app="admin" variant="list" />
      </>,
    );
    expect(screen.queryByRole('button', { name: 'Instalar o app' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Instalar o Painel ÉKA' })).toBeInTheDocument();
  });

  it('renders nothing when already running as an installed app', () => {
    device(UA.iphoneSafari);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    resetInstallStateForTests();
    const { container } = render(<InstallAppButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('in the Instagram browser, explains how to open in Safari and copies the link', async () => {
    device(UA.iphoneInstagram);
    resetInstallStateForTests();
    const user = userEvent.setup(); // installs its own clipboard stub: replace it after
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<InstallAppButton />);

    await user.click(screen.getByRole('button', { name: 'Instalar o app' }));
    const guide = await screen.findByRole('dialog', { name: 'Instalar o app da ÉKA' });
    expect(within(guide).getByText(/Pelo navegador do Instagram não dá para instalar/)).toBeInTheDocument();
    await user.click(within(guide).getByRole('button', { name: 'Copiar link' }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(useUi.getState().toasts.at(-1)).toMatchObject({ tone: 'success', message: 'Link copiado. Agora é só colar no Safari.' });
  });

  it('on desktop Chrome, appears only once the browser offers the prompt and opens it', async () => {
    device(UA.desktopChrome, 0);
    resetInstallStateForTests();
    const user = userEvent.setup();
    render(<InstallAppButton />);
    expect(screen.queryByRole('button', { name: 'Instalar o app' })).not.toBeInTheDocument();

    const { event, prompt } = installPromptEvent('dismissed');
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Instalar o app' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    // Closing the browser's window is not "Agora não": nothing is remembered and the button stays.
    await act(async () => {});
    expect(localStorage.getItem(dismissKey('store'))).toBeNull();
    // The event is single use: until Chrome offers a new one, the button opens the address-bar steps.
    await user.click(screen.getByRole('button', { name: 'Instalar o app' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('dialog', { name: 'Instalar o app da ÉKA' })).toHaveTextContent('Na barra de endereço');
  });

  it('on desktop Chrome, uses the prompt Chrome offers again after the window was closed', async () => {
    device(UA.desktopChrome, 0);
    resetInstallStateForTests();
    const user = userEvent.setup();
    render(<InstallAppButton app="reseller" />);
    const first = installPromptEvent('dismissed');
    act(() => {
      window.dispatchEvent(first.event);
    });
    await user.click(screen.getByRole('button', { name: 'Instalar o app da revenda' }));
    await act(async () => {});
    const second = installPromptEvent('accepted');
    act(() => {
      window.dispatchEvent(second.event);
    });
    await user.click(screen.getByRole('button', { name: 'Instalar o app da revenda' }));
    expect(second.prompt).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Instalar o app da revenda' })).not.toBeInTheDocument();
  });

  it('on Android, hides once the native prompt is accepted', async () => {
    device(UA.androidChrome);
    resetInstallStateForTests();
    const user = userEvent.setup();
    render(<InstallAppButton />);
    const { event, prompt } = installPromptEvent('accepted');
    act(() => {
      window.dispatchEvent(event);
    });
    await user.click(screen.getByRole('button', { name: 'Instalar o app' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Instalar o app' })).not.toBeInTheDocument();
    expect(localStorage.getItem(dismissKey('store'))).toBeNull();
  });

  it('on Android without a prompt, guides through the browser menu', async () => {
    device(UA.androidChrome);
    resetInstallStateForTests();
    const user = userEvent.setup();
    render(<InstallAppButton />);
    await user.click(screen.getByRole('button', { name: 'Instalar o app' }));
    expect(await screen.findByRole('dialog', { name: 'Instalar o app da ÉKA' })).toHaveTextContent('Adicionar à tela inicial');
  });
});
