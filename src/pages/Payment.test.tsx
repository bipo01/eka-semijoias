import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { defaultSections, factsOf } from '../content/defaults';
import type { Sections, SiteContent } from '../data/content';
import type { PayView } from '../data/orders';
import { createCatalogSeed } from '../data/seed';
import { useCatalog, type CatalogStatus } from '../store/catalog';
import { PaymentPage } from './Payment';

const pay = vi.hoisted(() => ({ view: null as unknown as PayView }));
vi.mock('../lib/payments', async (orig) => ({ ...(await orig<typeof import('../lib/payments')>()), fetchPayView: async () => pay.view }));

const catalog = createCatalogSeed();
const builtIn = defaultSections(factsOf(catalog.settings, undefined)).pagamento;

const view = (over: Partial<PayView> = {}): PayView => ({
  number: 1024,
  firstName: 'Ana',
  items: [{ name: 'Brinco Gota Cristal', finish: 'dourado', qty: 1, lineCents: 12990 }],
  subtotalCents: 12990,
  shippingCents: 0,
  discountCents: 0,
  amountCents: 12990,
  state: 'aguardando',
  receipts: [],
  pix: { key: '65999998888', name: 'EKA SEMIJOIAS', city: 'CUIABA' },
  auto: false,
  mp: null,
  ...over,
});

const custom: Sections['pagamento'] = {
  ...builtIn,
  header: { ...builtIn.header, title: 'Seu pagamento', waiting: 'Só mais um passo' },
  pix: { ...builtIn.pix, step2: 'Pague {total} no app do banco.' },
  status: { ...builtIn.status, paidText: 'Recebemos[, {primeiro_nome}]! Pedido {pedido} pago.' },
  help: { ...builtIn.help, question: 'Ficou com dúvida?', message: 'Oi! Sobre o pedido {pedido}, pode me ajudar?' },
};

function show(opts: { content?: SiteContent; status?: CatalogStatus; view?: PayView } = {}) {
  pay.view = opts.view ?? view();
  useCatalog.setState({ data: { ...catalog, ...(opts.content ? { content: opts.content } : {}) }, version: 1, status: opts.status ?? 'ready', offline: false });
  return render(
    <MemoryRouter initialEntries={['/pagamento/tok123']}>
      <Routes>
        <Route path="/pagamento/:token" element={<PaymentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const helpLink = () => screen.getByRole('link', { name: /Fale com a gente/ });

describe('PaymentPage texts', () => {
  it('shows the built-in texts until the owner saves her own', async () => {
    show();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Pagamento do pedido nº 1024');
    expect(screen.getByText(/Oi, Ana!/)).toHaveTextContent('Oi, Ana! Falta pouco');
    const step1 = screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Copie o código e cole em Pix Copia e Cola no app do seu banco.');
    expect(step1.querySelector('strong')).toHaveTextContent('Pix Copia e Cola');
    const step2 = screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Confira o valor de R$ 129,90 e o recebedor, e pague.');
    expect(step2.querySelector('.price')).toHaveTextContent('R$ 129,90');
    expect(screen.getByText('Alguma dúvida sobre o pagamento?')).toBeInTheDocument();
    expect(decodeURIComponent(helpLink().getAttribute('href') ?? '')).toContain('Olá! Tenho uma dúvida sobre o pagamento do pedido nº 1024.');
  });

  it('shows the owner’s saved texts, with the order values in place', async () => {
    show({ content: { pagamento: custom } });
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Seu pagamento nº 1024');
    expect(screen.getByText(/Oi, Ana!/)).toHaveTextContent('Oi, Ana! Só mais um passo');
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Pague R$ 129,90 no app do banco.')).toBeInTheDocument();
    expect(screen.getByText('Ficou com dúvida?')).toBeInTheDocument();
    expect(decodeURIComponent(helpLink().getAttribute('href') ?? '')).toContain('Oi! Sobre o pedido 1024, pode me ajudar?');
    expect(screen.queryByText(/Pagamento do pedido/)).not.toBeInTheDocument();
  });

  it('fills the status texts and drops an optional part without a name', async () => {
    show({ content: { pagamento: custom }, view: view({ state: 'pago', firstName: '' }) });
    expect(await screen.findByText('Recebemos! Pedido 1024 pago.')).toBeInTheDocument();
  });

  describe('while the first catalog load is in flight', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it('holds the page instead of flashing the built-in text, then shows hers', async () => {
      show({ status: 'loading' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      act(() => useCatalog.setState({ data: { ...catalog, content: { pagamento: custom } }, status: 'ready' }));
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Seu pagamento nº 1024');
    });

    it('shows the built-in text when the catalog cannot be loaded', async () => {
      show({ status: 'loading' });
      act(() => useCatalog.setState({ status: 'error' }));
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Pagamento do pedido nº 1024');
    });

    it('never holds the page for a slow network', async () => {
      show({ status: 'loading' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4100);
      });
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Pagamento do pedido nº 1024');
    });
  });
});
