import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { defaultSections, factsOf } from '../content/defaults';
import type { Sections, SiteContent } from '../data/content';
import { createCatalogSeed } from '../data/seed';
import { ApiError } from '../lib/api';
import { useCatalog, type CatalogStatus } from '../store/catalog';
import type { InviteView, Me } from './api';
import RevendaApp from './RevendaApp';

const server = vi.hoisted(() => ({ me: null as unknown, invite: null as unknown }));
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  fetchMe: async () => {
    if (server.me) return server.me;
    throw new ApiError(401, 'unauthenticated', 'Entre de novo.');
  },
  fetchInvite: async () => server.invite,
}));

const catalog = createCatalogSeed();
const builtIn = defaultSections(factsOf(catalog.settings, undefined)).revenda;

const me: Me = {
  reseller: { id: 'r1', name: 'Bruna Souza', firstName: 'Bruna', slug: 'bruna', whatsapp: '65999990000', city: 'Cuiabá', uf: 'MT', status: 'ativa', contract: null },
  kit: null,
  sales: [],
  commission: null,
  soldCents: 0,
  earnings: { receivedCents: 0, projectedCents: 0, totalCents: 0 },
  history: [],
  images: {},
  contractDue: null,
};
const invite: InviteView = { firstName: 'Bruna', name: 'Bruna Souza', hasPin: false, contract: null };

const custom: Sections['revenda'] = {
  ...builtIn,
  login: { ...builtIn.login, title: 'Área da revendedora', forgot: '' },
  invite: { ...builtIn.invite, greeting: 'Que alegria, {primeiro_nome}!', textNoContract: 'Escolha o seu PIN.' },
  panel: { ...builtIn.panel, greeting: 'Oi, {primeiro_nome}!', title: 'Sua revenda' },
  kit: { ...builtIn.kit, empty: 'Sua próxima maleta chega logo.' },
};

function show(path: string, opts: { content?: SiteContent; status?: CatalogStatus; loggedIn?: boolean } = {}) {
  server.me = opts.loggedIn === false ? null : me;
  server.invite = invite;
  useCatalog.setState({ data: { ...catalog, ...(opts.content ? { content: opts.content } : {}) }, version: 1, status: opts.status ?? 'ready', offline: false });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/revenda/*" element={<RevendaApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RevendaApp texts', () => {
  it('panel: built-in texts until the owner saves her own', async () => {
    show('/revenda/painel');
    expect(await screen.findByRole('heading', { level: 1, name: 'Seu painel' })).toBeInTheDocument();
    expect(screen.getByText('Olá, Bruna!')).toBeInTheDocument();
    expect(screen.getByText(builtIn.kit.empty)).toBeInTheDocument();
    expect(screen.getByText('Seu mostruário digital')).toBeInTheDocument();
  });

  it('panel: the owner’s saved texts, with her first name in place', async () => {
    show('/revenda/painel', { content: { revenda: custom } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sua revenda' })).toBeInTheDocument();
    expect(screen.getByText('Oi, Bruna!')).toBeInTheDocument();
    expect(screen.getByText('Sua próxima maleta chega logo.')).toBeInTheDocument();
    expect(screen.queryByText('Seu painel')).not.toBeInTheDocument();
    expect(screen.queryByText(builtIn.kit.empty)).not.toBeInTheDocument();
  });

  it('login: saved title, and an emptied optional text disappears', async () => {
    show('/revenda', { content: { revenda: custom }, loggedIn: false });
    expect(await screen.findByRole('heading', { level: 1, name: 'Área da revendedora' })).toBeInTheDocument();
    expect(screen.getByText(builtIn.login.text)).toBeInTheDocument();
    expect(screen.queryByText(/Esqueceu o PIN/)).not.toBeInTheDocument();
  });

  it('first access: saved greeting and the text for an invite without contract', async () => {
    show('/revenda/convite/abc', { content: { revenda: custom } });
    expect(await screen.findByText('Que alegria, Bruna!')).toBeInTheDocument();
    expect(screen.getByText('Escolha o seu PIN.')).toBeInTheDocument();
  });

  it('waits for the first catalog load before showing any text, then shows hers', async () => {
    show('/revenda/painel', { status: 'loading' });
    expect(await screen.findByText('Carregando seu painel…')).toBeInTheDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    act(() => useCatalog.setState({ data: { ...catalog, content: { revenda: custom } }, status: 'ready' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sua revenda' })).toBeInTheDocument();
  });
});
