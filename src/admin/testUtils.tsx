import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeAll, beforeEach, afterEach } from 'vitest';
import { createSeed } from '../data/seed';
import { useCatalog } from '../store/catalog';
import { useUi } from '../store/ui';
import AdminApp from './AdminApp';
import { SESSION_KEY } from './lib/session';

/** jsdom has no HTMLDialogElement.showModal; the open attribute is enough for these tests. */
export function polyfillDialog() {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
}

/** Fresh seed catalog, no toasts and no admin session before each test. */
export function resetStores() {
  beforeEach(() => {
    useCatalog.setState({ data: createSeed(), issue: 'none', externalVersion: 0 });
    useUi.setState({ toasts: [], openDialogs: 0 });
    sessionStorage.clear();
  });
  afterEach(() => sessionStorage.clear());
}

export function unlockSession() {
  sessionStorage.setItem(SESSION_KEY, useCatalog.getState().data.settings.pinHash);
}

export function renderAdmin(path = '/admin/produtos') {
  const router = createMemoryRouter([{ path: '/admin/*', element: <AdminApp /> }, { path: '*', element: <p>Site</p> }], { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}
