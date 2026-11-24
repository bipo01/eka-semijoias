import { z } from 'zod';

/*
 * WhatsApp message templates (docs/vendas/MENSAGENS_PLAN.md). Shared by the
 * site, the admin and the tests; pure.
 *
 * Template rules:
 * - {variavel} is replaced by its value; unknown names stay as typed.
 * - [ … ] is an optional part: removed when any variable inside is empty.
 * - A line whose variables all came out empty is removed.
 * - WhatsApp formatting (*negrito*, _itálico_) passes through.
 * The built-in variations live here; settings.messages stores only what the
 * owner changed (edited texts, her own variations, the active choice).
 */

export const MESSAGE_TYPES = [
  'pedido',
  'duvida',
  'aviseme',
  'contato',
  'comprovante',
  'revendedora',
  'cobranca',
  'lembrete',
  'pago',
  'enviado',
  'posvenda',
  'boasvindas',
  'compra',
  'convite_revendedora',
  'venda_revendedora',
  'mostruario',
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const VARIABLES = {
  nome: { label: 'Nome', example: 'Ana Souza' },
  primeiro_nome: { label: 'Primeiro nome', example: 'Ana' },
  cidade: { label: 'Cidade', example: 'Dourados' },
  pedido: { label: 'Nº do pedido', example: '1024' },
  itens: { label: 'Peças', example: '1) Kit Riviera — Rosé — 1 un. — R$ 289,90\n2) Brinco Gota Cristal — Dourado — 1 un. — R$ 129,90' },
  total: { label: 'Total', example: 'R$ 439,80' },
  frete: { label: 'Frete', example: 'R$ 20,00' },
  desconto: { label: 'Desconto', example: 'R$ 10,00' },
  obs: { label: 'Observação', example: 'É para presente' },
  link: { label: 'Link de pagamento', example: 'https://eka.com.br/pagamento/xYz123' },
  pix: { label: 'Pix Copia e Cola', example: '00020126580014br.gov.bcb.pix…' },
  peca: { label: 'Peça', example: 'Anel Solitário Delicado (Dourado)' },
  link_peca: { label: 'Link da peça', example: 'https://eka.com.br/produto/anel-solitario-delicado' },
  loja: { label: 'Nome da loja', example: 'ÉKA Semijoias' },
  whatsapp: { label: 'WhatsApp', example: '(67) 99999-1234' },
  uf: { label: 'UF', example: 'MS' },
  instagram: { label: 'Instagram', example: 'anasouza' },
  ja_revende: { label: 'Já revende', example: 'Sim' },
  origem: { label: 'Como conheceu', example: 'Instagram' },
  rastreio: { label: 'Código de rastreio', example: 'AB123456789BR' },
  garantia: { label: 'Prazo da garantia', example: '6 meses' },
  garantia_ate: { label: 'Garantia até', example: '23/05/2027' },
  garantia_regras: { label: 'Regras da garantia', example: 'Cobre defeitos de fabricação e do banho. Não cobre peças amassadas, arranhadas ou em contato com produtos químicos.' },
  link_convite: { label: 'Link do primeiro acesso', example: 'https://eka.com.br/revenda/convite/aB12cD34' },
  link_mostruario: { label: 'Link do mostruário', example: 'https://eka.com.br/r/ana' },
  revendedora: { label: 'Nome da revendedora', example: 'Ana' },
} as const;
export type VariableName = keyof typeof VARIABLES;
export type MessageVars = Partial<Record<VariableName, string | null | undefined>>;

export interface MessageTypeInfo {
  label: string;
  /** When and where it is used (shown in the admin). */
  description: string;
  /**
   * "cliente": the customer sends it to the store (site buttons); "loja": the owner sends it (admin);
   * "revenda": used in the reseller program (the reseller's panel and showcase).
   */
  group: 'cliente' | 'loja' | 'revenda';
  vars: readonly VariableName[];
  /** The message cannot do its job without these (saving is refused). */
  required?: readonly VariableName[];
  /** Example values for the preview (the variables' own examples otherwise). */
  sample?: MessageVars;
  /** How {itens} is listed: numbered "1) …" (default) or bullets "• …". */
  itemsStyle?: 'numbered' | 'bullets';
}

export const MESSAGE_TYPE_INFO: Record<MessageType, MessageTypeInfo> = {
  pedido: {
    label: 'Pedido pela sacola',
    description: 'A cliente finaliza a sacola e toca em “Enviar pedido pelo WhatsApp”.',
    group: 'cliente',
    vars: ['pedido', 'itens', 'total', 'nome', 'cidade', 'obs', 'loja'],
    required: ['itens'],
  },
  duvida: {
    label: 'Dúvida sobre uma peça',
    description: 'Botão “Fale com a gente” na página de uma peça.',
    group: 'cliente',
    vars: ['peca', 'link_peca', 'loja'],
    sample: { peca: 'Anel Solitário Delicado' },
  },
  aviseme: {
    label: 'Avise-me quando voltar',
    description: 'Botão de uma peça esgotada.',
    group: 'cliente',
    vars: ['peca', 'link_peca', 'loja'],
  },
  contato: {
    label: 'Contato pelo site',
    description: 'Botão flutuante do WhatsApp, rodapé, menu e página de contato.',
    group: 'cliente',
    vars: ['loja'],
  },
  comprovante: {
    label: 'Comprovante enviado',
    description: 'Botão “Avisar no WhatsApp” depois que a cliente envia o comprovante pelo link.',
    group: 'cliente',
    vars: ['pedido', 'primeiro_nome', 'loja'],
  },
  revendedora: {
    label: 'Quero ser revendedora',
    description: 'Enviada ao terminar o pré-cadastro de revendedora.',
    group: 'cliente',
    vars: ['nome', 'whatsapp', 'cidade', 'uf', 'instagram', 'ja_revende', 'origem', 'loja'],
    required: ['nome'],
  },
  cobranca: {
    label: 'Cobrança Pix',
    description: 'No pedido, depois de “Cobrar por Pix”. Leva o link para pagar e enviar o comprovante.',
    group: 'loja',
    vars: ['primeiro_nome', 'pedido', 'itens', 'frete', 'desconto', 'total', 'link', 'pix', 'loja'],
    required: ['link'],
    itemsStyle: 'bullets',
  },
  lembrete: {
    label: 'Lembrete de pagamento',
    description: 'Para um pedido com cobrança em aberto.',
    group: 'loja',
    vars: ['primeiro_nome', 'pedido', 'total', 'link', 'loja'],
  },
  pago: {
    label: 'Pagamento confirmado',
    description: 'Depois de conferir o comprovante.',
    group: 'loja',
    vars: ['primeiro_nome', 'pedido', 'total', 'loja'],
  },
  enviado: {
    label: 'Pedido a caminho',
    description: 'Quando o pedido sai para entrega. O rastreio é preenchido na hora, se houver.',
    group: 'loja',
    vars: ['primeiro_nome', 'pedido', 'rastreio', 'loja'],
  },
  posvenda: {
    label: 'Pós-venda',
    description: 'Alguns dias depois da entrega, para saber se ela gostou.',
    group: 'loja',
    vars: ['primeiro_nome', 'pedido', 'loja'],
  },
  boasvindas: {
    label: 'Boas-vindas à revendedora',
    description: 'Botão “Chamar no WhatsApp” de um pré-cadastro.',
    group: 'loja',
    vars: ['primeiro_nome', 'loja'],
  },
  compra: {
    label: 'Compra registrada',
    description: 'Abre sozinha na conversa da cliente quando você registra uma venda ou marca um pedido como pago: as peças, o total e a garantia.',
    group: 'loja',
    vars: ['primeiro_nome', 'pedido', 'itens', 'total', 'garantia', 'garantia_ate', 'garantia_regras', 'loja'],
    required: ['itens'],
    itemsStyle: 'bullets',
  },
  convite_revendedora: {
    label: 'Convite de revendedora',
    description: 'Quando você efetiva uma revendedora: o link do primeiro acesso (contrato e PIN) e o do mostruário dela.',
    group: 'loja',
    vars: ['primeiro_nome', 'link_convite', 'link_mostruario', 'loja'],
    required: ['link_convite'],
  },
  venda_revendedora: {
    label: 'Venda da revendedora',
    description: 'A revendedora registra uma venda no painel dela e envia o resumo para a cliente: peças, total e garantia.',
    group: 'revenda',
    vars: ['primeiro_nome', 'revendedora', 'itens', 'total', 'garantia', 'garantia_ate', 'garantia_regras', 'loja'],
    required: ['itens'],
    itemsStyle: 'bullets',
  },
  mostruario: {
    label: 'Pedido pelo mostruário',
    description: 'A cliente toca em “Quero esta” no mostruário digital de uma revendedora.',
    group: 'revenda',
    vars: ['revendedora', 'peca', 'link_peca', 'loja'],
    sample: { peca: 'Brinco Gota Cristal (Dourado)' },
  },
};

export interface PresetTemplate {
  id: string;
  type: MessageType;
  name: string;
  text: string;
}

/** Built-in variations. The first of each type is the default ("Clássica": today's wording). */
export const PRESET_TEMPLATES: readonly PresetTemplate[] = [
  // Pedido pela sacola
  { id: 'pedido.classica', type: 'pedido', name: 'Clássica', text: 'Olá! Fiz o pedido[ nº {pedido}] pelo site:\n\n{itens}\n\nTotal: {total}\nNome: {nome}[ · Cidade: {cidade}]\n[Obs.: {obs}]' },
  { id: 'pedido.carinhosa', type: 'pedido', name: 'Carinhosa', text: 'Oi, ÉKA! 💛 Acabei de escolher minhas peças[ (pedido nº {pedido})]:\n\n{itens}\n\n*Total: {total}*\n\nSou {nome}[, de {cidade}].\n[Obs.: {obs}]\nPode confirmar pra mim?' },
  { id: 'pedido.direta', type: 'pedido', name: 'Direta', text: 'Pedido[ nº {pedido}] — {nome}[ ({cidade})]\n{itens}\nTotal: {total}\n[Obs.: {obs}]' },
  { id: 'pedido.detalhada', type: 'pedido', name: 'Com pedido de frete', text: 'Olá! Fiz o pedido[ nº {pedido}] pelo site:\n\n{itens}\n\n*Total das peças: {total}*\n\nMeu nome é {nome}[ e moro em {cidade}].\n[Obs.: {obs}]\n\nPode me passar o valor do frete e o prazo de entrega?' },

  // Dúvida sobre uma peça
  { id: 'duvida.classica', type: 'duvida', name: 'Clássica', text: 'Olá! Tenho uma dúvida sobre a peça {peca}.' },
  { id: 'duvida.com_link', type: 'duvida', name: 'Com o link da peça', text: 'Oi! Vi esta peça no site e fiquei com uma dúvida:\n*{peca}*\n{link_peca}' },
  { id: 'duvida.carinhosa', type: 'duvida', name: 'Carinhosa', text: 'Oi, ÉKA! 💛 Me apaixonei pela peça {peca}. Pode me ajudar com uma dúvida?' },

  // Avise-me
  { id: 'aviseme.classica', type: 'aviseme', name: 'Clássica', text: 'Olá! A peça {peca} está esgotada no site. Pode me avisar quando voltar?' },
  { id: 'aviseme.com_link', type: 'aviseme', name: 'Com o link da peça', text: 'Oi! Quero muito esta peça, que está esgotada no site:\n*{peca}*\n{link_peca}\nMe avisa quando voltar? 🙏' },
  { id: 'aviseme.encomenda', type: 'aviseme', name: 'Pergunta de encomenda', text: 'Olá! Vi que a peça {peca} esgotou. Dá para encomendar ou tem previsão de reposição?' },

  // Contato
  { id: 'contato.classica', type: 'contato', name: 'Clássica', text: 'Olá! Vim pelo site da ÉKA e gostaria de ajuda para escolher uma peça.' },
  { id: 'contato.curta', type: 'contato', name: 'Curta', text: 'Oi! Vim pelo site da {loja}. 💛' },
  { id: 'contato.presente', type: 'contato', name: 'Presente', text: 'Olá! Vim pelo site e estou procurando uma peça para dar de presente. Pode me ajudar a escolher?' },

  // Comprovante enviado
  { id: 'comprovante.classica', type: 'comprovante', name: 'Clássica', text: 'Olá! Enviei o comprovante do pedido nº {pedido} pelo link.' },
  { id: 'comprovante.carinhosa', type: 'comprovante', name: 'Carinhosa', text: 'Oi, ÉKA! 💛 Paguei e enviei o comprovante do pedido nº {pedido} pelo link. Obrigada!' },
  { id: 'comprovante.curta', type: 'comprovante', name: 'Curta', text: 'Comprovante do pedido nº {pedido} enviado pelo link. ✅' },

  // Revendedora
  {
    id: 'revendedora.classica',
    type: 'revendedora',
    name: 'Clássica',
    text: 'Olá! Quero ser revendedora ÉKA.\n\nNome: {nome}\nWhatsApp: {whatsapp}\nCidade: {cidade}/{uf}\nInstagram: @{instagram}\nJá revendo: {ja_revende}\nConheci a ÉKA por: {origem}',
  },
  { id: 'revendedora.carinhosa', type: 'revendedora', name: 'Carinhosa', text: 'Oi, ÉKA! 💛 Acabei de fazer meu pré-cadastro e quero muito revender as peças de vocês.\n\nSou {nome}, de {cidade}/{uf}.\n[Meu Instagram: @{instagram}]\nJá revendo: {ja_revende}' },
  { id: 'revendedora.direta', type: 'revendedora', name: 'Direta', text: 'Pré-cadastro de revendedora: {nome} — {cidade}/{uf} — {whatsapp}[ — @{instagram}]' },

  // Cobrança Pix
  {
    id: 'cobranca.classica',
    type: 'cobranca',
    name: 'Clássica',
    text: 'Oi[, {primeiro_nome}]! Seu pedido nº {pedido} está confirmado.\n\n{itens}\nFrete: {frete}\nDesconto: −{desconto}\n*Total: {total}*\n\nPara pagar com Pix e enviar o comprovante, é só abrir:\n{link}\n\nSe preferir, use o Pix Copia e Cola:\n{pix}',
  },
  {
    id: 'cobranca.carinhosa',
    type: 'cobranca',
    name: 'Carinhosa',
    text: 'Oi[, {primeiro_nome}]! 💛 Que alegria: suas peças estão separadas e o pedido nº {pedido} está confirmado.\n\n{itens}\n[Frete: {frete}]\n[Desconto: −{desconto}]\n*Total: {total}*\n\n✨ Para pagar com Pix e enviar o comprovante:\n{link}\n\nQualquer dúvida, estou aqui!',
  },
  { id: 'cobranca.direta', type: 'cobranca', name: 'Direta', text: 'Pedido nº {pedido} confirmado. Total: *{total}*.\nPague com Pix e envie o comprovante: {link}' },
  {
    id: 'cobranca.so_pix',
    type: 'cobranca',
    name: 'Link + Pix primeiro',
    text: 'Oi[, {primeiro_nome}]! Pedido nº {pedido} confirmado. Total: *{total}*.\n\nPix Copia e Cola:\n{pix}\n\nDepois de pagar, envie o comprovante por aqui:\n{link}',
  },

  // Lembrete
  { id: 'lembrete.classica', type: 'lembrete', name: 'Clássica', text: 'Oi[, {primeiro_nome}]! Passando para lembrar do pedido nº {pedido} ({total}). Suas peças continuam separadas.\n[Para pagar e enviar o comprovante: {link}]' },
  { id: 'lembrete.carinhosa', type: 'lembrete', name: 'Carinhosa', text: 'Oi[, {primeiro_nome}]! 💛 Tudo bem? Suas peças do pedido nº {pedido} estão aqui guardadinhas te esperando.\n[Quando puder, é só pagar e enviar o comprovante por aqui: {link}]' },
  { id: 'lembrete.prazo', type: 'lembrete', name: 'Com prazo', text: 'Oi[, {primeiro_nome}]! Seguro as peças do pedido nº {pedido} até amanhã. Depois disso elas voltam para o site.\n[Pagamento: {link}]' },

  // Pagamento confirmado
  { id: 'pago.classica', type: 'pago', name: 'Clássica', text: 'Oi[, {primeiro_nome}]! Recebemos o pagamento do pedido nº {pedido} ({total}). Obrigada! Avisamos assim que ele for enviado.' },
  { id: 'pago.carinhosa', type: 'pago', name: 'Carinhosa', text: 'Oi[, {primeiro_nome}]! 💛 Pagamento recebido! Muito obrigada pela confiança. Já estou preparando o pedido nº {pedido} com todo carinho. ✨' },
  { id: 'pago.curta', type: 'pago', name: 'Curta', text: 'Pagamento do pedido nº {pedido} confirmado. ✅ Obrigada!' },

  // Pedido a caminho
  { id: 'enviado.classica', type: 'enviado', name: 'Clássica', text: 'Oi[, {primeiro_nome}]! Seu pedido nº {pedido} já está a caminho.\n[Código de rastreio: {rastreio}]' },
  { id: 'enviado.carinhosa', type: 'enviado', name: 'Carinhosa', text: 'Oi[, {primeiro_nome}]! 💛 Suas peças saíram daqui embaladas com muito carinho. O pedido nº {pedido} já está a caminho!\n[Rastreio: {rastreio}]' },
  { id: 'enviado.retirada', type: 'enviado', name: 'Pronto para retirar', text: 'Oi[, {primeiro_nome}]! O pedido nº {pedido} está pronto para retirada. Me fala o melhor dia e horário para você. 😊' },

  // Pós-venda
  { id: 'posvenda.classica', type: 'posvenda', name: 'Clássica', text: 'Oi[, {primeiro_nome}]! Suas peças chegaram bem? Conta pra gente o que achou. 💛' },
  { id: 'posvenda.foto', type: 'posvenda', name: 'Pedido de foto', text: 'Oi[, {primeiro_nome}]! Espero que esteja amando suas peças. 💛 Se puder, manda uma foto usando? Vou adorar ver!' },
  { id: 'posvenda.cuidados', type: 'posvenda', name: 'Dica de cuidados', text: 'Oi[, {primeiro_nome}]! Uma dica para suas peças durarem mais: coloque depois do perfume e do creme, tire para tomar banho e guarde separadas, longe da umidade. ✨ Qualquer dúvida, estou aqui!' },

  // Boas-vindas à revendedora
  { id: 'boasvindas.classica', type: 'boasvindas', name: 'Clássica', text: 'Olá[, {primeiro_nome}]! Aqui é da ÉKA Semijoias. Recebemos seu cadastro para revender nossas peças e queremos conversar com você.' },
  { id: 'boasvindas.carinhosa', type: 'boasvindas', name: 'Carinhosa', text: 'Oi[, {primeiro_nome}]! 💛 Que bom ter você com a gente! Vi seu cadastro para revender as peças da {loja}. Posso te contar como funciona?' },
  { id: 'boasvindas.direta', type: 'boasvindas', name: 'Direta', text: 'Olá[, {primeiro_nome}]! Recebemos seu pré-cadastro de revendedora. Quando podemos conversar?' },

  // Compra registrada (loja → cliente)
  {
    id: 'compra.classica',
    type: 'compra',
    name: 'Clássica',
    text: 'Oi[, {primeiro_nome}]! Sua compra[ (pedido nº {pedido})] está registrada:\n\n{itens}\n*Total: {total}*\n\n[Garantia: {garantia}, até {garantia_ate}.]\n[{garantia_regras}]\n\nObrigada por escolher a {loja}! 💛',
  },
  {
    id: 'compra.carinhosa',
    type: 'compra',
    name: 'Carinhosa',
    text: 'Oi[, {primeiro_nome}]! 💛 Que alegria ter você com a gente. Suas peças:\n\n{itens}\n*Total: {total}*\n\n✨ [Elas têm garantia de {garantia} (até {garantia_ate}).] Guarde esta mensagem: ela é o seu comprovante.\n[{garantia_regras}]',
  },
  {
    id: 'compra.cuidados',
    type: 'compra',
    name: 'Com cuidados',
    text: 'Oi[, {primeiro_nome}]! Compra registrada[ (pedido nº {pedido})]:\n{itens}\nTotal: {total}\n\n[Garantia até {garantia_ate}.] Para durar mais: coloque depois do perfume e do creme, tire para tomar banho e guarde separada, longe da umidade.',
  },

  // Convite de revendedora (loja → revendedora)
  {
    id: 'convite_revendedora.classica',
    type: 'convite_revendedora',
    name: 'Clássica',
    text: 'Oi[, {primeiro_nome}]! Seu cadastro de revendedora {loja} foi aprovado. 🎉\n\n1. Leia e aceite o contrato e crie seu PIN de acesso:\n{link_convite}\n\n[2. Seu mostruário digital, para enviar às suas clientes: {link_mostruario}]\n\nO link de acesso vale por 7 dias.',
  },
  {
    id: 'convite_revendedora.carinhosa',
    type: 'convite_revendedora',
    name: 'Carinhosa',
    text: 'Oi[, {primeiro_nome}]! 💛 Agora é oficial: você é revendedora {loja}!\n\nPara começar, é só abrir este link, aceitar o contrato e criar seu PIN:\n{link_convite}\n\n[Seu mostruário digital (pode compartilhar à vontade): {link_mostruario}]',
  },
  {
    id: 'convite_revendedora.direta',
    type: 'convite_revendedora',
    name: 'Direta',
    text: 'Primeiro acesso (contrato + PIN): {link_convite}\n[Mostruário: {link_mostruario}]',
  },

  // Venda da revendedora (revendedora → cliente)
  {
    id: 'venda_revendedora.classica',
    type: 'venda_revendedora',
    name: 'Clássica',
    text: 'Oi[, {primeiro_nome}]! Sua compra de semijoias {loja} está registrada:\n\n{itens}\n*Total: {total}*\n\n[Garantia: {garantia}, até {garantia_ate}.]\n[{garantia_regras}]\n\nObrigada! [{revendedora}]',
  },
  {
    id: 'venda_revendedora.carinhosa',
    type: 'venda_revendedora',
    name: 'Carinhosa',
    text: 'Oi[, {primeiro_nome}]! 💛 Obrigada pela compra! Suas peças {loja}:\n\n{itens}\n*Total: {total}*\n\n✨ [Garantia até {garantia_ate}.] Guarde esta mensagem: ela é o seu comprovante.',
  },
  {
    id: 'venda_revendedora.curta',
    type: 'venda_revendedora',
    name: 'Curta',
    text: 'Compra registrada:\n{itens}\nTotal: {total}\n[Garantia até {garantia_ate}.]',
  },

  // Pedido pelo mostruário (cliente → revendedora)
  { id: 'mostruario.classica', type: 'mostruario', name: 'Clássica', text: 'Oi[, {revendedora}]! Vi no seu mostruário e quero esta peça: {peca}.' },
  { id: 'mostruario.com_link', type: 'mostruario', name: 'Com o link da peça', text: 'Oi[, {revendedora}]! Gostei desta peça do seu mostruário {loja}:\n*{peca}*\n[{link_peca}]\nAinda tem?' },
  { id: 'mostruario.carinhosa', type: 'mostruario', name: 'Carinhosa', text: 'Oi[, {revendedora}]! 💛 Me apaixonei pela peça {peca} do seu mostruário. Como faço para comprar?' },
];

export const MAX_TEMPLATE_CHARS = 1500;
export const MAX_CUSTOM_TEMPLATES = 30;

export const messageSettingsSchema = z.object({
  /** type → template id (preset or custom) used by default. */
  active: z.partialRecord(z.enum(MESSAGE_TYPES), z.string().max(64)).default({}),
  /** preset id → the owner's version of its text (only built-in ids; never blank). */
  edited: z
    .record(
      z.string().refine((id) => PRESET_TEMPLATES.some((p) => p.id === id), 'Variação desconhecida'),
      z.string().max(MAX_TEMPLATE_CHARS).refine((t) => t.trim().length > 0, 'Texto vazio'),
    )
    .default({}),
  custom: z
    .array(
      z.object({
        id: z.string().regex(/^custom\.[A-Za-z0-9_-]{4,40}$/),
        type: z.enum(MESSAGE_TYPES),
        name: z.string().max(40).refine((t) => t.trim().length > 0, 'Dê um nome à variação'),
        text: z.string().max(MAX_TEMPLATE_CHARS).refine((t) => t.trim().length > 0, 'Texto vazio'),
      }),
    )
    .max(MAX_CUSTOM_TEMPLATES)
    .default([]),
}).superRefine((value, ctx) => {
  // The server enforces what the editor warns about: a message that would lose its purpose.
  const typeOfPreset = (id: string) => PRESET_TEMPLATES.find((p) => p.id === id)?.type;
  for (const [id, text] of Object.entries(value.edited)) {
    const type = typeOfPreset(id);
    if (type && missingRequired(text, type).length) ctx.addIssue({ code: 'custom', path: ['edited', id], message: 'Mensagem sem informação obrigatória' });
  }
  value.custom.forEach((c, i) => {
    if (missingRequired(c.text, c.type).length) ctx.addIssue({ code: 'custom', path: ['custom', i, 'text'], message: 'Mensagem sem informação obrigatória' });
  });
});
export type MessageSettings = z.infer<typeof messageSettingsSchema>;

export interface TemplateOption {
  id: string;
  type: MessageType;
  name: string;
  text: string;
  /** Built-in variation (its text may have been edited). */
  preset: boolean;
  /** A preset whose text the owner changed. */
  edited: boolean;
  /** The built-in text (presets only), for "Restaurar". */
  original?: string;
}

/** Every variation of a type: built-in ones first (with the owner's edits), then hers. */
export function templatesFor(settings: Partial<MessageSettings> | undefined, type: MessageType): TemplateOption[] {
  const edited = settings?.edited ?? {};
  const presets = PRESET_TEMPLATES.filter((p) => p.type === type).map((p) => ({
    id: p.id,
    type,
    name: p.name,
    text: edited[p.id] ?? p.text,
    preset: true,
    edited: edited[p.id] !== undefined && edited[p.id] !== p.text,
    original: p.text,
  }));
  const custom = (settings?.custom ?? []).filter((c) => c.type === type).map((c) => ({ ...c, preset: false, edited: false }));
  return [...presets, ...custom];
}

/** The variation used by default for a type (falls back to the first built-in one). */
export function activeTemplate(settings: Partial<MessageSettings> | undefined, type: MessageType): TemplateOption {
  const all = templatesFor(settings, type);
  return all.find((t) => t.id === settings?.active?.[type]) ?? all[0]!;
}

const VAR_PATTERN = /\{([a-z_]+)\}/g;
const empty = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/** Renders a template with the given values (see the rules at the top of this file). */
export function renderTemplate(text: string, vars: MessageVars): string {
  const known = (name: string): name is VariableName => Object.hasOwn(VARIABLES, name);
  const valueOf = (name: string) => (known(name) ? vars[name] : undefined);
  // 1. Optional parts: [ … ] disappears when any variable inside is empty.
  const withGroups = text.replace(/\[([^[\]\n]*)\]/g, (whole, inner: string) => {
    const names = [...inner.matchAll(VAR_PATTERN)].map((m) => m[1]!).filter(known);
    if (!names.length) return whole; // plain brackets in the text stay
    return names.some((n) => empty(valueOf(n))) ? '' : inner;
  });
  // 2. Lines: drop a line whose variables all came out empty, or that only held removed optional parts.
  const original = text.split('\n');
  const lines = withGroups.split('\n');
  const out: string[] = [];
  lines.forEach((line, i) => {
    const names = [...line.matchAll(VAR_PATTERN)].map((m) => m[1]!).filter(known);
    if (names.length && names.every((n) => empty(valueOf(n)))) return;
    if (!line.trim() && original[i]?.trim()) return;
    out.push(line);
  });
  // 3. Tidy the template's own text (doubled spaces, a space before punctuation left by an empty
  //    value, extra blank lines) with the values parked in tokens, so they come out untouched
  //    (a Pix code or a note must stay byte for byte).
  const values: string[] = [];
  const parked = out
    .join('\n')
    .replace(VAR_PATTERN, (whole, name: string) => {
      if (!known(name)) return whole;
      if (empty(vars[name])) return '';
      values.push(String(vars[name]).trim());
      return `\uE000${values.length - 1}\uE001`;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?:;)])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return parked.replace(/\uE000(\d+)\uE001/g, (_, i: string) => values[Number(i)]!);
}

/** Variables written in a template that this type does not know. */
export function unknownVariables(text: string, type: MessageType): string[] {
  const allowed = new Set<string>(MESSAGE_TYPE_INFO[type].vars);
  return [...new Set([...text.matchAll(VAR_PATTERN)].map((m) => m[1]!))].filter((n) => !allowed.has(n));
}

/** Required variables missing from a template. */
export function missingRequired(text: string, type: MessageType): VariableName[] {
  // A required variable inside an optional [ … ] part could disappear: it must be outside.
  const solid = text.replace(/\[([^[\]\n]*)\]/g, '');
  return (MESSAGE_TYPE_INFO[type].required ?? []).filter((n) => !solid.includes(`{${n}}`));
}

/** Sample values for the preview of a type. */
export function sampleVars(type: MessageType): MessageVars {
  const base = Object.fromEntries(Object.entries(VARIABLES).map(([k, v]) => [k, v.example])) as MessageVars;
  return { ...base, ...MESSAGE_TYPE_INFO[type].sample };
}

/** Messages above this length use the compact item list (wa.me links get unreliable when very long). */
export const COMPACT_THRESHOLD = 1800;

export interface MessageItem {
  name: string;
  finish: string;
  sizeLabel?: string | undefined;
  qty: number;
  lineTotal: string;
}

export function formatItems(items: MessageItem[], compact = false, style: 'numbered' | 'bullets' = 'numbered'): string {
  const mark = (i: number) => (style === 'bullets' ? '•' : `${i + 1})`);
  return items
    .map((l, i) =>
      compact
        ? [`${mark(i)} ${l.name}`, l.finish.slice(0, 4), l.sizeLabel?.replace(/^(aro|tam\.) /, ''), `${l.qty}x`, l.lineTotal].filter(Boolean).join(' · ')
        : [`${mark(i)} ${l.name}`, l.finish, l.sizeLabel, `${l.qty} un.`, l.lineTotal].filter(Boolean).join(' — '),
    )
    .join('\n');
}

/**
 * Renders the active (or given) template of a type. With `items`, the list goes in {itens}, in the
 * compact format when the full message would be too long for a WhatsApp link.
 */
export function composeMessage(
  settings: Partial<MessageSettings> | undefined,
  type: MessageType,
  vars: MessageVars,
  opts: { items?: MessageItem[]; templateId?: string; compactIfLong?: boolean } = {},
): string {
  const template = (opts.templateId && templatesFor(settings, type).find((t) => t.id === opts.templateId)) || activeTemplate(settings, type);
  if (!opts.items) return renderTemplate(template.text, vars);
  const style = MESSAGE_TYPE_INFO[type].itemsStyle ?? 'numbered';
  const full = renderTemplate(template.text, { ...vars, itens: formatItems(opts.items, false, style) });
  // The compact list only matters for wa.me links (copied messages have no length limit).
  if (full.length <= COMPACT_THRESHOLD || opts.compactIfLong === false) return full;
  return renderTemplate(template.text, { ...vars, itens: formatItems(opts.items, true, style), obs: vars.obs ? String(vars.obs).slice(0, 300) : vars.obs });
}

/** Read-side tolerance: stored message settings that do not validate (an older or newer version) fall back to the defaults. */
export function readMessageSettings(value: unknown): MessageSettings | undefined {
  if (value === undefined) return undefined;
  const parsed = messageSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** "Ana" from "Ana Souza" (empty when unknown). */
export const firstNameOf = (name: string | undefined | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';
