import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { defaultSections, factsOf } from '../content/defaults';
import type { Sections, SiteContent } from '../data/content';
import { createCatalogSeed } from '../data/seed';
import { ApiError } from '../lib/api';
import { crc16 } from '../lib/pix';
import { useCatalog, type CatalogStatus } from '../store/catalog';
import type { InviteView, Me } from './api';
import RevendaApp from './RevendaApp';

const server = vi.hoisted(() => ({ me: null as unknown, invite: null as unknown, reported: [] as string[] }));
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  fetchMe: async () => {
    if (server.me) return server.me;
    throw new ApiError(401, 'unauthenticated', 'Entre de novo.');
  },
  fetchInvite: async () => server.invite,
  reportRepasse: async (kitId: string) => {
    server.reported.push(kitId);
    const m = server.me as Me;
    const entry = m.history.find((h) => h.id === kitId)!;
    entry.settlement = { ...entry.settlement!, reportedAt: '2026-11-24T21:30:00.000Z' };
    return { settlement: entry.settlement };
  },
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
  pix: null,
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

function show(path: string, opts: { content?: SiteContent; status?: CatalogStatus; loggedIn?: boolean; me?: Me; storeWhatsapp?: string } = {}) {
  server.me = opts.loggedIn === false ? null : (opts.me ?? me);
  server.invite = invite;
  const settings = opts.storeWhatsapp ? { ...catalog.settings, whatsapp: opts.storeWhatsapp } : catalog.settings;
  useCatalog.setState({ data: { ...catalog, settings, ...(opts.content ? { content: opts.content } : {}) }, version: 1, status: opts.status ?? 'ready', offline: false });
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

const settled = (over: Partial<NonNullable<Me['history'][number]['settlement']>> = {}): Me['history'][number] => ({
  id: 'kit_ab12',
  openedAt: '2026-10-25T12:00:00.000Z',
  closedAt: '2026-11-24T15:00:00.000Z',
  settlement: { at: '2026-11-24T15:00:00.000Z', soldCents: 19980, percent: 25, commissionCents: 4995, missingCents: 0, dueCents: 14985, returned: [], missing: [], ...over },
});
const PIX = { key: '+5565999998888', name: 'EKA SEMIJOIAS', city: 'CUIABA' };

describe('RevendaApp repasse (the customer pays her; she passes the store its part)', () => {
  it('shows what she owes with the store Pix carrying the exact amount, and records "Já fiz o repasse"', async () => {
    server.reported = [];
    const user = userEvent.setup();
    show('/revenda/painel', { me: { ...me, history: [settled()], pix: PIX }, storeWhatsapp: '5565999998888' });
    const card = await screen.findByRole('region', { name: 'Repasse do acerto de 24/11' });
    expect(within(card).getByText('R$ 149,85')).toBeInTheDocument();
    const code = within(card).getByRole('textbox') as HTMLTextAreaElement;
    expect(code.value).toContain('5406149.85'); // amount
    expect(code.value).toContain('REPkitab12'); // reference in her bank statement
    expect(code.value).toContain('65999998888');
    expect(crc16(code.value.slice(0, -4))).toBe(code.value.slice(-4)); // banks refuse a wrong checksum
    expect(within(card).getByRole('img', { name: /QR Code Pix de R\$\s149,85/ })).toBeInTheDocument();
    expect(within(card).getByText('(65) 99999-8888', { exact: false })).toBeInTheDocument();
    const receipt = within(card).getByRole('link', { name: /Enviar comprovante no WhatsApp/ });
    expect(decodeURIComponent(receipt.getAttribute('href')!)).toContain('Oi! Aqui é Bruna. Fiz o repasse de R$ 149,85 do acerto da minha maleta.');

    await user.click(within(card).getByRole('button', { name: 'Já fiz o repasse' }));
    expect(server.reported).toEqual(['kit_ab12']);
    expect(await within(card).findByText(/Você avisou que pagou/)).toBeInTheDocument();
    // The tapped button is gone: focus moves to the confirmation.
    expect(document.activeElement).toHaveTextContent(/Você avisou que pagou/);
    expect(within(card).queryByRole('button', { name: 'Já fiz o repasse' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument();
    // The history tells where each repasse stands.
    await user.click(screen.getByRole('button', { name: 'Acertos' }));
    expect(await screen.findByText((_, el) => el?.tagName === 'P' && /^Repasse R\$\s149,85 · avisado em 24\/11$/.test(el.textContent ?? ''))).toBeInTheDocument();
  });

  it('without a store Pix, never shows a code and points to the store', async () => {
    show('/revenda/painel', { me: { ...me, history: [settled()], pix: null } });
    const card = await screen.findByRole('region', { name: /^Repasse do acerto/ });
    expect(within(card).getByText(builtIn.repasse!.noPix)).toBeInTheDocument();
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Já fiz o repasse' })).toBeInTheDocument();
    const talk = within(card).getByRole('link', { name: /Falar com a ÉKA no WhatsApp/ });
    expect(decodeURIComponent(talk.getAttribute('href')!)).toContain('Quero combinar o repasse de R$ 149,85');
  });

  it('hides the card once the store confirmed it, and when there was nothing to pass', async () => {
    show('/revenda/painel', { me: { ...me, history: [settled({ paidAt: '2026-11-25T13:00:00.000Z', reportedAt: '2026-11-24T21:30:00.000Z' }), { ...settled({ dueCents: 0 }), id: 'kit_zero' }], pix: PIX } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Seu painel' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Repasse do acerto/ })).not.toBeInTheDocument();
  });

  it('a section she saved before the repasse texts existed still shows them', async () => {
    const { repasse: _drop, ...old } = custom;
    show('/revenda/painel', { content: { revenda: old }, me: { ...me, history: [settled()], pix: PIX } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sua revenda' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^Repasse do acerto/ })).toBeInTheDocument();
    expect(screen.getByText(builtIn.repasse!.text)).toBeInTheDocument();
  });

  it('during the cycle, says how much of what she received goes to the store', async () => {
    const kit = { id: 'kit_open', resellerId: 'r1', status: 'aberta' as const, openedAt: '2026-11-20T12:00:00.000Z', dueAt: '2026-12-20T12:00:00.000Z', updatedAt: 'x', items: [], stockMoves: [], tiers: [{ fromCents: 0, percent: 25 }], lines: [], valueCents: 50000 };
    show('/revenda/painel', { me: { ...me, kit, soldCents: 19980, commission: { percent: 25, commissionCents: 4995, next: null, progress: 1 } } });
    expect(await screen.findByText('Para a ÉKA no acerto')).toBeInTheDocument();
    expect(screen.getByText('R$ 149,85')).toBeInTheDocument();
    expect(screen.getByText(builtIn.repasse!.cycleNote)).toBeInTheDocument();
  });
});
