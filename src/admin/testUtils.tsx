import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { createCatalogSeed } from '../data/seed';
import { useCatalog } from '../store/catalog';
import { useUi } from '../store/ui';
import { installMockApi, mockServer, resetMockServer } from '../test/mockApi';
import AdminApp from './AdminApp';

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

/** Fresh seed catalog (as loaded from the server), a fresh mock API, no toasts and no admin session. */
export function resetStores() {
  beforeEach(() => {
    resetMockServer();
    installMockApi();
    useCatalog.setState({ data: createCatalogSeed(), version: 1, status: 'ready', offline: false, externalVersion: 0, leadsVersion: 0 });
    useUi.setState({ toasts: [], openDialogs: 0 });
  });
  afterEach(() => vi.unstubAllGlobals());
}

/** Starts the test with an open admin session on the (mock) server. */
export function unlockSession() {
  mockServer.authenticated = true;
}

export function renderAdmin(path = '/admin/produtos') {
  const router = createMemoryRouter([{ path: '/admin/*', element: <AdminApp /> }, { path: '*', element: <p>Site</p> }], { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}
