import { render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { InstallGuide } from './InstallGuide';

const photos = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('img')
    .map((img) => img.getAttribute('src'))
    .filter((src) => src?.startsWith('/images/install/'));

beforeAll(() => {
  // jsdom has no showModal; the open attribute is enough here.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

describe('InstallGuide photos', () => {
  it('the panel guide on iPhone ends with the "Painel ÉKA" add screen and icon', () => {
    render(<InstallGuide open app="admin" guide="ios-safari" platform={{ kind: 'ios-safari' }} link="/admin" onClose={() => {}} onDismiss={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Instalar o Painel ÉKA' });
    expect(photos(dialog).slice(-2)).toEqual(['/images/install/ios-5-admin.webp', '/images/install/ios-6-admin.webp']);
    expect(within(dialog).getByText('Painel ÉKA')).toBeInTheDocument();
  });

  it('Android without the native prompt: Chrome menu, "Adicionar à tela inicial", the reseller app install dialog', () => {
    render(<InstallGuide open app="reseller" guide="android-manual" platform={{ kind: 'android' }} link="/revenda" onClose={() => {}} onDismiss={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Instalar o ÉKA Revenda' });
    expect(photos(dialog)).toEqual(['/images/install/android-1.webp', '/images/install/android-2.webp', '/images/install/android-3-reseller.webp']);
  });
});
