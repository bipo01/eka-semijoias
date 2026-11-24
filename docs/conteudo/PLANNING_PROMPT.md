# Prompt de planejamento — fase 5: a Érika edita o site inteiro pelo painel

> 24/11/2026, para o Claude (Opus 5.5). Saída: `docs/conteudo/PLAN.md` e `docs/conteudo/IMPLEMENTATION_PROMPT.md`.

## Papel
Designer de produto sênior e engenheiro sênior de Cloudflare Workers, D1 e React. Cada decisão parte do código atual (`AGENTS.md`) e é provada com teste automatizado e no Chrome real (Claude in Chrome), antes e depois de publicar.

## Pedido (do dono do projeto)
1. **Política de privacidade (LGPD).** O site coleta nome, WhatsApp, cidade, comprovantes de pagamento e dados de revendedoras, e não tem página que explique isso.
2. **Depoimentos pelo painel:** adicionar, editar e apagar. Os 4 depoimentos de hoje são texto de exemplo apresentado como real e saem do site.
3. **Autonomia total da Érika:** tudo o que a visitante lê no site deve ser ajustável no painel, sem depender de programador. "Completo, sem erros."

## Ponto de partida (inventário de 24/11/2026)
- **Já editável:**
  - produtos e categorias;
  - 16 modelos de mensagem;
  - Configurações: barra de aviso, WhatsApp, Instagram, cidade, showroom, horário, garantia (meses e regras), Pix, limite de "últimas unidades";
  - programa de revenda e contrato (só no painel).
- **Fixo no código:**
  - início: chamada principal, imagem, títulos das seções, faixa da revenda, dicas de cuidado, depoimentos, perguntas frequentes, fotos da faixa do Instagram;
  - Sobre (história e valores), Como cuidar, listas da Garantia, a página Revendedoras inteira, Contato;
  - rodapé e menu, textos da sacola, 404;
  - título e descrição para Google e WhatsApp (meta tags, que hoje são fixas no `index.html`);
  - fatos do negócio que o painel não altera: antialérgicas, envio nacional, parcelamento, banho, consignado, sem investimento inicial.
  - Três textos de WhatsApp escritos direto no código, fora dos modelos: acionar garantia, "procurando algo específico?" e os da página de pagamento.
- **Armadilhas conhecidas:**
  - Salvar "Informações da loja" reconstrói `settings` a partir de uma lista fixa de chaves, e o zod remove chaves desconhecidas. Um campo novo dentro de `settings` seria apagado por um painel antigo aberto.
  - Imagens fora de produtos não passam por envio nem por conferência de existência.
  - Toda escrita de estoque reescreve o snapshot com `snapshotBody()`, e uma chave nova no snapshot precisa passar por ele.

## Restrições
- **Plano Free da Cloudflare:** 10 ms de CPU por requisição e poucas idas ao D1. O snapshot público (`/api/catalog`) é baixado por toda visitante, tem teto de 1,9 MB e é dividido com até 500 peças.
- **Sem migração de banco, se der.** Migração em produção pede autorização do dono a cada vez. A tabela `app_config` já existe.
- **Conferência de conflito** como no resto do catálogo: dois aparelhos não podem apagar o trabalho um do outro em silêncio.
- **Painel antigo aberto não pode apagar conteúdo novo.**
- **Voz da marca:** pt-BR, "a gente", nada de "exemplo/demonstração/pendente" no site público (`e2e/public.spec.ts`), nunca a Érika em terceira pessoa.
- **Sem promessas sem confirmação:** um fato do negócio desconhecido esconde a frase, e o texto padrão nunca afirma o que não foi confirmado.
- **Interface:** cobre `#8A5A45` para ações, `Sheet` nativo, erros sempre visíveis, nada salvo sem confirmação do servidor.
- **Política de privacidade:** fiel ao que o sistema faz de verdade (dados, finalidades, onde ficam, quanto tempo, direitos do titular, como pedir exclusão). O texto é editável, mas nasce correto.

## Perguntas que o plano responde
1. **Onde guardar o conteúdo:** dentro de `settings` ou numa entidade nova? Como fica a conferência de conflito por seção e a proteção contra painel antigo?
2. **Estrutura:** quais seções existem e quais campos e limites cada uma tem (texto curto, texto longo, lista, imagem, liga/desliga).
3. **Texto padrão:** como o site mostra o texto original até a Érika editar. O padrão depende dos fatos (garantia, envio), e precisa haver "restaurar o original".
4. **Imagens:** envio, tamanho para banner, conferência e backup.
5. **Painel:** onde cada coisa fica, como é o editor (listas com adicionar, editar, apagar e reordenar; "ver no site"; aviso de alteração não salva), e como ela sabe o que já editou.
6. **Depoimentos:** campos, autorização da cliente, ocultar sem apagar, a seção some sem depoimentos.
7. **Privacidade:** conteúdo jurídico da política, onde aparece o link (rodapé, formulários, sacola, pagamento, convite) e a data de atualização.
8. **Google e WhatsApp:** título, descrição e imagem de compartilhamento editáveis; prévia certa ao compartilhar uma peça (foto, nome, preço) sem rodar o app.
9. **Fatos do negócio:** passam a ser editados no painel, e a lista de pendências das Configurações passa a ser marcada sozinha.
10. **Mensagens fixas no código:** viram modelos editáveis.
11. **Backup e restauração:** incluem o conteúdo.
12. **Divisão do trabalho:** base comum primeiro, depois frentes paralelas sem arquivos em comum.
13. **Testes:**
    - unitários: esquemas, padrões, diff e aplicação;
    - worker: conflito por seção, imagens, painel antigo;
    - E2E: editar, ver ao vivo, restaurar e privacidade;
    - Chrome no ambiente local e em produção, com limpeza.
