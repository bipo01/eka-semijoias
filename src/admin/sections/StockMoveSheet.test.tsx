import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createCatalogSeed } from '../../data/seed';
import { useUi } from '../../store/ui';
import type { StockData } from '../lib/stock';
import { polyfillDialog, resetStores } from '../testUtils';
import { StockMoveSheet } from './StockMoveSheet';

polyfillDialog();
resetStores();

const product = createCatalogSeed().products.find((p) => p.variants.every((v) => !v.sizes?.length))!;
const variant = product.variants[0]!;

function stockData(qty: number | null): StockData {
  return {
    levels: qty === null ? [] : [{ productId: product.id, variantId: variant.id, size: '', qty, updatedAt: '2026-11-23T10:00:00.000Z' }],
    tracked: qty === null ? [] : [product.id],
    movements: [],
    inKits: {},
    kitsByCombo: {},
  };
}

/** Answers POST /api/admin/stock/moves with the given responses, one per call; records the requests. */
function stubMoves(...responses: { status: number; body: unknown }[]) {
  const calls: { body: unknown; key: string | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/admin/stock/moves')) {
        calls.push({ body: JSON.parse(String(init?.body)), key: (init?.headers as Record<string, string>)['Idempotency-Key'] });
        const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
        return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ...createCatalogSeed(), version: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return calls;
}

describe('StockMoveSheet', () => {
  it('registers an exit with motive and note, and shows the server refusal as is', async () => {
    const refused = { status: 409, body: { error: { code: 'conflict', message: 'Só há 1 em estoque.', details: { available: 1 } } } };
    const calls = stubMoves(refused, refused, { status: 201, body: { version: 2, kind: 'saida', qty: 1, qtyAfter: 0, note: 'Brinde', trackingStarted: false } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<StockMoveSheet request={{ kind: 'saida', productId: product.id, session: 1 }} data={stockData(3)} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Registrar saída' })).toBeInTheDocument();
    expect(screen.getByText(/Em casa agora: 3/)).toBeInTheDocument();
    // No motive yet: refused in the browser, nothing sent.
    await user.click(screen.getByRole('button', { name: 'Registrar saída de 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o motivo.');
    expect(calls).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Aumentar quantidade' }));
    await user.click(screen.getByRole('button', { name: 'Brinde' }));
    await user.type(screen.getByLabelText(/Observação/), '  sorteio do mês ');
    await user.click(screen.getByRole('button', { name: 'Registrar saída de 2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Só há 1 em estoque.');
    expect(calls[0]!.body).toEqual({ kind: 'saida', productId: product.id, variantId: variant.id, size: '', qty: 2, motive: 'brinde', note: 'sorteio do mês' });
    expect(onClose).not.toHaveBeenCalled();

    // The same move sent again keeps its key (applied once); a different move gets a new one.
    await user.click(screen.getByRole('button', { name: 'Registrar saída de 2' }));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.key).toBe(calls[0]!.key);
    await user.click(screen.getByRole('button', { name: 'Diminuir quantidade' }));
    await user.click(screen.getByRole('button', { name: 'Registrar saída de 1' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls[2]!.key).toMatch(/^[\w-]{16,}$/);
    expect(calls[2]!.key).not.toBe(calls[0]!.key);
    expect(useUi.getState().toasts.at(-1)?.message).toMatch(/Saída registrada: .+, fica 0\./);
  });

  it('warns that an entry turns stock control on, and refuses an exit without control', async () => {
    const calls = stubMoves({ status: 201, body: { version: 2, kind: 'entrada', qty: 1, qtyAfter: 1, note: 'Troca', trackingStarted: true } });
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<StockMoveSheet request={{ kind: 'entrada', productId: product.id, session: 2 }} data={stockData(null)} onClose={onClose} />);
    expect(screen.getByText(/o controle liga/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Saída/ }));
    expect(screen.getByRole('dialog', { name: 'Registrar saída' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Perda ou defeito' }));
    await user.click(screen.getByRole('button', { name: 'Registrar saída de 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/não tem controle de estoque/);
    expect(calls).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Entrada/ }));
    await user.click(screen.getByRole('button', { name: 'Troca' }));
    await user.click(screen.getByRole('button', { name: 'Registrar entrada de 1' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls[0]!.body).toMatchObject({ kind: 'entrada', motive: 'troca', qty: 1 });
    expect(useUi.getState().toasts.at(-1)?.message).toMatch(/Controle de estoque ligado/);
  });
});
