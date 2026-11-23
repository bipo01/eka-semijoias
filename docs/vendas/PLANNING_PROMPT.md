# Prompt de planejamento — pedidos, estoque, Pix e ajustes do menu

> Escrito em 23/11/2026 para o Claude (Opus 5.5) planejar a próxima etapa do site da ÉKA Semijoias. O resultado esperado é `docs/vendas/PLAN.md`, seguido de `docs/vendas/IMPLEMENTATION_PROMPT.md`.

## Papel

Você é ao mesmo tempo designer sênior de produto (mobile first, e-commerce de moda) e engenheiro sênior de Cloudflare Workers + React. Planeje como quem vai implementar e responder por isso em produção: cada decisão sai do código atual, não de suposição.

## Contexto (leia antes de planejar)

- `AGENTS.md`: arquitetura, regras de voz, design tokens, operações do backend.
- `docs/pendencias.md`: itens 1 (Pix), 2 (estoque) e 3 (relatório de vendas), com o que a Érika pediu.
- `docs/backend/PLAN.md`: decisões do backend (snapshot materializado, change sets, `guard()` de compare-and-swap em batch D1, idempotência, LiveHub).
- O código: `worker/*.ts`, `worker/migrations/0001_init.sql`, `src/data/*`, `src/store/catalog.ts`, `src/lib/whatsapp.ts`, `src/components/bag/BagContents.tsx`, `src/pages/Product.tsx`, `src/components/layout/MenuDrawer.tsx`, `src/admin/*`.

## O que a Érika pediu

1. **Pix com os dados certos**: depois de montar o pedido, a cliente vê o valor exato, o QR Code Pix e o "copia e cola", com a chave, o nome e a cidade da ÉKA, editáveis no painel.
2. **Controle de estoque** por acabamento e tamanho. "Esgotado" sozinho quando acaba, "Últimas unidades" quando restam poucas, nunca escolher mais do que há. A baixa acontece quando ela confirma o pedido no painel; cancelar devolve. Sem estoque negativo, com histórico de entradas e saídas.
3. **Relatório de vendas**: o site passa a registrar cada pedido (número, itens, valores, nome, cidade); no painel, cada pedido tem status (enviado → confirmado → pago → entregue, ou cancelado). O relatório mostra vendas por período, ticket médio, o que mais vende (peça, categoria, acabamento), vendas por cidade, pedidos parados e exportação em CSV. Os dados de clientes podem ser apagados a pedido (LGPD).
4. **Sem Coleções**: retirar a seção Coleções (Rosé e Presentear) do menu lateral e do site, incluindo o banner "Coleção Rosé" da página inicial.
5. **Menu lateral sem preços**: as categorias de peças continuam no menu, mas sem o "a partir de R$ …".

## Restrições que não podem ser quebradas

- Plano Free da Cloudflare: 10 ms de CPU por requisição, D1 com transações só via `batch`, um único Worker.
- O servidor é a autoridade: preços, disponibilidade e estoque são recalculados no servidor; o navegador nunca dita valores.
- Nenhuma venda pode ser perdida: se o registro do pedido falhar, a cliente ainda consegue enviar pelo WhatsApp, e a tela diz a verdade sobre o que aconteceu.
- Dados pessoais (nome, cidade, observação dos pedidos) só nos endpoints do painel; nunca no snapshot público, em logs ou no WebSocket.
- Voz da marca, tokens de cor, `Sheet` nativo, mensagens em pt-BR, código em inglês. Cobre `#8A5A45` para ações; nada de verde WhatsApp.
- Migrações só acrescentam (tabelas novas); nada de editar `0001_init.sql`.
- Fatos não confirmados (chave Pix, nome do recebedor) nunca aparecem no site enquanto não forem preenchidos no painel.

## Perguntas que o plano precisa responder com evidência do código

1. Onde o estoque vive para que o site público saiba o que está esgotado sem uma requisição a mais, sem gerar conflitos falsos quando a Érika edita uma peça enquanto confirma um pedido, e com uma única fonte da verdade?
2. Como confirmar um pedido de forma atômica (status + baixa de vários itens + histórico + snapshot público) dentro de um `batch` D1, e o que acontece quando duas confirmações disputam a última unidade?
3. Como o fluxo da sacola muda para registrar o pedido antes do WhatsApp sem cair no bloqueio de pop-up do Safari no iPhone e sem pedidos duplicados por clique duplo ou nova tentativa?
4. Quais transições de status existem, quais movem estoque, e como desfazer um engano?
5. Como gerar o BR Code Pix estático corretamente (EMV, CRC16) e provar isso com teste?
6. Como os relatórios são calculados (servidor ou navegador), com que limites, em qual fuso horário?
7. Como retirar coleções do site sem quebrar backups, links antigos (`/colecao/rose`), seed, integridade ou o painel?
8. Como o spam no endpoint público de pedidos é contido?
9. Que testes provam cada parte (unitários, Worker, integração com D1 real, E2E com Safari) e como validar em produção depois do deploy?

## Entregáveis

1. `docs/vendas/PLAN.md`: decisões com justificativa, modelo de dados (SQL), contratos de API, fluxos de tela, casos de erro, plano de testes, riscos, ordem de implementação e o que fica de fora.
2. `docs/vendas/IMPLEMENTATION_PROMPT.md`: o brief de implementação, com critérios de aceite verificáveis.
