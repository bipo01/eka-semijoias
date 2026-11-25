import { business } from '../../config/business';
import type { SiteContent } from '../../data/content';
import type { Catalog, Product, Settings } from '../../data/schema';
import { formatPixKey } from '../../lib/pix';
import { maskPhone } from './contact';
import { adminPath } from './paths';

/*
 * "Complete as informações da loja": what the owner still has to tell the site, grouped by the
 * place in the panel where each answer is given. Configurações shows the whole meter on every
 * tab and, inside each tab, only that tab's items; Produtos and Site show their own items.
 * Every item can be completed from its place (an optional fact counts once she saved the form
 * that shows it, empty meaning "não tenho").
 */

export type SetupArea = 'loja' | 'oferta' | 'pix' | 'produtos' | 'site';

export const SETUP_AREAS: { id: SetupArea; label: string; to: string }[] = [
  { id: 'loja', label: 'Loja', to: adminPath('configuracoes') },
  { id: 'oferta', label: 'O que oferecemos', to: `${adminPath('configuracoes')}?aba=oferta` },
  { id: 'pix', label: 'Pix', to: `${adminPath('configuracoes')}?aba=pix` },
  { id: 'produtos', label: 'Produtos', to: adminPath('produtos') },
  { id: 'site', label: 'Site', to: adminPath('site') },
];

type Source = Pick<Catalog, 'settings' | 'products'> & { content?: SiteContent | undefined };

interface ItemDef {
  key: string;
  area: SetupArea;
  label: string;
  /** Element id of the field that answers it (focused by "Preencher"), or a panel link. */
  field?: string;
  to?: string;
  /** Shown under a pending item when the way to complete it is not obvious. */
  hint?: string;
  done: (c: Source) => boolean;
  /** What is filled in now, for a done item. */
  value: (c: Source) => string;
}

/** She saved "Informações da loja": the values shown there (even the starting ones) are her answers. */
const confirmed = (s: Settings) => !!s.confirmedAt;
const yesNo = (v: boolean | null | undefined) => (v ? 'Sim' : 'Não');
const isStandIn = (p: Product) => p.images.length === 0 || p.images.some((i) => i.placeholder);

const ITEMS: ItemDef[] = [
  {
    key: 'whatsapp',
    area: 'loja',
    label: 'WhatsApp que recebe os pedidos',
    field: 'loja-whatsapp',
    done: (c) => !!c.settings.whatsapp,
    value: (c) => maskPhone(c.settings.whatsapp),
  },
  {
    key: 'instagram',
    area: 'loja',
    label: 'Perfil oficial do Instagram',
    field: 'loja-instagram',
    hint: 'Confira o perfil e salve, mesmo que ele já esteja certo.',
    done: (c) => !!c.settings.instagram && (c.settings.instagram !== business.instagram || confirmed(c.settings)),
    value: (c) => `@${c.settings.instagram}`,
  },
  {
    key: 'city',
    area: 'loja',
    label: 'Cidade/UF de atendimento',
    field: 'loja-city',
    done: (c) => !!c.settings.city.trim(),
    value: (c) => c.settings.city.trim(),
  },
  {
    key: 'showroom',
    area: 'loja',
    label: 'Showroom ou loja física',
    field: 'loja-showroom',
    hint: 'Se não tiver, deixe o endereço vazio e salve.',
    done: (c) => !!c.settings.showroom?.trim() || confirmed(c.settings),
    value: (c) => c.settings.showroom?.trim() || 'Não tem',
  },
  {
    key: 'warrantyMonths',
    area: 'loja',
    label: 'Prazo e regras da garantia',
    field: 'loja-warranty',
    hint: 'Confira o prazo e salve, mesmo que ele já esteja certo.',
    done: (c) => c.settings.warrantyMonths !== business.warrantyMonths || !!c.settings.warrantyTerms?.trim() || confirmed(c.settings),
    value: (c) => {
      const m = c.settings.warrantyMonths;
      if (m === 0) return 'Sem garantia';
      return `${m} ${m === 1 ? 'mês' : 'meses'}${c.settings.warrantyTerms?.trim() ? ', com regras' : ''}`;
    },
  },
  // Store facts start from business.ts: they count once she saved "O que a loja oferece".
  {
    key: 'shipping',
    area: 'oferta',
    label: 'Envio para todo o Brasil',
    field: 'oferta-shipsNationwide',
    done: (c) => c.content?.loja != null && c.content.loja.shipsNationwide !== null,
    value: (c) => yesNo(c.content?.loja?.shipsNationwide),
  },
  {
    key: 'payment',
    area: 'oferta',
    label: 'Parcelamento sem juros',
    field: 'oferta-installments',
    done: (c) => c.content?.loja != null,
    value: (c) => {
      const n = c.content?.loja?.installments ?? 0;
      return n > 0 ? `Até ${n}x` : 'Não mostrar';
    },
  },
  {
    key: 'plating',
    area: 'oferta',
    label: 'Banho das peças',
    field: 'oferta-plating',
    done: (c) => !!c.content?.loja?.plating.trim(),
    value: (c) => c.content?.loja?.plating.trim() ?? '',
  },
  {
    key: 'hypoallergenic',
    area: 'oferta',
    label: 'Peças antialérgicas',
    field: 'oferta-hypoallergenic',
    done: (c) => c.content?.loja != null && c.content.loja.hypoallergenic !== null,
    value: (c) => yesNo(c.content?.loja?.hypoallergenic),
  },
  {
    key: 'reseller',
    area: 'oferta',
    label: 'Revenda: consignado e investimento inicial',
    field: 'oferta-consignment',
    hint: 'Responda “Sim” ou “Não” nas duas perguntas da revenda.',
    done: (c) => c.content?.loja != null && c.content.loja.consignment !== null && c.content.loja.noUpfrontInvestment !== null,
    value: (c) => `Consignado: ${yesNo(c.content?.loja?.consignment)} · Sem investimento: ${yesNo(c.content?.loja?.noUpfrontInvestment)}`,
  },
  {
    key: 'pix',
    area: 'pix',
    label: 'Chave Pix para receber os pedidos',
    field: 'pix-key',
    done: (c) => !!c.settings.pix,
    value: (c) => (c.settings.pix ? formatPixKey(c.settings.pix.key) : ''),
  },
  {
    key: 'photos',
    area: 'produtos',
    label: 'Fotos reais das peças',
    to: `${adminPath('produtos')}?fotos=provisorias`,
    done: (c) => c.products.length > 0 && !c.products.some(isStandIn),
    value: (c) => `${c.products.length} de ${c.products.length} peças`,
  },
  {
    key: 'about',
    area: 'site',
    label: 'Sua história na página Sobre',
    to: adminPath('site', 'sobre'),
    done: (c) => c.content?.sobre !== undefined,
    value: () => 'No site',
  },
  {
    key: 'testimonials',
    area: 'site',
    label: 'Depoimentos de clientes',
    to: adminPath('site', 'depoimentos'),
    hint: 'Só com a autorização de cada cliente.',
    done: (c) => !!c.content?.depoimentos?.items.length,
    value: (c) => {
      const n = c.content?.depoimentos?.items.length ?? 0;
      return `${n} no site`;
    },
  },
];

export interface SetupItem {
  key: string;
  area: SetupArea;
  label: string;
  field?: string;
  to?: string;
  hint?: string;
  done: boolean;
  /** What is filled in now (done items only). */
  value: string | null;
  /** Partial progress of a pending item ("3 de 24 peças com foto real"). */
  progress?: string;
}

export interface AreaStatus {
  id: SetupArea;
  label: string;
  to: string;
  items: SetupItem[];
  done: number;
  total: number;
}

export interface SetupStatus {
  items: SetupItem[];
  areas: AreaStatus[];
  done: number;
  total: number;
  /** Where to go next: the first area with something missing. */
  next: AreaStatus | null;
}

/** Pieces still on a stand-in photo (or none at all). */
export const standInProducts = (products: Product[]) => products.filter(isStandIn);

export function setupStatus(source: Source): SetupStatus {
  const items: SetupItem[] = ITEMS.map((def) => {
    const done = def.done(source);
    const item: SetupItem = { key: def.key, area: def.area, label: def.label, done, value: done ? def.value(source) || null : null };
    if (def.field) item.field = def.field;
    if (def.to) item.to = def.to;
    if (def.hint) item.hint = def.hint;
    if (def.key === 'photos' && !done && source.products.length) {
      const real = source.products.length - standInProducts(source.products).length;
      item.progress = `${real} de ${source.products.length} peças com foto real`;
    }
    return item;
  });
  const areas = SETUP_AREAS.map((a) => {
    const own = items.filter((i) => i.area === a.id);
    return { ...a, items: own, done: own.filter((i) => i.done).length, total: own.length };
  });
  const done = items.filter((i) => i.done).length;
  return { items, areas, done, total: items.length, next: areas.find((a) => a.done < a.total) ?? null };
}
