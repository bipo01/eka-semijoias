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

function stockData(qty: number | null, motives: StockData['motives'] = { entrada: [], saida: [] }): StockData {
  return {
    motives,
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
    render(<StockMoveSheet request={{ kind: 'saida', productId: product.id, session: 1 }} data={stockData(3)} onMotives={vi.fn()} onClose={onClose} />);

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
    render(<StockMoveSheet request={{ kind: 'entrada', productId: product.id, session: 2 }} data={stockData(null)} onMotives={vi.fn()} onClose={onClose} />);
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

  it('asks what "Outra entrada" was, sends it to be saved and shows it as a chip at once', async () => {
    const calls = stubMoves({ status: 201, body: { version: 2, kind: 'entrada', qty: 2, qtyAfter: 5, note: 'Feira de artesanato', trackingStarted: false } });
    const onMotives = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<StockMoveSheet request={{ kind: 'entrada', productId: product.id, session: 3 }} data={stockData(3, { entrada: ['Bazar'], saida: [] })} onMotives={onMotives} onClose={onClose} />);

    // Closed, the field is out of reach; "Outra entrada" opens it.
    const field = screen.getByLabelText('Qual foi o motivo?');
    expect(field).toBeDisabled();
    const other = screen.getByRole('button', { name: 'Outra entrada' });
    expect(other).toHaveAttribute('aria-expanded', 'false');
    await user.click(other);
    expect(other).toHaveAttribute('aria-expanded', 'true');
    expect(field).toBeEnabled();
    expect(field).toHaveFocus();
    expect(screen.getByText(/Fica salvo para as próximas entradas/)).toBeInTheDocument();

    // Nothing written: asked for, nothing sent.
    await user.click(screen.getByRole('button', { name: 'Aumentar quantidade' }));
    await user.click(screen.getByRole('button', { name: 'Registrar entrada de 2' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escreva qual foi o motivo da entrada.');
    expect(field).toHaveFocus();
    expect(calls).toHaveLength(0);

    await user.type(field, '  feira   de artesanato');
    expect(screen.getByText('23/40')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar entrada de 2' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls[0]!.body).toEqual({ kind: 'entrada', productId: product.id, variantId: variant.id, size: '', qty: 2, motive: 'outro', motiveLabel: 'Feira de artesanato' });
    expect(onMotives).toHaveBeenCalledWith({ entrada: ['Bazar', 'Feira de artesanato'], saida: [] });
  });

  it('uses a motive that already exists instead of saving it twice', async () => {
    const calls = stubMoves({ status: 201, body: { version: 2, kind: 'entrada', qty: 1, qtyAfter: 4, note: 'Troca', trackingStarted: false } });
    const onMotives = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<StockMoveSheet request={{ kind: 'entrada', productId: product.id, session: 4 }} data={stockData(3, { entrada: ['Bazar'], saida: [] })} onMotives={onMotives} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Outra entrada' }));
    const field = screen.getByLabelText('Qual foi o motivo?');
    await user.type(field, 'bazar');
    expect(screen.getByText('Você já tem “Bazar” salvo. Vamos usar ele.')).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'TROCA');
    expect(screen.getByText('“Troca” já está na lista. Vamos usar ele.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar entrada de 1' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls[0]!.body).toMatchObject({ motive: 'troca' });
    expect(calls[0]!.body).not.toHaveProperty('motiveLabel');
    expect(onMotives).not.toHaveBeenCalled();
  });

  it('sends a saved motive, and forgets it with "Tirar da lista" (with "Desfazer")', async () => {
    const motiveCalls: unknown[] = [];
    const moveCalls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
        if (url.includes('/api/admin/stock-motives')) {
          const body = JSON.parse(String(init?.body)) as { saved: boolean };
          motiveCalls.push({ method: init?.method, body });
          return ok({ motives: { entrada: [], saida: body.saved ? ['Doação'] : [] } });
        }
        if (url.includes('/api/admin/stock/moves')) {
          moveCalls.push(JSON.parse(String(init?.body)));
          return ok({ version: 2, kind: 'saida', qty: 1, qtyAfter: 2, note: 'Doação', trackingStarted: false }, 201);
        }
        return ok({ ...createCatalogSeed(), version: 1 });
      }),
    );
    const onMotives = vi.fn();
    const user = userEvent.setup();
    const view = render(<StockMoveSheet request={{ kind: 'saida', productId: product.id, session: 5 }} data={stockData(3, { entrada: [], saida: ['Doação'] })} onMotives={onMotives} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Doação' }));
    expect(screen.getByText('Motivo criado por você.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tirar da lista' }));
    await vi.waitFor(() => expect(onMotives).toHaveBeenCalledWith({ entrada: [], saida: [] }));
    expect(motiveCalls[0]).toEqual({ method: 'PUT', body: { kind: 'saida', label: 'Doação', saved: false } });
    const toast = useUi.getState().toasts.at(-1)!;
    expect(toast.message).toBe('“Doação” saiu da lista de motivos.');
    expect(screen.getByRole('button', { name: 'Doação' })).toHaveAttribute('aria-pressed', 'false');
    toast.action!.onClick!();
    await vi.waitFor(() => expect(onMotives).toHaveBeenLastCalledWith({ entrada: [], saida: ['Doação'] }));
    expect(motiveCalls[1]).toEqual({ method: 'PUT', body: { kind: 'saida', label: 'Doação', saved: true } });

    // Chosen again, it goes as her motive.
    await user.click(screen.getByRole('button', { name: 'Doação' }));
    await user.click(screen.getByRole('button', { name: 'Registrar saída de 1' }));
    await vi.waitFor(() => expect(moveCalls).toHaveLength(1));
    expect(moveCalls[0]).toMatchObject({ kind: 'saida', motive: 'outro', motiveLabel: 'Doação' });
    view.unmount();
  });

  it('never keeps a leading zero in the quantity', async () => {
    stubMoves({ status: 201, body: {} });
    const user = userEvent.setup();
    render(<StockMoveSheet request={{ kind: 'entrada', productId: product.id, session: 6 }} data={stockData(3)} onMotives={vi.fn()} onClose={vi.fn()} />);
    const qty = screen.getByLabelText('Quantidade');
    expect(screen.getByRole('button', { name: 'Diminuir quantidade' })).toBeDisabled(); // already at 1
    await user.clear(qty);
    await user.type(qty, '0');
    expect(qty).toHaveValue('');
    await user.type(qty, '025');
    expect(qty).toHaveValue('25');
    await user.clear(qty);
    await user.tab();
    expect(qty).toHaveValue('1');
  });
});
