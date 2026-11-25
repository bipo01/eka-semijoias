import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { DetailPage } from './DetailPage';

describe('DetailPage', () => {
  it('publishes its pinned footer height for the toasts while it is shown, and clears it after', () => {
    const header = { title: 'Brinco', backTo: '/admin/produtos', backLabel: 'Produtos' };
    const root = document.documentElement.style;
    const { unmount } = render(
      <DetailPage header={header} footer={<button type="button">Salvar</button>}>
        <p>Conteúdo</p>
      </DetailPage>,
    );
    expect(root.getPropertyValue('--detail-footer')).toMatch(/^\d+px$/);
    unmount();
    expect(root.getPropertyValue('--detail-footer')).toBe('');
  });

  it('publishes nothing without a footer', () => {
    render(
      <DetailPage header={{ title: 'Pedido', backTo: '/admin/pedidos', backLabel: 'Pedidos' }}>
        <p>Conteúdo</p>
      </DetailPage>,
    );
    expect(document.documentElement.style.getPropertyValue('--detail-footer')).toBe('');
  });
});
