import {
  BarChart3,
  Contact,
  DatabaseBackup,
  Gem,
  House,
  Ellipsis,
  LayoutGrid,
  MessageCircleHeart,
  Package,
  PanelsTopLeft,
  Settings,
  ShoppingBag,
  Users,
  type LucideIcon,
} from 'lucide-react';

/*
 * The panel's sections, grouped the same way in the desktop sidebar and in the phone's "Mais" page.
 * The phone's bottom bar shows Início + the three daily sections + Mais.
 */

export interface NavItem {
  /** Path under /admin ('' = Início). */
  path: string;
  /** Page title. */
  label: string;
  /** Shorter name for the phone's bottom bar. */
  short?: string;
  /** One line under the name on the "Mais" page. */
  hint: string;
  icon: LucideIcon;
}

export const HOME: NavItem = { path: '', label: 'Início', hint: 'Visão geral da loja', icon: House };

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Vendas',
    items: [
      { path: 'pedidos', label: 'Pedidos', hint: 'Pedidos do site e vendas fechadas', icon: ShoppingBag },
      { path: 'clientes', label: 'Clientes', hint: 'Quem já comprou com você', icon: Contact },
      { path: 'revendedoras', label: 'Revendedoras', short: 'Revenda', hint: 'Maletas, vendas e acertos', icon: Users },
      { path: 'relatorio', label: 'Relatório', hint: 'Quanto vendeu e o que mais sai', icon: BarChart3 },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { path: 'produtos', label: 'Produtos', hint: 'Peças, fotos e preços', icon: Gem },
      { path: 'estoque', label: 'Estoque', hint: 'Entradas, saídas e o que acabou', icon: Package },
      { path: 'categorias', label: 'Categorias', hint: 'Como as peças se organizam', icon: LayoutGrid },
    ],
  },
  {
    title: 'Loja online',
    items: [
      { path: 'site', label: 'Site', hint: 'Textos, fotos e depoimentos', icon: PanelsTopLeft },
      { path: 'mensagens', label: 'Mensagens', hint: 'Textos prontos do WhatsApp', icon: MessageCircleHeart },
    ],
  },
  {
    title: 'Ajustes',
    items: [
      { path: 'configuracoes', label: 'Configurações', hint: 'Contato, Pix, avisos e PIN', icon: Settings },
      { path: 'backup', label: 'Backup', hint: 'Cópia de segurança do catálogo', icon: DatabaseBackup },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = [HOME, ...NAV_GROUPS.flatMap((g) => g.items)];

export const MORE: NavItem = { path: 'mais', label: 'Mais', hint: 'Todas as áreas do painel', icon: Ellipsis };

/** The phone's bottom bar. */
export const BOTTOM_BAR = ['', 'pedidos', 'revendedoras', 'produtos'] as const;

export function navItem(path: string): NavItem | undefined {
  return path === MORE.path ? MORE : NAV_ITEMS.find((i) => i.path === path);
}
