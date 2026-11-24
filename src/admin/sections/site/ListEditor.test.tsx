import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { polyfillDialog } from '../../testUtils';
import { ListEditor } from './ListEditor';

polyfillDialog();

interface Item {
  id: string;
  text: string;
}

let seq = 0;
function Harness({ initial, max = 3, min = 0 }: { initial: Item[]; max?: number; min?: number }) {
  const [items, setItems] = useState(initial);
  return (
    <>
      <ListEditor<Item>
        title="Dicas"
        items={items}
        onChange={setItems}
        max={max}
        min={min}
        itemName="dica"
        addLabel="Adicionar dica"
        newItem={() => ({ id: `n${++seq}`, text: '' })}
        renderItem={(item, i) => (
          <label>
            Texto da dica {i + 1}
            <input value={item.text} onChange={(e) => setItems((list) => list.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x)))} />
          </label>
        )}
      />
      <output data-testid="order">{items.map((i) => i.text || i.id).join(',')}</output>
    </>
  );
}

const order = () => screen.getByTestId('order').textContent;

describe('ListEditor', () => {
  it('adds items up to the limit, counting "x de N", and focuses the new item', async () => {
    render(<Harness initial={[{ id: 'a', text: 'A' }]} max={2} />);
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar dica' }));
    expect(screen.getByText(/2 de 2/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Texto da dica 2' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Adicionar dica' })).toBeDisabled();
    expect(screen.getByText(/limite atingido/)).toBeInTheDocument();
  });

  it('moves items up and down and keeps focus on the moved item', async () => {
    render(<Harness initial={[{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }]} />);
    expect(screen.getByRole('button', { name: 'Mover dica 1 para cima' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Mover dica 3 para cima' }));
    expect(order()).toBe('A,C,B');
    // C is now item 2; its "up" button keeps the focus.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mover dica 2 para cima' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Mover dica 2 para cima' }));
    expect(order()).toBe('C,A,B');
    // At the top "up" is disabled, so the focus goes to its "down" button.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mover dica 1 para baixo' })).toHaveFocus());
    expect(screen.getByText('Dica movida para a posição 1 de 3.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mover dica 1 para baixo' }));
    expect(order()).toBe('A,C,B');
  });

  it('deletes only after confirmation', async () => {
    render(<Harness initial={[{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Apagar dica 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Apagar esta dica?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(order()).toBe('A,B');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar dica 1' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Apagar esta dica?' })).getByRole('button', { name: 'Apagar' }));
    expect(order()).toBe('B');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar dica' })).toHaveFocus());
  });

  it('keeps the minimum number of items', () => {
    render(<Harness initial={[{ id: 'a', text: 'A' }]} min={1} />);
    expect(screen.getByRole('button', { name: 'Apagar dica 1' })).toBeDisabled();
    expect(screen.getByText('Deixe pelo menos 1 dica.')).toBeInTheDocument();
  });
});
