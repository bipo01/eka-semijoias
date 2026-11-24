import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { defaultSections, factsOf } from '../../content/defaults';
import { createCatalogSeed } from '../../data/seed';
import type { SiteContent, Testimonial } from '../../data/content';
import { useCatalog } from '../../store/catalog';
import { Testimonials } from './Testimonials';

const catalog = createCatalogSeed();
const defaultInicio = () => defaultSections(factsOf(catalog.settings, undefined)).inicio;

function show(content?: SiteContent) {
  useCatalog.setState({ data: { ...catalog, ...(content ? { content } : {}) }, version: 1, status: 'ready', offline: false });
  return render(<Testimonials />);
}

const item = (id: string, name: string, city = 'Cuiabá/MT'): Testimonial => ({ id, text: `Amei a peça, ${name}.`, name, city, authorized: true });

describe('Testimonials', () => {
  it('is gone (title included) until the owner publishes real ones', () => {
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading', { name: 'Quem usa, recomenda' })).not.toBeInTheDocument();
  });

  it('shows them in her order, with name and city and no star rating', () => {
    show({ depoimentos: { items: [item('b', 'Bia'), item('c', 'Carla', '')] } });
    expect(screen.getByRole('heading', { name: 'Quem usa, recomenda' })).toBeInTheDocument();
    const cards = within(screen.getByRole('list', { name: 'Depoimentos de clientes' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Amei a peça, Bia.');
    expect(cards[0]).toHaveTextContent('Bia · Cuiabá/MT');
    expect(cards[1]).toHaveAccessibleName('Depoimento 2 de 2');
    expect(cards[1]!.querySelector('figcaption')).toHaveTextContent(/^Carla$/);
    expect(screen.queryByRole('img', { name: /estrelas/ })).not.toBeInTheDocument();
  });

  it('uses the section title the owner saved', () => {
    const base = show({ depoimentos: { items: [item('b', 'Bia')] } });
    base.unmount();
    const inicio = { ...defaultInicio(), titles: { ...defaultInicio().titles, testimonials: 'Clientes ÉKA' } };
    show({ inicio, depoimentos: { items: [item('b', 'Bia')] } });
    expect(screen.getByRole('heading', { name: 'Clientes ÉKA' })).toBeInTheDocument();
  });
});
