# Prompt de planejamento — fase 4: clientes, revendedoras, painel da revendedora e estoque

> 23/11/2026, para o Claude (Opus 5.5). Saída: `docs/revenda/PLAN.md` e `docs/revenda/IMPLEMENTATION_PROMPT.md`.

## Papel
Designer de produto sênior e engenheiro sênior de Cloudflare Workers, D1 e React. Cada decisão parte do código atual (`AGENTS.md`, `docs/vendas/*.md`) e é provada com teste, inclusive no Chrome real (Claude in Chrome).

## Pedido da Érika (texto dela, resumido)
1. **Cadastro de clientes e envio automático:** cadastrar clientes no painel. Ao registrar a venda, o sistema manda para a cliente a mensagem com as informações da compra e da garantia.
2. **Revendedoras:**
   - receber e ver as fichas de cadastro;
   - analisar e aprovar;
   - efetivar a pessoa, entregando o link do contrato para assinar e o link do mostruário digital dela.
3. **Painel individual da revendedora**, mais simples que o da Érika. Gerado automaticamente quando a Érika cadastra a revendedora e as peças da maleta. Mostra:
   - as peças da maleta;
   - o valor total da maleta;
   - as vendas feitas, que a própria revendedora lança;
   - a porcentagem de comissão conquistada ao longo das vendas;
   - o lucro acumulado.
4. **Controle de estoque:** ver as peças disponíveis, registrar entradas e saídas e acompanhar as quantidades.
5. **Integração:** o painel da Érika e os painéis das revendedoras conversam entre si (clientes, vendas, estoque e comissões).

## O que já existe (não refazer)
- **Pedidos:** do site e manuais, com status, estoque que sai na confirmação, edição de peças, cobrança Pix, comprovantes, relatório, mensagens de WhatsApp editáveis (12 tipos), avisos no celular e prazo de garantia nas Configurações.
- **Fichas de revendedora:** formulário público (`/revendedoras`, tabela `leads`) e a lista no painel, com exclusão e CSV. Não há status nem efetivação.
- **Estoque:** por peça, acabamento e tamanho, editado com valores absolutos e conferência de conflito, com histórico (`stock_movements`, motivos `ajuste | pedido | devolucao`). Não há entrada/saída com motivo nem visão de "disponível × em maletas".

## Restrições
- **Plano Free da Cloudflare:** 10 ms de CPU por requisição; D1 só com `batch` (compare-and-swap com `guard()`); poucas idas ao banco.
- **Migrações só aditivas** (`0006_*` em diante). Mudar um `CHECK` exige recriar a tabela numa migração nova, nunca editar uma já aplicada.
- **Dados pessoais:**
  - clientes, fichas e revendedoras só em rotas autenticadas;
  - nada pessoal no snapshot público, em logs ou nos avisos;
  - o mostruário público mostra só o primeiro nome e o WhatsApp da revendedora, com o consentimento dela.
- **Revendedora vê só o que é dela:** autorização por revendedora em toda rota; nunca dados de outra revendedora nem do painel da Érika.
- **Envio "automático" pelo WhatsApp:** a API oficial (Meta) exige verificação da empresa, modelos aprovados e cobra por mensagem. A solução sem custo é a mensagem pronta aberta na conversa da cliente com um toque.
- **Regras do negócio ainda em aberto** (`docs/PERGUNTAS_ERIKA.md` §11–13): comissão, prazo, peça perdida, contrato. O sistema nasce com padrões sensatos e tudo editável pela Érika, sem bloquear a entrega.
- Voz da marca, pt-BR, cobre `#8A5A45`, `Sheet` nativo e erros sempre visíveis.

## Perguntas que o plano responde
1. **Modelo de dados:** cliente, ficha (status), revendedora, acesso, contrato, maleta (ciclo), venda da revendedora, acerto. Que tabelas e campos, e o que é documento JSON e o que é coluna.
2. **Clientes:** como se ligam aos pedidos (manual e do site) e como a mensagem "compra registrada + garantia" sai na hora da venda.
3. **Contrato:**
   - aceite eletrônico próprio (texto versionado, nome digitado, data, rede) ou link externo (Autentique/ZapSign);
   - o que fica registrado como prova.
4. **Acesso da revendedora:**
   - login (WhatsApp + PIN), primeiro acesso por convite, sessões e bloqueio de tentativas;
   - o que acontece quando ela é pausada ou encerrada.
5. **Maleta e estoque:**
   - montar a maleta tira as peças do estoque (motivo `maleta`); o acerto devolve as que voltaram;
   - a venda da revendedora baixa da maleta, não do estoque;
   - concorrência entre a maleta, os pedidos e os ajustes.
6. **Comissão e lucro:**
   - faixas por valor vendido no ciclo da maleta (padrão editável);
   - como mostrar o progresso;
   - o que é lucro acumulado;
   - como o acerto calcula quanto a revendedora repassa.
7. **Mostruário digital:** página pública `/r/<slug>` com as peças da maleta dela e o WhatsApp dela.
8. **Estoque (item 4):**
   - entradas e saídas com motivo;
   - a visão disponível × em maletas × total;
   - o histórico com os motivos novos.
9. **Painel da Érika:** onde cada coisa fica (abas, telas) e como ela acompanha as revendedoras (vendas, comissão a pagar, acertos, alertas).
10. **Divisão do trabalho:** o que dá para fazer em paralelo sem dois agentes mexerem nos mesmos arquivos, e qual o pré-requisito comum.
11. **Testes:** unitários (regras de comissão e acerto), integração (rotas, autorização entre revendedoras, estoque sob concorrência), E2E e testes no Chrome.
