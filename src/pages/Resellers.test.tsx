import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createCatalogSeed } from '../data/seed';
import { useCatalog } from '../store/catalog';
import { ResellersPage } from './Resellers';

const catalog = createCatalogSeed();

function show() {
  useCatalog.setState({ data: catalog, version: 1, status: 'ready', offline: false });
  return render(
    <MemoryRouter initialEntries={['/revendedoras']}>
      <Routes>
        <Route path="/revendedoras" element={<ResellersPage />} />
        <Route path="/privacidade" element={<p>Página de privacidade</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResellersPage consent', () => {
  it('links to the privacy policy without ticking the consent, and keeps what she typed when she comes back', async () => {
    const user = userEvent.setup();
    const view = show();
    await user.type(screen.getByLabelText(/Nome completo/), 'Ana Souza');
    const consent = screen.getByRole('checkbox');
    const link = screen.getByRole('link', { name: 'política de privacidade' });
    expect(link).toHaveAttribute('href', '/privacidade');
    expect(link).not.toHaveAttribute('target');
    await user.click(link);
    expect(consent).not.toBeChecked();
    expect(await screen.findByText('Página de privacidade')).toBeInTheDocument();
    view.unmount();
    show();
    expect(screen.getByLabelText(/Nome completo/)).toHaveValue('Ana Souza');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
