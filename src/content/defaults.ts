import { business } from '../config/business';
import type { Sections, SectionId, SiteContent, QaItem } from '../data/content';
import type { Settings } from '../data/schema';

/*
 * Built-in site text: what each section shows until the owner saves her own
 * (Painel → Site). Some defaults depend on business facts so the site never
 * claims what was not confirmed (docs/conteudo/PLAN.md §3). The owner's saved
 * section replaces the default as a whole.
 */

/** Facts the defaults depend on (settings + the "loja" section, see factsOf). */
export interface ContentFacts {
  warrantyMonths: number | null;
  whatsapp: string | null;
  shipsNationwide: boolean | null;
  hypoallergenic: boolean | null;
  installments: number | null;
  plating: string | null;
  consignment: boolean | null;
  noUpfrontInvestment: boolean | null;
}

/** Date of the built-in privacy policy text (shown as "Atualizada em" until she saves her own). */
export const DEFAULT_PRIVACY_DATE = '2026-11-24T12:00:00.000Z';

export function defaultLoja(): Sections['loja'] {
  return {
    hypoallergenic: business.hypoallergenic,
    shipsNationwide: business.shipsNationwide,
    installments: business.installments ?? 0,
    plating: business.plating ?? '',
    consignment: business.resellerProgram.consignment,
    noUpfrontInvestment: business.resellerProgram.noUpfrontInvestment,
  };
}

/** The facts as the site sees them: settings, then the owner's "loja" section over src/config/business.ts. */
export function factsOf(settings: Pick<Settings, 'warrantyMonths' | 'whatsapp'>, content: SiteContent | undefined): ContentFacts {
  const loja = content?.loja ?? defaultLoja();
  const whatsapp = settings.whatsapp?.trim() ? settings.whatsapp.trim() : null;
  return {
    warrantyMonths: settings.warrantyMonths > 0 ? settings.warrantyMonths : null,
    whatsapp,
    shipsNationwide: loja.shipsNationwide,
    hypoallergenic: loja.hypoallergenic,
    installments: loja.installments > 0 ? loja.installments : null,
    plating: loja.plating.trim() ? loja.plating.trim() : null,
    consignment: loja.consignment,
    noUpfrontInvestment: loja.noUpfrontInvestment,
  };
}

const warrantyLabel = (months: number) => (months === 12 ? 'Garantia de 1 ano' : `Garantia de ${months} ${months === 1 ? 'mês' : 'meses'}`);

function homeFaq(f: ContentFacts): QaItem[] {
  const out: QaItem[] = [
    {
      id: 'faq-pedido',
      question: 'Como faço meu pedido?',
      answer:
        'Escolha as peças, coloque na sacola e toque em “Finalizar pedido”. A mensagem do WhatsApp já vai pronta com as peças, os acabamentos e o total, e a gente combina pagamento e entrega por lá.',
    },
  ];
  if (f.warrantyMonths) {
    out.push({
      id: 'faq-garantia',
      question: 'Qual a garantia?',
      answer: `${warrantyLabel(f.warrantyMonths)} contra defeitos no banho, com uso normal. Veja os detalhes na página Garantia e trocas.`,
    });
  }
  if (f.shipsNationwide) {
    out.push({ id: 'faq-envio', question: 'Vocês enviam para minha cidade?', answer: 'Sim, enviamos para todo o Brasil. O valor e o prazo do frete são combinados no WhatsApp, de acordo com o seu CEP.' });
  }
  out.push(
    {
      id: 'faq-banho',
      question: 'O banho escurece?',
      answer: 'Com os cuidados certos, as peças mantêm o brilho por muito tempo. Evite perfume, água e produtos químicos em contato direto e guarde cada peça separada.',
    },
    { id: 'faq-esgotada', question: 'Posso encomendar uma peça que está esgotada?', answer: 'Pode sim. Toque em “Avise-me” na peça ou fale com a gente pelo WhatsApp que avisamos quando ela voltar.' },
  );
  return out;
}

function privacyBlocks(f: ContentFacts): Sections['privacidade']['blocks'] {
  const contact = f.whatsapp ? 'pelo nosso WhatsApp (o botão de WhatsApp em qualquer página do site)' : 'pelo nosso WhatsApp, no botão de contato do site';
  return [
    {
      id: 'quem-somos',
      title: 'Quem somos',
      text: `A ÉKA Semijoias é a responsável pelos dados pessoais tratados neste site, no painel das revendedoras e no atendimento. Para qualquer assunto sobre os seus dados, fale com a gente ${contact}.`,
    },
    {
      id: 'dados',
      title: 'Quais dados usamos e para quê',
      text: [
        'Pedidos: seu nome, sua cidade, as peças escolhidas e a observação que você escrever. Servem para registrar o pedido, combinar o pagamento e a entrega pelo WhatsApp e cumprir a garantia.',
        'Pré-cadastro de revendedora: nome, WhatsApp, cidade, estado, Instagram, se já revende, como conheceu a ÉKA e a sua autorização de contato. Servem para avaliar o cadastro e conversar com você sobre a revenda.',
        'Comprovante de pagamento: o arquivo que você envia na página de pagamento, usado só para conferir o pagamento do pedido.',
        'Pix automático: quando ele está disponível, pedimos o seu e-mail porque o Mercado Pago exige. O e-mail vai direto para o Mercado Pago e não fica guardado com a gente.',
        'Clientes atendidas: a loja pode cadastrar nome, WhatsApp, cidade, Instagram e aniversário de quem compra, para registrar compras, enviar o resumo da compra com a garantia e atender melhor.',
        'Revendedoras: dados do cadastro, peças da maleta, vendas registradas, acertos e o aceite do contrato (nome digitado, data, versão do contrato e um código que identifica a rede sem guardar o endereço dela).',
      ].join('\n\n'),
    },
    {
      id: 'aparelho',
      title: 'O que fica só no seu aparelho',
      text: 'A sacola, os favoritos e os dados que você digita no pedido ficam guardados no próprio navegador, para você não perder nada ao voltar. Eles não são enviados para a gente até você finalizar o pedido. Você pode apagá-los limpando os dados do site no navegador.',
    },
    {
      id: 'compartilhamento',
      title: 'Com quem compartilhamos',
      text: [
        'Não vendemos nem alugamos os seus dados. Eles passam apenas por serviços necessários para o site funcionar:',
        'Cloudflare: hospeda o site e o banco de dados. Os servidores podem ficar fora do Brasil, com as proteções exigidas pela LGPD.',
        'WhatsApp (Meta): quando você toca em um botão de WhatsApp, a conversa acontece no aplicativo, com as regras de privacidade dele.',
        'Mercado Pago: só quando você paga pelo Pix automático.',
      ].join('\n\n'),
    },
    {
      id: 'tempo',
      title: 'Por quanto tempo guardamos',
      text: 'Guardamos os dados enquanto forem necessários para as finalidades acima: atender o pedido, cumprir a garantia e as obrigações legais e manter a parceria com as revendedoras. Depois disso, ou quando você pedir, a gente apaga ou anonimiza os dados (o pedido continua contado nas vendas, mas sem o seu nome).',
    },
    {
      id: 'direitos',
      title: 'Seus direitos',
      text: `Pela Lei Geral de Proteção de Dados (Lei 13.709/2018, art. 18), você pode pedir para saber quais dados temos sobre você, corrigir, apagar, receber uma cópia, saber com quem compartilhamos e retirar a sua autorização de contato. É só pedir ${contact}. A gente responde o quanto antes e, no máximo, no prazo da lei.`,
    },
    {
      id: 'seguranca',
      title: 'Segurança',
      text: 'O site só funciona com conexão segura (HTTPS). O painel da loja e o das revendedoras exigem senha, e as senhas ficam guardadas de forma cifrada, nunca como texto. Os dados pessoais só aparecem para quem tem acesso ao painel.',
    },
    {
      id: 'cookies',
      title: 'Cookies',
      text: 'Usamos apenas os cookies necessários para manter o acesso ao painel da loja e ao painel das revendedoras. Não usamos cookies de propaganda nem de rastreamento.',
    },
    {
      id: 'mudancas',
      title: 'Mudanças nesta política',
      text: 'Quando esta política mudar, a data no topo da página é atualizada. Se a mudança for importante, a gente avisa no site.',
    },
  ];
}

/** Built-in text of every section for the given facts. */
export function defaultSections(f: ContentFacts): Sections {
  return {
    inicio: {
      hero: {
        title: 'Brilho que acompanha',
        highlight: 'você',
        subtitle: f.plating ? 'Semijoias com banho de qualidade e acabamento impecável' : 'Semijoias com acabamento impecável, para usar todos os dias',
        primaryCta: 'Ver catálogo',
        secondaryCta: 'Seja revendedora',
        image: { src: 'images/lifestyle/l01-hero-pescoco', alt: 'Brinco Gota Cristal e Colar Ponto de Luz em ouro rosé, usados' },
      },
      titles: {
        categories: 'Categorias',
        featured: 'Mais amadas',
        newArrivals: 'Novidades',
        care: 'Como cuidar',
        testimonials: 'Quem usa, recomenda',
        faq: 'Perguntas frequentes',
      },
      resellerBand: {
        show: true,
        title: 'Seja uma revendedora ÉKA',
        text: 'Aumente sua renda com semijoias de alta qualidade, suporte de perto e condições especiais.',
        cta: 'Quero revender',
        image: { src: 'images/lifestyle/l02-mostruario-revendedora', alt: '' },
      },
      careTips: [
        { id: 'tip-perfume', title: 'Perfume antes, joia depois', text: 'Passe perfume, creme e maquiagem e espere secar antes de colocar as peças.' },
        { id: 'tip-agua', title: 'Longe da água', text: 'Tire para tomar banho, nadar, ir à praia ou treinar. Suor e cloro desgastam o banho.' },
        { id: 'tip-guarde', title: 'Guarde separado', text: 'Cada peça no seu saquinho, longe da umidade, para não riscar nem embaraçar.' },
      ],
      instagram: [
        { id: 'ig-1', src: 'images/lifestyle/l01-orelha', alt: '' },
        { id: 'ig-2', src: 'images/products/p02-argola-cravejada', alt: '' },
        { id: 'ig-3', src: 'images/lifestyle/l04-mao-aneis', alt: '' },
        { id: 'ig-4', src: 'images/products/p07-colar-medalha-sol', alt: '' },
        { id: 'ig-5', src: 'images/lifestyle/l01-colo', alt: '' },
        { id: 'ig-6', src: 'images/products/p10-pulseira-riviera', alt: '' },
      ],
    },
    // No invented testimonials: the section stays hidden until she adds real, authorized ones.
    depoimentos: { items: [] },
    perguntas: { items: homeFaq(f) },
    sobre: {
      header: { eyebrow: 'Sobre a ÉKA', title: 'Brilho com', highlight: 'história', intro: '' },
      story: [
        'Eu sou a Érika. A ÉKA nasceu do meu jeito de enxergar as semijoias: não como um enfeite para dias especiais, mas como aquele detalhe que faz a gente se sentir bonita numa terça-feira qualquer.',
        'Comecei escolhendo peças para mim e para as amigas, sempre com o mesmo cuidado: olhar o acabamento de perto, conferir o fecho, imaginar a peça no dia a dia. Com o tempo, essas escolhas viraram uma curadoria, e a curadoria virou a ÉKA.',
        'Hoje cada peça que chega aqui passa pelas minhas mãos antes de ir para as suas. E eu continuo atendendo do mesmo jeito que comecei: de perto, pelo WhatsApp, ajudando você a escolher o que combina com o seu estilo.',
      ].join('\n\n'),
      signature: 'Érika',
      image: null,
      valuesTitle: 'O que guia a ÉKA',
      values: [
        { id: 'valor-curadoria', title: 'Curadoria', text: 'Peças escolhidas uma a uma, pensando no uso real do dia a dia.' },
        { id: 'valor-acabamento', title: 'Acabamento', text: 'Pedras bem cravadas, fechos que dão segurança e um cuidado em cada detalhe.' },
        { id: 'valor-atendimento', title: 'Atendimento próximo', text: 'Conversa de verdade, sem pressa, do primeiro olhar até depois da compra.' },
      ],
    },
    cuidados: {
      header: { eyebrow: 'Cuidados', title: 'Como cuidar das suas', highlight: 'semijoias', intro: 'Pequenos hábitos fazem o brilho durar muito mais. Siga estes cuidados no dia a dia.' },
      steps: [
        { id: 'c-perfume', title: 'Perfume e creme primeiro', text: 'Passe perfume, hidratante e maquiagem, espere secar e só então coloque as peças.' },
        { id: 'c-agua', title: 'Tire antes da água', text: 'Banho, piscina, mar e academia: suor, cloro e sal aceleram o desgaste do banho.' },
        { id: 'c-quimicos', title: 'Longe de produtos químicos', text: 'Evite contato com álcool em gel, produtos de limpeza, esmalte e acetona.' },
        { id: 'c-guarde', title: 'Guarde separado', text: 'Cada peça no seu saquinho ou em um porta-joias com divisórias, para não riscar nem embaraçar.' },
        { id: 'c-flanela', title: 'Limpe com flanela seca', text: 'Depois de usar, passe uma flanela macia e seca para tirar a oleosidade da pele.' },
        { id: 'c-umidade', title: 'Fuja da umidade', text: 'Banheiro não é lugar de porta-joias. Prefira um ambiente seco e arejado.' },
        { id: 'c-dormir', title: 'Não durma com elas', text: 'Tirar as peças para dormir evita atrito, amassados e fechos forçados.' },
        { id: 'c-fechos', title: 'Confira os fechos', text: 'De vez em quando, veja se tarraxas, fechos e garras estão firmes.' },
      ],
      why: {
        title: 'Por que o banho escurece?',
        text: 'A semijoia tem uma base de metal coberta por uma camada fina de banho. O contato frequente com suor, perfume, cremes e produtos químicos vai desgastando essa camada aos poucos. Por isso os cuidados acima fazem tanta diferença: quanto menos atrito e química, mais tempo o brilho dura.',
      },
      productTips: [
        { id: 'pt-perfume', text: 'Coloque a peça depois do perfume, do creme e da maquiagem.' },
        { id: 'pt-agua', text: 'Tire para tomar banho, nadar, ir à praia e treinar.' },
        { id: 'pt-flanela', text: 'Limpe com flanela seca e guarde separada, longe da umidade.' },
      ],
    },
    garantia: {
      covered: [{ id: 'g-banho', text: 'Defeitos no banho, como descascar ou escurecer, com uso normal e os cuidados indicados' }],
      notCovered: [
        { id: 'g-pedras', text: 'Pedras que se soltam ou se perdem' },
        { id: 'g-quebra', text: 'Peças quebradas, amassadas ou entortadas' },
        { id: 'g-desgaste', text: 'Desgaste por contato com perfume, cremes, água ou produtos químicos' },
        { id: 'g-uso', text: 'Uso fora dos cuidados indicados' },
      ],
      steps: [
        { id: 'a-chame', text: 'Chame a gente no WhatsApp com o seu nome e a data do pedido.' },
        { id: 'a-foto', text: 'Envie uma foto da peça mostrando o defeito.' },
        { id: 'a-avalia', text: 'A gente avalia e combina com você o conserto ou a troca.' },
      ],
      exchanges: 'Quer trocar o tamanho ou o acabamento de uma peça que não foi usada? Fale com a gente pelo WhatsApp que explicamos como funciona.',
      productText: 'Cobre defeitos no banho com uso normal. Para acionar, é só chamar a gente no WhatsApp com uma foto da peça.',
    },
    revendedoras: {
      hero: {
        eyebrow: 'Seja revendedora',
        title: 'Renda extra com semijoias que',
        highlight: 'encantam',
        text: 'Torne-se uma revendedora ÉKA e conquiste mais liberdade financeira com peças de alta qualidade.',
        cta: 'Quero ser revendedora',
        image: { src: 'images/lifestyle/l02-mostruario-revendedora', alt: 'Mostruário de semijoias ÉKA aberto, com brincos, colares, anéis e pulseiras' },
      },
      stepsTitle: 'Como funciona',
      steps: [
        { id: 'r-cadastro', title: 'Cadastro', text: 'Preencha o pré-cadastro aqui embaixo, de forma rápida e simples.' },
        { id: 'r-conversa', title: 'Conversa e aprovação', text: 'A gente entra em contato pelo WhatsApp, tira suas dúvidas e aprova o seu cadastro.' },
        { id: 'r-mostruario', title: 'Receba seu mostruário', text: 'Você recebe um mostruário ÉKA com as nossas principais peças.' },
        { id: 'r-venda', title: 'Venda e ganhe', text: 'Apresente as semijoias, faça suas vendas e receba a sua comissão.' },
      ],
      benefitsTitle: 'Por que revender ÉKA',
      benefits: [
        ...(f.noUpfrontInvestment ? [{ id: 'b-investimento', title: 'Sem investimento inicial', text: 'Comece sem precisar comprar estoque.' }] : []),
        { id: 'b-comissao', title: 'Comissão atrativa', text: 'Ganhe em cada venda que você fizer.' },
        { id: 'b-suporte', title: 'Suporte e materiais', text: 'Orientação, catálogo e materiais de divulgação.' },
        { id: 'b-pecas', title: 'Peças que encantam', text: 'Acabamento impecável que as clientes notam de longe.' },
      ].slice(0, 3),
      faqTitle: 'Dúvidas',
      faq: [
        {
          id: 'rf-investir',
          question: 'Preciso investir para começar?',
          answer: f.noUpfrontInvestment ? 'Não. Você começa sem precisar comprar estoque.' : 'As condições para começar são explicadas na conversa de aprovação, sem compromisso.',
        },
        {
          id: 'rf-mostruario',
          question: 'Como funciona o mostruário?',
          answer: f.consignment
            ? 'Você recebe as peças em consignado e acerta só o que vender.'
            : 'Depois da aprovação, a gente combina com você o mostruário ideal para começar, com prazos e condições claros.',
        },
        { id: 'rf-ganho', question: 'Quanto eu ganho?', answer: 'Você ganha uma comissão em cada venda. A gente apresenta os valores na conversa de aprovação.' },
        ...(f.shipsNationwide
          ? [{ id: 'rf-cidade', question: 'Vocês atendem a minha cidade?', answer: 'Enviamos para todo o Brasil. Preencha o pré-cadastro que a gente confirma os detalhes para a sua região.' }]
          : []),
      ],
      formTitle: 'Pré-cadastro',
      formIntro: 'Preencha seus dados e dê o primeiro passo para se tornar revendedora ÉKA.',
      menuText: 'Renda extra com as nossas peças',
    },
    contato: {
      header: { eyebrow: 'Contato', title: 'Fale com a', highlight: 'gente', intro: 'Tire dúvidas, peça ajuda para escolher ou faça seu pedido. A gente responde pelo WhatsApp.' },
      quickTitle: 'Mensagem rápida',
    },
    geral: {
      footerTagline: 'Peças que acompanham você todos os dias, com brilho que dura.',
      bagEmptyTitle: 'Sua sacola está vazia',
      bagEmptyText: 'Escolha suas peças preferidas e envie o pedido pelo WhatsApp em poucos toques.',
      afterOrderText: 'Agora envie o pedido pelo WhatsApp. A gente confirma a disponibilidade e combina com você o pagamento por lá.',
      notFoundTitle: 'Esta peça escapou da caixinha',
      notFoundText: 'Parece que ela saiu do lugar: pode ter deixado o catálogo ou o link mudou. Enquanto isso, que tal descobrir outras peças?',
    },
    privacidade: {
      header: {
        eyebrow: 'Privacidade',
        title: 'Política de',
        highlight: 'privacidade',
        intro: 'Aqui a gente explica, sem juridiquês, quais dados pessoais usa, para quê, com quem compartilha e como você pode pedir para ver, corrigir ou apagar os seus.',
      },
      blocks: privacyBlocks(f),
    },
    compartilhar: {
      title: 'ÉKA Semijoias · Semijoias com acabamento impecável',
      description: 'Brincos, colares, anéis, pulseiras e conjuntos com acabamento impecável. Escolha no site e peça pelo WhatsApp.',
      image: null,
    },
    loja: defaultLoja(),
  };
}

/** The section the site shows: the owner's saved one, or the built-in text. */
export function resolveSection<K extends SectionId>(id: K, content: SiteContent | undefined, facts: ContentFacts): Sections[K] {
  return (content?.[id] as Sections[K] | undefined) ?? defaultSections(facts)[id];
}
