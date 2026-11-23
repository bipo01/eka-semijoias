import { describe, expect, it } from 'vitest';
import {
  activeTemplate,
  readMessageSettings,
  composeMessage,
  formatItems,
  MESSAGE_TYPE_INFO,
  MESSAGE_TYPES,
  messageSettingsSchema,
  missingRequired,
  PRESET_TEMPLATES,
  renderTemplate,
  templatesFor,
  unknownVariables,
} from './messages';

const items = [
  { name: 'Brinco Gota Cristal', finish: 'Rosé', qty: 1, lineTotal: 'R$ 129,90' },
  { name: 'Anel Solitário Delicado', finish: 'Dourado', sizeLabel: 'aro 16', qty: 2, lineTotal: 'R$ 279,80' },
];

describe('renderTemplate', () => {
  it('replaces variables and drops optional parts and lines that came out empty', () => {
    const t = 'Oi[, {primeiro_nome}]! Pedido nº {pedido}.\nFrete: {frete}\n[Obs.: {obs}]\nFim.';
    expect(renderTemplate(t, { primeiro_nome: 'Ana', pedido: '1024', frete: 'R$ 20,00', obs: 'presente' })).toBe('Oi, Ana! Pedido nº 1024.\nFrete: R$ 20,00\nObs.: presente\nFim.');
    expect(renderTemplate(t, { pedido: '1024' })).toBe('Oi! Pedido nº 1024.\nFim.');
  });

  it('keeps unknown variables and plain brackets as typed, and tidies blank lines and spaces', () => {
    expect(renderTemplate('Olá {apelido} [sem variável]', {})).toBe('Olá {apelido} [sem variável]');
    expect(renderTemplate('A\n\n\n\nB {obs}\n\n', { obs: '' })).toBe('A');
    expect(renderTemplate('Olá {nome} , moro em {cidade}', { nome: '', cidade: 'Rio' })).toBe('Olá, moro em Rio');
  });
});

describe('built-in variations', () => {
  it('has at least three variations for every type, all valid', () => {
    for (const type of MESSAGE_TYPES) {
      const list = PRESET_TEMPLATES.filter((p) => p.type === type);
      expect(list.length, type).toBeGreaterThanOrEqual(3);
      expect(list[0]!.name).toBe('Clássica');
      for (const p of list) {
        expect(unknownVariables(p.text, type), p.id).toEqual([]);
        expect(missingRequired(p.text, type), p.id).toEqual([]);
      }
    }
    expect(new Set(PRESET_TEMPLATES.map((p) => p.id)).size).toBe(PRESET_TEMPLATES.length);
  });

  it('"Clássica" keeps the wording the site used before templates', () => {
    expect(composeMessage(undefined, 'pedido', { pedido: '1008', total: 'R$ 409,70', nome: 'Ana', cidade: 'Campo Grande/MS', obs: 'é para presente' }, { items })).toBe(
      'Olá! Fiz o pedido nº 1008 pelo site:\n\n1) Brinco Gota Cristal — Rosé — 1 un. — R$ 129,90\n2) Anel Solitário Delicado — Dourado — aro 16 — 2 un. — R$ 279,80\n\nTotal: R$ 409,70\nNome: Ana · Cidade: Campo Grande/MS\nObs.: é para presente',
    );
    expect(composeMessage(undefined, 'pedido', { total: 'R$ 409,70', nome: 'Ana' }, { items })).toContain('Olá! Fiz o pedido pelo site:');
    expect(composeMessage(undefined, 'duvida', { peca: 'Brinco Gota Cristal' })).toBe('Olá! Tenho uma dúvida sobre a peça Brinco Gota Cristal.');
    expect(composeMessage(undefined, 'contato', {})).toBe('Olá! Vim pelo site da ÉKA e gostaria de ajuda para escolher uma peça.');
    expect(composeMessage(undefined, 'aviseme', { peca: 'Pulseira Elos Rosé' })).toBe('Olá! A peça Pulseira Elos Rosé está esgotada no site. Pode me avisar quando voltar?');
    expect(composeMessage(undefined, 'revendedora', { nome: 'Ana Souza', whatsapp: '(67) 99999-1234', cidade: 'Campo Grande', uf: 'MS', ja_revende: 'Não' })).toBe(
      'Olá! Quero ser revendedora ÉKA.\n\nNome: Ana Souza\nWhatsApp: (67) 99999-1234\nCidade: Campo Grande/MS\nJá revendo: Não',
    );
    expect(composeMessage(undefined, 'cobranca', { primeiro_nome: 'Ana', pedido: '1024', total: 'R$ 299,90', frete: 'R$ 10,00', link: 'L', pix: 'P' }, { items: items.slice(0, 1) })).toBe(
      'Oi, Ana! Seu pedido nº 1024 está confirmado.\n\n• Brinco Gota Cristal — Rosé — 1 un. — R$ 129,90\nFrete: R$ 10,00\n*Total: R$ 299,90*\n\nPara pagar com Pix e enviar o comprovante, é só abrir:\nL\n\nSe preferir, use o Pix Copia e Cola:\nP',
    );
  });

  it('switches {itens} to the compact list when the message gets too long', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `Peça com um nome bem comprido número ${i + 1}`, finish: 'Ródio negro', sizeLabel: 'aro 18', qty: 2, lineTotal: 'R$ 1.299,80' }));
    const msg = composeMessage(undefined, 'pedido', { pedido: '1', total: 'R$ 9.999,00', nome: 'Ana' }, { items: many });
    expect(msg).toContain('1) Peça com um nome bem comprido número 1 · Ródi · 18 · 2x · R$ 1.299,80');
    expect(formatItems(many).length).toBeGreaterThan(msg.length - 100);
  });
});

describe('owner settings', () => {
  it('applies edits, custom variations and the active choice, ignoring unknown ids', () => {
    const settings = messageSettingsSchema.parse({
      active: { pedido: 'custom.minha1', contato: 'nao-existe' },
      edited: { 'duvida.classica': 'Oi! Dúvida: {peca}' },
      custom: [{ id: 'custom.minha1', type: 'pedido', name: 'Minha', text: 'Pedido {pedido}: {itens}' }],
    });
    expect(activeTemplate(settings, 'pedido').name).toBe('Minha');
    expect(activeTemplate(settings, 'contato').id).toBe('contato.classica');
    const duvida = templatesFor(settings, 'duvida')[0]!;
    expect(duvida).toMatchObject({ edited: true, text: 'Oi! Dúvida: {peca}' });
    expect(composeMessage(settings, 'duvida', { peca: 'Anel' })).toBe('Oi! Dúvida: Anel');
    expect(templatesFor(settings, 'pedido').map((t) => t.preset)).toEqual([true, true, true, true, false]);
  });

  it('refuses saved texts that lost a required variable', () => {
    expect(messageSettingsSchema.safeParse({ edited: { 'cobranca.classica': 'Pague: {pix}' } }).success).toBe(false);
    expect(messageSettingsSchema.safeParse({ custom: [{ id: 'custom.abcd1', type: 'cobranca', name: 'X', text: 'Sem link' }] }).success).toBe(false);
    expect(messageSettingsSchema.safeParse({ edited: { 'cobranca.classica': 'Pague: {link}' } }).success).toBe(true);
  });

  it('knows the required variables', () => {
    expect(missingRequired('Pague aqui', 'cobranca')).toEqual(['link']);
    expect(MESSAGE_TYPE_INFO.cobranca.group).toBe('loja');
    expect(unknownVariables('Oi {primeiro_nome} {cpf}', 'pago')).toEqual(['cpf']);
  });
});

describe('review regressions', () => {
  it('never alters the values themselves (a Pix code or a note stays byte for byte)', () => {
    const pix = '00020126580014br.gov.bcb.pix5913E . K . A  X6008CUIABA63041234';
    expect(renderTemplate('Pix:  {pix}', { pix })).toBe(`Pix: ${pix}`);
    expect(renderTemplate('Obs.: {obs}', { obs: 'obrigada :)  até' })).toBe('Obs.: obrigada :)  até');
  });

  it('does not count a required variable that sits inside an optional part', () => {
    expect(missingRequired('Pague[ {primeiro_nome} {link}]', 'cobranca')).toEqual(['link']);
    expect(missingRequired('Pague: {link}[ {primeiro_nome}]', 'cobranca')).toEqual([]);
  });

  it('refuses blank texts, unknown built-in ids and blank names on write; reads tolerate anything', () => {
    expect(messageSettingsSchema.safeParse({ edited: { 'contato.classica': '  ' } }).success).toBe(false);
    expect(messageSettingsSchema.safeParse({ edited: { 'nao.existe': 'Oi' } }).success).toBe(false);
    expect(messageSettingsSchema.safeParse({ custom: [{ id: 'custom.abcd1', type: 'contato', name: '  ', text: 'Oi' }] }).success).toBe(false);
    expect(readMessageSettings({ active: { futuro: 'x' } })).toBeUndefined();
    expect(readMessageSettings(undefined)).toBeUndefined();
    expect(readMessageSettings({ active: { contato: 'contato.curta' } })?.active.contato).toBe('contato.curta');
  });

  it('keeps the full item list for copied messages', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `Peça com um nome bem comprido número ${i + 1}`, finish: 'Ródio negro', qty: 2, lineTotal: 'R$ 1.299,80' }));
    const msg = composeMessage(undefined, 'cobranca', { pedido: '1', total: 'R$ 1,00', link: 'L' }, { items: many, compactIfLong: false });
    expect(msg).toContain('• Peça com um nome bem comprido número 30 — Ródio negro — 2 un. — R$ 1.299,80');
  });
});
