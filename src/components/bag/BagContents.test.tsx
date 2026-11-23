import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { createCatalogSeed } from '../../data/seed';
import { useCart } from '../../store/cart';
import { useCatalog } from '../../store/catalog';
import { useCheckout } from '../../store/checkout';
import { useCustomer } from '../../store/customer';
import { useUi } from '../../store/ui';
import { BagContents } from './BagContents';

const catalog = createCatalogSeed();
const product = catalog.products.find((p) => p.variants.every((v) => !v.sizes?.length) && p.available && p.variants.every((v) => v.available))!;
const variant = product.variants[0]!;
const PIX = { key: '+5567999998888', name: 'EKA SEMIJOIAS', city: 'CAMPO GRANDE' };

function setup(withPix = true) {
  useCatalog.setState({ data: { ...catalog, settings: { ...catalog.settings, ...(withPix ? { pix: PIX } : {}) } }, version: 1, status: 'ready', offline: false });
  useCart.setState({ items: [{ productId: product.id, variantId: variant.id, qty: 2 }] });
  useCheckout.getState().reset();
  useCustomer.setState({ name: '', city: '', note: '' });
  useUi.setState({ toasts: [], openDialogs: 0 });
  return render(
    <MemoryRouter>
      <BagContents variant="page" />
    </MemoryRouter>,
  );
}

const createdOrder = (number: number) => ({
  order: {
    id: 'ord_1',
    number,
    createdAt: '2026-11-23T12:00:00.000Z',
    items: [{ productId: product.id, variantId: variant.id, qty: 2, name: product.name, finish: variant.finish, categoryId: product.categoryId, categoryName: 'X', unitCents: 1000 }],
    totalCents: 2000,
    pix: true,
  },
});

describe('bag checkout', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('asks for name and city before registering', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar pedido' }));
    expect(screen.getByText('Informe seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua cidade.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('registers the order once, then shows the number, the Pix and the WhatsApp link', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(createdOrder(1024)), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    setup();
    await userEvent.type(screen.getByPlaceholderText('Seu nome'), 'Ana');
    await userEvent.type(screen.getByPlaceholderText('Cidade'), 'Dourados');
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar pedido' }));
    expect(await screen.findByText('Pedido nº 1024 registrado')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/orders');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[\w-]{16,}$/);
    expect(JSON.parse(init.body as string)).toEqual({ items: [{ productId: product.id, variantId: variant.id, qty: 2 }], name: 'Ana', city: 'Dourados' });
    expect(await screen.findByRole('heading', { name: 'Pague com Pix' })).toBeInTheDocument();
    expect((screen.getByLabelText('Pix Copia e Cola') as HTMLTextAreaElement).value).toMatch(/^000201.*540520\.00.*6304[0-9A-F]{4}$/);
    const link = screen.getByRole('link', { name: /Enviar pedido pelo WhatsApp/ });
    const text = decodeURIComponent(link.getAttribute('href')!.split('text=')[1]!);
    expect(text).toContain('Fiz o pedido nº 1024 pelo site');
    expect(text).toContain('Pagamento: Pix');
    await userEvent.click(link);
    expect(useCart.getState().items).toEqual([]);
    expect(screen.getByText('Pedido nº 1024 registrado')).toBeInTheDocument();
  });

  it('never loses the sale: on a network failure it offers WhatsApp without a number', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    setup(false);
    await userEvent.type(screen.getByPlaceholderText('Seu nome'), 'Ana');
    await userEvent.type(screen.getByPlaceholderText('Cidade'), 'Dourados');
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar pedido' }));
    expect(await screen.findByText('Não conseguimos registrar o pedido.', {}, { timeout: 5000 })).toBeInTheDocument();
    const fallback = screen.getByRole('link', { name: /Enviar pelo WhatsApp mesmo assim/ });
    expect(decodeURIComponent(fallback.getAttribute('href')!)).toContain('Gostaria de fazer este pedido');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  }, 10_000);

  it('shows what sold out when the server refuses the order', async () => {
    const body = { error: { code: 'conflict', message: 'x', details: { problems: [{ productId: product.id, variantId: variant.id, name: product.name, reason: 'stock', available: 1 }] } } };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('/api/orders') ? new Response(JSON.stringify(body), { status: 409 }) : new Response('{}', { status: 500 }))));
    setup();
    await userEvent.type(screen.getByPlaceholderText('Seu nome'), 'Ana');
    await userEvent.type(screen.getByPlaceholderText('Cidade'), 'Dourados');
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar pedido' }));
    expect(await screen.findByText(/Só temos 1 unidade de/)).toBeInTheDocument();
  });
});
