import { business } from '../config/business';
import { DEFAULT_PIN_HASH } from '../lib/hash';
import {
  FINISH_LABEL,
  SCHEMA_VERSION,
  type CatalogState,
  type Category,
  type Collection,
  type Finish,
  type Product,
  type ProductImage,
  type Tag,
  type Variant,
} from './schema';

/*
 * Initial catalog. All photos are stand-ins (placeholder: true) until the
 * owner's real photos replace them through the admin. Material/plating wording
 * stays generic until the plating spec is confirmed (business.plating).
 */

const RING_SIZES = ['12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22'];
const BRACELET_SIZES = ['P', 'M', 'G'];

const categories: Category[] = [
  { id: 'cat-brincos', slug: 'brincos', name: 'Brincos', order: 0, imageId: 'img-p01' },
  { id: 'cat-colares', slug: 'colares', name: 'Colares', order: 1, imageId: 'img-p05' },
  { id: 'cat-aneis', slug: 'aneis', name: 'Anéis', order: 2, imageId: 'img-p08' },
  { id: 'cat-pulseiras', slug: 'pulseiras', name: 'Pulseiras', order: 3, imageId: 'img-p10' },
  { id: 'cat-conjuntos', slug: 'conjuntos', name: 'Conjuntos', order: 4, imageId: 'img-p12' },
  { id: 'cat-tornozeleiras', slug: 'tornozeleiras', name: 'Tornozeleiras', order: 5 },
];

const collections: Collection[] = [
  {
    id: 'col-rose',
    slug: 'rose',
    name: 'Coleção Rosé',
    description: 'Zircônias cristalinas e o tom rosado do ouro rosé, em peças que vão do dia a dia às ocasiões especiais.',
    heroImage: 'images/lifestyle/l03-editorial-colecao-rose',
    featuredOnHome: true,
    order: 0,
  },
  {
    id: 'col-presentes',
    slug: 'presentes',
    name: 'Para presentear',
    description: 'Peças delicadas que agradam sem erro, escolhidas para aniversários, datas especiais e lembranças.',
    heroImage: 'images/lifestyle/l01-colo',
    featuredOnHome: false,
    order: 1,
  },
];

interface SeedImage {
  key: string;
  src: string;
  /** Finish the photo shows (used for the alt text). */
  finish: Finish;
  onSkin?: boolean;
}

interface SeedProduct {
  key: string;
  name: string;
  category: string;
  collections?: string[];
  price: number;
  promo?: number;
  description: string;
  details: Product['details'];
  images: SeedImage[];
  /** Finishes offered; the first finish owns the photos. */
  finishes: Finish[];
  sizes?: string[];
  available?: boolean;
  unavailableFinishes?: Finish[];
  featured?: boolean;
  tags?: Tag[];
  daysAgo: number;
}

const P = (name: string) => `images/products/${name}`;
const L = (name: string) => `images/lifestyle/${name}`;

const rosePlated = { material: 'Latão', plating: 'Banho de ouro rosé' };

const items: SeedProduct[] = [
  {
    key: 'p01',
    name: 'Brinco Gota Cristal',
    category: 'cat-brincos',
    collections: ['col-rose'],
    price: 15990,
    promo: 12990,
    description:
      'Gota de zircônia lapidada com contorno de pequenos pontos de brilho. Leve na orelha, ilumina o rosto e vai bem do trabalho ao jantar.',
    details: { ...rosePlated, stones: 'Zircônia cristal', dimensions: '2,8 cm × 1 cm', clasp: 'Tarraxa', weight: '3 g (par)' },
    images: [
      { key: 'p01', src: P('p01-brinco-gota-cristal'), finish: 'rose' },
      { key: 'p01-pele', src: L('l01-orelha'), finish: 'rose', onSkin: true },
    ],
    finishes: ['rose', 'dourado', 'prateado'],
    featured: true,
    tags: ['novo'],
    daysAgo: 4,
  },
  {
    key: 'p02',
    name: 'Argola Cravejada',
    category: 'cat-brincos',
    price: 11990,
    description: 'Argola média cravejada na parte da frente, com fecho click que encaixa firme. Brilho discreto para usar todos os dias.',
    details: { ...rosePlated, stones: 'Zircônia cristal', dimensions: '1,6 cm de diâmetro', clasp: 'Click', weight: '4 g (par)' },
    images: [{ key: 'p02', src: P('p02-argola-cravejada'), finish: 'rose' }],
    finishes: ['rose', 'dourado', 'prateado'],
    tags: ['mais-vendido'],
    daysAgo: 60,
  },
  {
    key: 'p03',
    name: 'Ear Cuff Folhagem',
    category: 'cat-brincos',
    price: 8990,
    promo: 7990,
    description: 'Ramo de folhas que contorna a orelha, com dois pontos de zircônia. Não precisa de furo extra: é só encaixar e ajustar.',
    details: { ...rosePlated, stones: 'Zircônia cristal', dimensions: '3,2 cm × 1,2 cm', clasp: 'Pressão (sem furo)', weight: '2 g' },
    images: [{ key: 'p03', src: P('p03-ear-cuff-folhagem'), finish: 'rose' }],
    finishes: ['rose', 'prateado'],
    tags: ['novo'],
    daysAgo: 9,
  },
  {
    key: 'p04',
    name: 'Brinco Pérola Clássico',
    category: 'cat-brincos',
    collections: ['col-presentes'],
    price: 6990,
    description: 'Pérola sintética de 8 mm com brilho acetinado, presa em base polida. O clássico que combina com tudo.',
    details: { ...rosePlated, stones: 'Pérola sintética 8 mm', dimensions: '0,8 cm', clasp: 'Tarraxa', weight: '2 g (par)' },
    images: [{ key: 'p04', src: P('p04-brinco-perola-classico'), finish: 'rose' }],
    finishes: ['rose', 'dourado', 'prateado'],
    daysAgo: 120,
  },
  {
    key: 'p05',
    name: 'Colar Ponto de Luz',
    category: 'cat-colares',
    collections: ['col-rose', 'col-presentes'],
    price: 14990,
    description: 'Corrente fina com uma zircônia redonda presa em garras. Delicado, fica lindo sozinho ou em camadas.',
    details: { ...rosePlated, stones: 'Zircônia cristal 6 mm', dimensions: 'Corrente de 45 cm com extensor de 5 cm', clasp: 'Fecho lagosta', weight: '3 g' },
    images: [
      { key: 'p05', src: P('p05-colar-ponto-de-luz'), finish: 'rose' },
      { key: 'p05-pele', src: L('l01-colo'), finish: 'rose', onSkin: true },
    ],
    finishes: ['rose', 'dourado', 'prateado'],
    featured: true,
    tags: ['mais-vendido'],
    daysAgo: 45,
  },
  {
    key: 'p06',
    name: 'Choker Riviera',
    category: 'cat-colares',
    collections: ['col-rose'],
    price: 24990,
    description: 'Fileira contínua de zircônias que abraça o pescoço. Para festas, casamentos e para quem gosta de brilho de verdade.',
    details: { ...rosePlated, stones: 'Zircônias cristal 3 mm', dimensions: '35 cm com extensor de 7 cm', clasp: 'Fecho gaveta', weight: '14 g' },
    images: [{ key: 'p06', src: P('p06-choker-riviera'), finish: 'rose' }],
    finishes: ['rose', 'dourado'],
    daysAgo: 75,
  },
  {
    key: 'p07',
    name: 'Colar Medalha Sol',
    category: 'cat-colares',
    collections: ['col-presentes'],
    price: 15990,
    description: 'Medalha com raios em relevo e um pequeno ponto de luz no centro, em corrente piastrine. Um amuleto para o dia a dia.',
    details: { ...rosePlated, stones: 'Zircônia cristal', dimensions: 'Medalha de 1,8 cm · corrente de 45 cm', clasp: 'Fecho lagosta', weight: '5 g' },
    images: [{ key: 'p07', src: P('p07-colar-medalha-sol'), finish: 'rose' }],
    finishes: ['rose', 'dourado'],
    tags: ['novo'],
    daysAgo: 6,
  },
  {
    key: 'p08',
    name: 'Anel Solitário Delicado',
    category: 'cat-aneis',
    collections: ['col-presentes'],
    price: 13990,
    description: 'Aro fino com uma zircônia de 6 mm em seis garras. O solitário que cabe em qualquer momento.',
    details: { ...rosePlated, stones: 'Zircônia cristal 6 mm', dimensions: 'Aro de 1,5 mm', weight: '2 g' },
    images: [
      { key: 'p08', src: P('p08-anel-solitario-delicado'), finish: 'rose' },
      { key: 'p08-pele', src: L('l04-mao-aneis'), finish: 'rose', onSkin: true },
    ],
    finishes: ['rose', 'dourado', 'prateado'],
    sizes: RING_SIZES,
    featured: true,
    daysAgo: 30,
  },
  {
    key: 'p09',
    name: 'Anel Aparador Cravejado',
    category: 'cat-aneis',
    price: 9990,
    description: 'Meia aliança cravejada que fica linda sozinha ou junto do solitário. Fino e confortável.',
    details: { ...rosePlated, stones: 'Zircônias cristal', dimensions: 'Aro de 2 mm', weight: '2 g' },
    images: [
      { key: 'p09', src: P('p09-anel-aparador-cravejado'), finish: 'rose' },
      { key: 'p09-pele', src: L('l04-mao-aneis'), finish: 'rose', onSkin: true },
    ],
    finishes: ['rose', 'dourado'],
    sizes: RING_SIZES,
    daysAgo: 52,
  },
  {
    key: 'p10',
    name: 'Pulseira Riviera',
    category: 'cat-pulseiras',
    collections: ['col-rose'],
    price: 16990,
    description: 'Pulseira de zircônias alinhadas com fecho gaveta de trava dupla. Brilho contínuo no pulso.',
    details: { ...rosePlated, stones: 'Zircônias cristal 3 mm', dimensions: '17 cm (P), 18 cm (M), 19 cm (G)', clasp: 'Fecho gaveta com trava', weight: '9 g' },
    images: [
      { key: 'p10', src: P('p10-pulseira-riviera'), finish: 'rose' },
      { key: 'p10-pele', src: L('l04-mao-aneis'), finish: 'rose', onSkin: true },
    ],
    finishes: ['rose', 'dourado', 'prateado'],
    sizes: BRACELET_SIZES,
    featured: true,
    tags: ['mais-vendido'],
    daysAgo: 38,
  },
  {
    key: 'p11',
    name: 'Pulseira Elos',
    category: 'cat-pulseiras',
    price: 12990,
    description: 'Elos ovais polidos com fecho lagosta. Presença na medida certa, combina com relógio e com outras pulseiras.',
    details: { material: 'Latão', plating: 'Banho de ouro', dimensions: '18 cm com extensor de 3 cm', clasp: 'Fecho lagosta', weight: '11 g' },
    images: [{ key: 'p11', src: P('p11-pulseira-elos-dourada'), finish: 'dourado' }],
    finishes: ['dourado'],
    daysAgo: 90,
  },
  {
    key: 'p12',
    name: 'Conjunto Gota',
    category: 'cat-conjuntos',
    collections: ['col-rose', 'col-presentes'],
    price: 28990,
    promo: 25990,
    description: 'Colar e brincos com a gota de zircônia contornada de brilhantes. Um conjunto pronto para presentear.',
    details: { ...rosePlated, stones: 'Zircônia cristal', dimensions: 'Pingente de 1,8 cm · corrente de 45 cm · brincos de 1,2 cm', clasp: 'Fecho lagosta e tarraxa', weight: '6 g' },
    images: [{ key: 'p12', src: P('p12-conjunto-gota'), finish: 'rose' }],
    finishes: ['rose', 'prateado'],
    daysAgo: 20,
  },
  {
    key: 'p13',
    name: 'Colar Gota Cristal',
    category: 'cat-colares',
    collections: ['col-rose'],
    price: 13990,
    description: 'Pingente em gota com halo de zircônias, em corrente fina. O mesmo brilho do nosso conjunto Gota, para usar sozinho.',
    details: { ...rosePlated, stones: 'Zircônia cristal', dimensions: 'Pingente de 1,8 cm · corrente de 45 cm', clasp: 'Fecho lagosta', weight: '3 g' },
    images: [{ key: 'p13', src: P('p12-colar-gota'), finish: 'rose' }],
    finishes: ['rose', 'dourado', 'prateado'],
    tags: ['novo'],
    daysAgo: 2,
  },
  {
    key: 'p14',
    name: 'Conjunto Gota e Ponto de Luz',
    category: 'cat-conjuntos',
    collections: ['col-rose', 'col-presentes'],
    price: 25990,
    description: 'O Brinco Gota Cristal com o Colar Ponto de Luz: a combinação que mais pedem para eventos.',
    details: { ...rosePlated, stones: 'Zircônia cristal', dimensions: 'Brincos de 2,8 cm · corrente de 45 cm', clasp: 'Tarraxa e fecho lagosta', weight: '6 g' },
    images: [
      { key: 'p14-pele', src: L('l01-colo'), finish: 'rose', onSkin: true },
      { key: 'p14-brinco', src: P('p01-brinco-gota-cristal'), finish: 'rose' },
      { key: 'p14-colar', src: P('p05-colar-ponto-de-luz'), finish: 'rose' },
      { key: 'p14-orelha', src: L('l01-orelha'), finish: 'rose', onSkin: true },
    ],
    finishes: ['rose', 'dourado'],
    daysAgo: 14,
  },
  {
    key: 'p15',
    name: 'Kit Riviera',
    category: 'cat-conjuntos',
    collections: ['col-rose'],
    price: 28990,
    description: 'Choker e pulseira Riviera juntas, com o mesmo alinhamento de zircônias. Para quem quer brilho do pescoço ao pulso.',
    details: { ...rosePlated, stones: 'Zircônias cristal 3 mm', dimensions: 'Choker de 35 cm · pulseira de 18 cm', clasp: 'Fecho gaveta', weight: '23 g' },
    images: [
      { key: 'p15-choker', src: P('p06-choker-riviera'), finish: 'rose' },
      { key: 'p15-pulseira', src: P('p10-pulseira-riviera'), finish: 'rose' },
    ],
    finishes: ['rose'],
    daysAgo: 25,
  },
  {
    key: 'p16',
    name: 'Dupla Solitário e Aparador',
    category: 'cat-aneis',
    collections: ['col-presentes'],
    price: 21990,
    description: 'O Anel Solitário Delicado com o Aparador Cravejado, pensados para serem usados juntos no mesmo dedo.',
    details: { ...rosePlated, stones: 'Zircônias cristal', dimensions: 'Aros de 1,5 mm e 2 mm', weight: '4 g' },
    images: [
      { key: 'p16-pele', src: L('l04-mao-aneis'), finish: 'rose', onSkin: true },
      { key: 'p16-solitario', src: P('p08-anel-solitario-delicado'), finish: 'rose' },
      { key: 'p16-aparador', src: P('p09-anel-aparador-cravejado'), finish: 'rose' },
    ],
    finishes: ['rose', 'dourado'],
    sizes: RING_SIZES,
    daysAgo: 11,
  },
  {
    key: 'p17',
    name: 'Brinco Pérola Mini',
    category: 'cat-brincos',
    collections: ['col-presentes'],
    price: 4990,
    description: 'Pérola sintética de 6 mm, pequena e luminosa. Perfeita para o segundo furo ou para quem prefere discrição.',
    details: { ...rosePlated, stones: 'Pérola sintética 6 mm', dimensions: '0,6 cm', clasp: 'Tarraxa', weight: '1 g (par)' },
    images: [{ key: 'p17', src: P('p04-brinco-perola-classico'), finish: 'rose' }],
    finishes: ['rose', 'dourado', 'prateado'],
    daysAgo: 100,
  },
  {
    key: 'p18',
    name: 'Argola Cravejada Ródio Negro',
    category: 'cat-brincos',
    price: 12990,
    description: 'A nossa argola cravejada em ródio negro: as zircônias ganham contraste e o visual fica mais marcante.',
    details: { material: 'Latão', plating: 'Banho de ródio negro', stones: 'Zircônia cristal', dimensions: '1,6 cm de diâmetro', clasp: 'Click', weight: '4 g (par)' },
    images: [{ key: 'p18', src: P('p02-argola-cravejada'), finish: 'rose' }],
    finishes: ['rodio-negro'],
    daysAgo: 16,
  },
  {
    key: 'p19',
    name: 'Colar Medalha Sol Prateado',
    category: 'cat-colares',
    price: 15990,
    description: 'A Medalha Sol no acabamento prateado, com o mesmo relevo de raios e o ponto de luz central.',
    details: { material: 'Latão', plating: 'Banho de ródio', stones: 'Zircônia cristal', dimensions: 'Medalha de 1,8 cm · corrente de 45 cm', clasp: 'Fecho lagosta', weight: '5 g' },
    images: [{ key: 'p19', src: P('p07-colar-medalha-sol'), finish: 'rose' }],
    finishes: ['prateado'],
    daysAgo: 70,
  },
  {
    key: 'p20',
    name: 'Anel Aparador Ródio Negro',
    category: 'cat-aneis',
    price: 10990,
    description: 'Meia aliança cravejada em ródio negro, para compor com anéis prateados ou usar sozinha.',
    details: { material: 'Latão', plating: 'Banho de ródio negro', stones: 'Zircônias cristal', dimensions: 'Aro de 2 mm', weight: '2 g' },
    images: [{ key: 'p20', src: P('p09-anel-aparador-cravejado'), finish: 'rose' }],
    finishes: ['rodio-negro'],
    sizes: RING_SIZES,
    daysAgo: 85,
  },
  {
    key: 'p21',
    name: 'Pulseira Elos Rosé',
    category: 'cat-pulseiras',
    price: 12990,
    description: 'A Pulseira Elos no tom rosé, com os mesmos elos ovais polidos e fecho lagosta.',
    details: { ...rosePlated, dimensions: '18 cm com extensor de 3 cm', clasp: 'Fecho lagosta', weight: '11 g' },
    images: [{ key: 'p21', src: P('p11-pulseira-elos-dourada'), finish: 'dourado' }],
    finishes: ['rose'],
    available: false,
    daysAgo: 110,
  },
  {
    key: 'p22',
    name: 'Ear Cuff Folhagem Dourado',
    category: 'cat-brincos',
    price: 8990,
    description: 'O ramo de folhas do nosso ear cuff no acabamento dourado. Encaixa sem furo e ajusta na orelha.',
    details: { material: 'Latão', plating: 'Banho de ouro', stones: 'Zircônia cristal', dimensions: '3,2 cm × 1,2 cm', clasp: 'Pressão (sem furo)', weight: '2 g' },
    images: [{ key: 'p22', src: P('p03-ear-cuff-folhagem'), finish: 'rose' }],
    finishes: ['dourado'],
    daysAgo: 33,
  },
  {
    key: 'p23',
    name: 'Choker Riviera Prateada',
    category: 'cat-colares',
    price: 24990,
    description: 'A Choker Riviera no acabamento prateado, com zircônias de 3 mm em fileira contínua.',
    details: { material: 'Latão', plating: 'Banho de ródio', stones: 'Zircônias cristal 3 mm', dimensions: '35 cm com extensor de 7 cm', clasp: 'Fecho gaveta', weight: '14 g' },
    images: [{ key: 'p23', src: P('p06-choker-riviera'), finish: 'rose' }],
    finishes: ['prateado'],
    available: false,
    daysAgo: 130,
  },
  {
    key: 'p24',
    name: 'Pulseira Riviera Prateada',
    category: 'cat-pulseiras',
    price: 16990,
    description: 'A Pulseira Riviera no acabamento prateado, com fecho gaveta de trava dupla.',
    details: { material: 'Latão', plating: 'Banho de ródio', stones: 'Zircônias cristal 3 mm', dimensions: '17 cm (P), 18 cm (M), 19 cm (G)', clasp: 'Fecho gaveta com trava', weight: '9 g' },
    images: [{ key: 'p24', src: P('p10-pulseira-riviera'), finish: 'rose' }],
    finishes: ['prateado'],
    sizes: BRACELET_SIZES,
    daysAgo: 64,
  },
];

const SEED_NOW = Date.parse('2026-11-19T12:00:00.000Z');

function buildProduct(item: SeedProduct, index: number): Product {
  const images: ProductImage[] = item.images.map((img) => ({
    id: `img-${img.key}`,
    src: img.src,
    alt: img.onSkin ? `${item.name} em ${FINISH_LABEL[img.finish]}, usada` : `${item.name} em ${FINISH_LABEL[img.finish]}`,
    placeholder: true,
  }));
  const variants: Variant[] = item.finishes.map((finish, i) => ({
    id: `var-${item.key}-${finish}`,
    finish,
    sku: `EKA-${item.category.slice(4, 6).toUpperCase()}-${item.key.slice(1).padStart(3, '0')}${i ? `-${finish.slice(0, 2).toUpperCase()}` : ''}`,
    ...(item.sizes ? { sizes: item.sizes } : {}),
    // The photos depict the first finish only when it matches the photographed finish.
    imageIds: i === 0 && item.images.every((img) => img.finish === finish) ? images.map((img) => img.id) : [],
    available: !(item.unavailableFinishes ?? []).includes(finish),
  }));
  const date = new Date(SEED_NOW - item.daysAgo * 86_400_000).toISOString();
  return {
    id: `prod-${item.key}`,
    slug: item.name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    name: item.name,
    categoryId: item.category,
    collectionIds: item.collections ?? [],
    price: item.price,
    ...(item.promo != null ? { promoPrice: item.promo } : {}),
    description: item.description,
    details: item.details,
    images,
    variants,
    available: item.available ?? true,
    featured: item.featured ?? false,
    tags: item.tags ?? [],
    order: index,
    createdAt: date,
    updatedAt: date,
  };
}

export function createSeed(): CatalogState {
  return {
    schemaVersion: SCHEMA_VERSION,
    products: items.map(buildProduct),
    categories: structuredClone(categories),
    collections: structuredClone(collections),
    leads: [],
    settings: {
      announcement: 'Pedidos pelo WhatsApp · Envio para todo o Brasil',
      whatsapp: business.whatsapp ?? '',
      instagram: business.instagram ?? '',
      city: business.city ?? '',
      showroom: business.showroom ?? '',
      openingHours: business.openingHours ?? '',
      warrantyMonths: business.warrantyMonths ?? 0,
      pinHash: DEFAULT_PIN_HASH,
    },
  };
}
