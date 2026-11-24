import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { defaultSections, factsOf } from '../content/defaults';
import type { SiteContent } from '../data/content';
import { createCatalogSeed } from '../data/seed';
import { useCatalog } from '../store/catalog';
import { PrivacyPage } from './Privacy';

const catalog = createCatalogSeed();

function show(content?: SiteContent) {
  useCatalog.setState({ data: { ...catalog, ...(content ? { content } : {}) }, version: 1, status: 'ready', offline: false });
  return render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>,
  );
}

describe('PrivacyPage', () => {
  it('shows the built-in policy: one titled section per block, its paragraphs and the date of the text', () => {
    show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Política de privacidade');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const blocks = defaultSections(factsOf(catalog.settings, undefined)).privacidade.blocks;
    for (const block of blocks) expect(screen.getByRole('region', { name: block.title })).toBeInTheDocument();
    // "Quais dados usamos" has one paragraph per kind of data.
    const dados = screen.getByRole('region', { name: 'Quais dados usamos e para quê' });
    expect(dados.querySelectorAll('p').length).toBe(6);
    expect(screen.getByText(/Atualizada em/)).toHaveTextContent('Atualizada em 24 de novembro de 2026');
    expect(document.title).toBe('Política de privacidade · ÉKA Semijoias');
  });

  it('shows the owner’s text and the date she saved it', () => {
    show({
      privacidade: {
        header: { eyebrow: '', title: 'Seus dados', highlight: '', intro: 'Linha um\nlinha dois' },
        blocks: [{ id: 'b1', title: 'Contato', text: 'Primeiro parágrafo.\n\nSegundo parágrafo.' }],
        updatedAt: '2027-03-05T15:00:00.000Z',
      },
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seus dados');
    expect(screen.getByText(/Linha um/)).toHaveClass('whitespace-pre-line');
    const block = screen.getByRole('region', { name: 'Contato' });
    expect(block.querySelectorAll('p')).toHaveLength(2);
    expect(screen.getByText(/Atualizada em/)).toHaveTextContent('Atualizada em 5 de março de 2027');
    expect(screen.queryByRole('region', { name: 'Cookies' })).not.toBeInTheDocument();
  });
});
