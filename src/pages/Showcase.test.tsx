import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createCatalogSeed } from '../data/seed';
import { forgetPanelShowcase, rememberPanelShowcase } from '../lib/panelShowcase';
import { useCatalog } from '../store/catalog';
import { ShowcasePage } from './Showcase';

vi.mock('../lib/api', async (orig) => ({
  ...(await orig<typeof import('../lib/api')>()),
  api: async () => ({ firstName: 'Ana', whatsapp: '65999991234', active: true, items: [] }),
}));

function show(entry: string | { pathname: string; state: unknown } = '/r/ana') {
  useCatalog.setState({ data: createCatalogSeed(), version: 1, status: 'ready', offline: false });
  return render(
    <MemoryRouter initialEntries={['/revenda', entry]} initialIndex={1}>
      <Routes>
        <Route path="/r/:slug" element={<ShowcasePage />} />
        <Route path="/revenda" element={<p>Painel da revendedora</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const back = () => screen.queryByRole('button', { name: 'Voltar ao meu painel' });

beforeEach(() => forgetPanelShowcase());
afterEach(() => forgetPanelShowcase());

describe('ShowcasePage back to the panel', () => {
  it('is never shown to a customer', async () => {
    show();
    expect(await screen.findByRole('heading', { name: 'Mostruário de Ana' })).toBeInTheDocument();
    expect(back()).not.toBeInTheDocument();
  });

  it("is not shown on another reseller's showcase", async () => {
    rememberPanelShowcase('bia');
    show();
    await screen.findByRole('heading', { name: 'Mostruário de Ana' });
    expect(back()).not.toBeInTheDocument();
  });

  it('takes the reseller back to her panel', async () => {
    rememberPanelShowcase('ana');
    show({ pathname: '/r/ana', state: { fromPanel: true } });
    await screen.findByRole('heading', { name: 'Mostruário de Ana' });
    await userEvent.setup().click(back()!);
    expect(await screen.findByText('Painel da revendedora')).toBeInTheDocument();
  });

  it('opens the panel when the showcase was opened from a link', async () => {
    rememberPanelShowcase('ana');
    render(
      <MemoryRouter initialEntries={['/r/ana']}>
        <Routes>
          <Route path="/r/:slug" element={<ShowcasePage />} />
          <Route path="/revenda" element={<p>Painel da revendedora</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Mostruário de Ana' });
    await userEvent.setup().click(back()!);
    expect(await screen.findByText('Painel da revendedora')).toBeInTheDocument();
  });
});
