import { isSectionId, type SectionId } from '../../../data/content';

/** Sections edited in Painel → Site ("loja" is edited in Configurações → "O que a loja oferece"). */
export type SiteSectionId = Exclude<SectionId, 'loja'>;

export const SITE_GROUPS: { title: string; intro: string; ids: SiteSectionId[] }[] = [
  { title: 'Páginas', intro: 'Os textos e as fotos de cada página do site.', ids: ['inicio', 'sobre', 'cuidados', 'garantia', 'revendedoras', 'contato', 'privacidade'] },
  { title: 'Listas', intro: 'Depoimentos e perguntas que aparecem na página inicial.', ids: ['depoimentos', 'perguntas'] },
  { title: 'Geral', intro: 'Textos que aparecem em várias partes do site e no Google.', ids: ['geral', 'compartilhar'] },
];

/** One line on where the section shows up. */
export const SITE_SECTION_INFO: Record<SiteSectionId, { description: string; href: string | null }> = {
  inicio: { description: 'A primeira página: chamada principal, títulos, faixa da revenda, dicas de cuidado e fotos do Instagram.', href: '/' },
  sobre: { description: 'Página Sobre: a sua história, a foto e o que guia a ÉKA.', href: '/sobre' },
  cuidados: { description: 'Página Como cuidar e o quadro de cuidados de cada peça.', href: '/como-cuidar' },
  garantia: { description: 'Página Garantia e trocas e o quadro de garantia de cada peça.', href: '/garantia' },
  revendedoras: { description: 'Página Seja revendedora e a frase do menu da loja.', href: '/revendedoras' },
  contato: { description: 'Página Contato.', href: '/contato' },
  privacidade: { description: 'Página Política de privacidade, com link no rodapé.', href: '/privacidade' },
  depoimentos: { description: 'O que as clientes dizem sobre a ÉKA, na página inicial.', href: '/' },
  perguntas: { description: 'Perguntas e respostas no fim da página inicial.', href: '/' },
  geral: { description: 'Rodapé, sacola vazia, mensagem depois do pedido e página não encontrada.', href: '/' },
  compartilhar: { description: 'Como o site aparece no Google e na prévia do link no WhatsApp e no Instagram.', href: null },
};

/** Sections whose built-in text follows the store facts (warranty, shipping, plating…) until she saves her own. */
export const FOLLOWS_FACTS: ReadonlySet<SiteSectionId> = new Set(['inicio', 'perguntas', 'revendedoras', 'privacidade']);

export const isSiteSectionId = (v: string | null): v is SiteSectionId => v != null && v !== 'loja' && isSectionId(v);
