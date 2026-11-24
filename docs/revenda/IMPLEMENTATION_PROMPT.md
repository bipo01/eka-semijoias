# Prompt de implementação — fase 4

> Para o Claude e os agentes da fase 4, 23/11/2026. Implementar `docs/revenda/PLAN.md` inteiro.

## Regras
- `AGENTS.md` vale integralmente: voz, tokens, `Sheet`, pt-BR, erros visíveis e o servidor como autoridade.
- **Um dono por arquivo** (PLAN §9). O que estiver fora do seu escopo vira nota no relatório.
- **O pré-requisito é contrato:**
  - as migrações `0006–0008`, `src/data/revenda.ts`, `src/data/customers.ts`, os motivos de estoque e as mensagens novas não mudam sem combinar;
  - se precisar, peça a mudança em vez de editar.
- **Toda escrita passa no servidor:**
  - validação zod;
  - `batch` com compare-and-swap;
  - idempotência onde um toque duplo cria registro (cliente, venda, maleta);
  - erros pt-BR específicos.
- **Dados pessoais:** só em rotas autenticadas, nunca em logs, no snapshot ou nos avisos.
- **Revendedora:** toda consulta filtra pelo `reseller_id` da sessão, nunca por um id que vem do navegador.

## Critérios de aceite
1. **Clientes:**
   - cadastrar, buscar, editar e apagar;
   - pedido manual com cliente escolhida ou criada na hora;
   - pedido do site vinculado depois;
   - na venda confirmada ou paga, a mensagem "Compra registrada" (com garantia e data final) abre na conversa da cliente.
2. **Fichas:**
   - status e observação;
   - aprovar, recusar e efetivar;
   - a efetivação gera o convite (7 dias) e o mostruário, e a mensagem pronta com os dois links.
3. **Contrato:**
   - aceite no sistema com registro (versão, hash, nome, data, rede);
   - link externo como alternativa;
   - a ficha mostra o estado.
4. **Painel da revendedora:**
   - login com WhatsApp + PIN, bloqueio de tentativas;
   - resumo (vendido, comissão e progresso, lucro acumulado, dias para o acerto, valor da maleta);
   - maleta, registrar venda (com mensagem para a cliente) e desfazer em 24 h;
   - histórico;
   - instalável como "ÉKA Revenda".
5. **Maleta:**
   - montar e ajustar move o estoque no mesmo batch;
   - não vende além do disponível, nem com duas vendas ao mesmo tempo;
   - o acerto calcula comissão, faltantes e repasse, devolve as peças e fecha;
   - "Repasse recebido".
6. **Mostruário** `/r/<slug>`:
   - peças disponíveis e o botão para o WhatsApp da revendedora;
   - nada pessoal além do primeiro nome e do WhatsApp autorizado.
7. **Estoque:**
   - entradas e saídas com motivo e guarda;
   - visão em casa × nas maletas × total, e valor do estoque;
   - filtros;
   - histórico com os motivos novos.
8. **Isolamento:** a revendedora A não acessa nada da B, nem do painel da Érika (testado).

## Validação
- `typecheck`, `lint`, unitários, `test:worker`, `test:integration` e `e2e` nos quatro navegadores.
- No Chrome (Claude in Chrome), o fluxo completo local:
  - ficha → efetivar → convite → contrato → PIN → painel;
  - Érika monta a maleta → revendedora vende → mostruário → acerto → estoque.
- Revisão adversarial independente, correção do que for confirmado e nova rodada de testes.

## Publicação
- Commits no `main`.
- O deploy aplica três migrações em produção (uma recria `stock_movements` copiando o histórico). Por isso **pede confirmação antes**.
