# Prompt de implementação — pedidos, estoque, Pix e ajustes do menu

> Para o Claude (Opus 5.5), 23/11/2026. Implemente `docs/vendas/PLAN.md` inteiro no repositório `eka-semijoias`, valide e publique.

## Objetivo
Fazer a ÉKA registrar cada pedido, controlar o estoque por acabamento e tamanho, mostrar o Pix com os dados dela e dar à Érika um relatório de vendas no painel. Também tirar Coleções do site e os preços do menu lateral. Tudo funcionando em produção (`npm run deploy`).

## Regras
- Siga `AGENTS.md` à risca: voz da marca, tokens, `Sheet`, pt-BR na interface, inglês no código, erros sempre visíveis, servidor como autoridade e dados pessoais só no painel.
- Migração nova `worker/migrations/0002_orders_stock.sql`, só aditiva.
- Padrões existentes, não novos: `guard()` + `batch` para atomicidade, `withReadRetry` para leituras, `HttpError` para erros, `requireSession` no painel, `hit()` para limites, a tabela `idempotency` para repetições, `notify*` para o tempo real, `api()` no cliente e `save()` no painel.
- Código compartilhado entre o Worker e o navegador mora em `src/data/` ou `src/lib/`, sem DOM.
- Sem `dangerouslySetInnerHTML`, `alert`, `confirm` ou `prompt`. Dependência nova só `uqr` (QR Code).

## Entregas e critérios de aceite
1. **Menu e coleções:**
   - o menu lateral mostra categorias sem preço e não tem a seção Coleções;
   - o cabeçalho não tem "Coleções";
   - a página inicial não tem o banner da coleção;
   - `/colecao/rose` leva a `/catalogo`;
   - o painel não tem a aba nem a escolha de coleções;
   - os backups antigos continuam importando.
2. **Estoque:**
   - peça sem controle se comporta como hoje;
   - peça controlada com 0 em todas as combinações aparece como "Esgotado" no catálogo, no cartão e na página;
   - tamanho a 0 fica bloqueado;
   - a quantidade escolhida nunca passa do estoque;
   - "Últimas unidades" aparece no limite configurado;
   - o painel edita o estoque com proteção contra sobrescrita e mostra o histórico.
3. **Pedidos:**
   - "Finalizar pedido" registra e mostra o número; a mensagem do WhatsApp leva o número;
   - preço e estoque são conferidos no servidor;
   - clique duplo não duplica;
   - falha de rede mostra a verdade e o caminho alternativo;
   - o painel muda o status com baixa e devolução atômicas e nunca deixa estoque negativo, inclusive com duas confirmações ao mesmo tempo;
   - apagar os dados da cliente e excluir o pedido funcionam com as regras do plano.
4. **Pix:**
   - com chave configurada, a cliente vê QR, copia e cola, valor e recebedor depois de registrar;
   - o código passa no teste do CRC do Banco Central;
   - sem chave, nada de Pix aparece.
5. **Relatório:** períodos, indicadores, barras, rankings, cidades, em negociação, pedidos parados e CSV, contando só confirmado, pago e entregue.

## Validação obrigatória
`npm run typecheck`, `npm run lint`, `npm test -- --run`, `npm run test:worker`, `npm run test:integration`, `npm run build` e `npm run e2e` (Chromium e WebKit). Também uma passada visual no navegador (360 px e desktop) da sacola, da página da peça, do menu e das telas novas do painel. Depois, uma revisão adversarial independente do diff, a correção dos achados confirmados e a revalidação.

## Publicação
Commit em `main` com mensagem em inglês. `npm run deploy` aplica a migração 0002 (só tabelas novas) e publica o Worker. Em produção, confira:
- `/api/health`;
- o snapshot com `stock`;
- o menu sem coleções;
- a sacola em funcionamento.

Um pedido de teste em produção só se for excluído em seguida. Atualize `AGENTS.md` e `docs/pendencias.md`.
