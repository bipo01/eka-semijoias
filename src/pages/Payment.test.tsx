import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { polyfillDialog } from '../admin/testUtils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { defaultSections, factsOf } from '../content/defaults';
import type { Sections, SiteContent } from '../data/content';
import type { PayView } from '../data/orders';
import { createCatalogSeed } from '../data/seed';
import { useCatalog, type CatalogStatus } from '../store/catalog';
import { ApiError } from '../lib/api';
import { PaymentPage } from './Payment';

const pay = vi.hoisted(() => ({ view: null as unknown as PayView, upload: (async () => undefined) as (...args: unknown[]) => Promise<void> }));
vi.mock('../lib/payments', async (orig) => ({
  ...(await orig<typeof import('../lib/payments')>()),
  fetchPayView: async () => pay.view,
  uploadReceipt: (...args: unknown[]) => pay.upload(...args),
}));

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
  discarded: false,
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

describe('PaymentPage receipt', () => {
  polyfillDialog();
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:receipt', revokeObjectURL: () => {} }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens the picked receipt full screen with a tap, to check it is the right one', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('heading', { level: 1 });
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], 'Screenshot_2026-11-25.png', { type: 'image/png' });
    await user.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, file);
    const open = await screen.findByRole('button', { name: 'Ver comprovante: Screenshot_2026-11-25.png' });
    expect(open).toHaveTextContent('Toque para ver');
    await user.click(open);
    const viewer = await screen.findByRole('dialog', { name: 'Seu comprovante' });
    expect(within(viewer).getByRole('img', { name: /Comprovante escolhido/ })).toHaveAttribute('src', 'blob:receipt');
    await user.click(within(viewer).getByRole('button', { name: 'Está certo' }));
    expect(screen.queryByRole('dialog', { name: 'Seu comprovante' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar comprovante' })).toBeEnabled();
  });

  const fileInput = () => document.querySelector<HTMLInputElement>('input[type=file]')!;
  const waText = (link: HTMLElement) => decodeURIComponent(link.getAttribute('href') ?? '');

  it('offers to replace the receipt under review, and to keep the one sent', async () => {
    const user = userEvent.setup();
    show({ view: view({ state: 'analise', receipts: [{ at: '2026-11-26T12:00:00.000Z' }] }) });
    await user.click(await screen.findByRole('button', { name: 'Trocar o comprovante' }));
    expect(screen.getByText('O novo arquivo substitui o comprovante que você enviou.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar o novo comprovante' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Manter o comprovante enviado' }));
    expect(screen.getByRole('heading', { name: 'Comprovante recebido!' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar o novo comprovante' })).toBeNull();
  });

  it('says a PDF is over the limit at once and offers WhatsApp with the order number', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('heading', { level: 1 });
    const pdf = new File([new Uint8Array(900_000)], 'extrato.pdf', { type: 'application/pdf' });
    await user.upload(fileInput(), pdf);
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Este arquivo passou do limite para enviar por aqui.');
    expect(notice).toHaveTextContent('Arquivo de 900 KB · o limite é 700 KB.');
    expect(notice).toHaveFocus();
    const wa = within(notice).getByRole('link', { name: /Enviar pelo WhatsApp/ });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//);
    expect(waText(wa)).toContain('Olá! Segue o comprovante do pagamento do pedido nº 1024.');
    // Nothing to send; picking another file clears the notice.
    expect(screen.getByRole('button', { name: 'Enviar comprovante' })).toBeDisabled();
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], 'print.png', { type: 'image/png' });
    await user.upload(fileInput(), png);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar comprovante' })).toBeEnabled();
  });

  it('shows the same way out when the server refuses the size', async () => {
    const user = userEvent.setup();
    pay.upload = async () => {
      throw new ApiError(413, 'too_large', 'O arquivo é grande demais.');
    };
    try {
      show({ content: { pagamento: { ...builtIn, tooBig: 'Arquivo grande: mande pelo WhatsApp.', tooBigMessage: 'Comprovante do pedido {pedido}' } } });
      await screen.findByRole('heading', { level: 1 });
      const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], 'print.png', { type: 'image/png' });
      await user.upload(fileInput(), png);
      await user.click(screen.getByRole('button', { name: 'Enviar comprovante' }));
      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent('Arquivo grande: mande pelo WhatsApp.');
      expect(waText(within(notice).getByRole('link', { name: /Enviar pelo WhatsApp/ }))).toContain('Comprovante do pedido 1024');
    } finally {
      pay.upload = async () => undefined;
    }
  });
});
