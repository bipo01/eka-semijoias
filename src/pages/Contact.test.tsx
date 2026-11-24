import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SiteContent } from '../data/content';
import { createCatalogSeed } from '../data/seed';
import { useCatalog } from '../store/catalog';
import { ContactPage } from './Contact';

const catalog = createCatalogSeed();

function show(content?: SiteContent) {
  useCatalog.setState({ data: { ...catalog, ...(content ? { content } : {}) }, version: 1, status: 'ready', offline: false });
  return render(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>,
  );
}

describe('ContactPage', () => {
  it('shows the built-in texts until the owner saves her own', () => {
    show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fale com a gente');
    expect(screen.getByRole('heading', { level: 2, name: 'Mensagem rápida' })).toBeInTheDocument();
  });

  it('shows the owner’s saved texts over the defaults, and hides empty optional parts', () => {
    show({ contato: { header: { eyebrow: '', title: 'Chama a gente', highlight: '', intro: '' }, quickTitle: 'Escreva aqui' } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Chama a gente$/);
    expect(screen.getByRole('heading', { level: 1 }).querySelector('em')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Escreva aqui' })).toBeInTheDocument();
    expect(screen.queryByText('Mensagem rápida')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tire dúvidas/)).not.toBeInTheDocument();
    expect(screen.queryByText('Contato')).not.toBeInTheDocument();
  });

  it('updates live when the catalog brings a new version of the section', () => {
    show();
    expect(screen.getByRole('heading', { level: 2, name: 'Mensagem rápida' })).toBeInTheDocument();
    const header = { eyebrow: 'Contato', title: 'Fale com a', highlight: 'gente', intro: '' };
    // act() is implied: zustand notifies React synchronously and Testing Library flushes it.
    useCatalog.setState((s) => ({ data: { ...s.data, content: { contato: { header, quickTitle: 'Nova mensagem' } } }, version: 2 }));
    return screen.findByRole('heading', { level: 2, name: 'Nova mensagem' });
  });
});
