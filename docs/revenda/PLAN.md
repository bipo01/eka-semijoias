# Plano — fase 4: clientes, revendedoras, painel da revendedora e estoque

23/11/2026, a partir de `docs/revenda/PLANNING_PROMPT.md`.

## 0. Decisões de negócio padrão (editáveis pela Érika)
As regras do programa de revenda ainda não foram respondidas (`docs/PERGUNTAS_ERIKA.md` §11–13). O sistema nasce com estes padrões. Todos ficam em Painel → Revendedoras → Programa e podem mudar a qualquer momento.

- **Modelo:** consignado. A Érika monta a maleta, a revendedora vende e, no acerto, devolve o que sobrou e repassa o valor vendido menos a comissão.
- **Comissão por faixas, sobre o total vendido na maleta (ciclo):**
  - até R$ 999,99: 25%;
  - de R$ 1.000 a R$ 1.999,99: 30%;
  - a partir de R$ 2.000: 35%.

  A faixa alcançada vale para todo o ciclo, e a tela mostra quanto falta para a próxima. Uma faixa única vira comissão fixa.
- **Prazo do acerto:** 30 dias a partir da entrega da maleta.
- **Preço de venda:** o do catálogo quando a peça entra na maleta (preço promocional, se houver). A revendedora pode dar desconto numa venda; a comissão incide sobre o valor vendido de fato.
- **Peça que não voltou nem foi vendida:** no acerto, conta como devida pelo preço cheio, sem comissão.
- **Lucro acumulado:** soma das comissões dos ciclos já acertados, mais a comissão prevista do ciclo atual, mostradas separadas.

## 1. Clientes e mensagem da compra
**Dados:**
- Tabela `customers`: `id`, `whatsapp` (só dígitos, único quando existe), `name_key` (nome normalizado, para a busca) e um documento com nome, WhatsApp, cidade, UF, Instagram, aniversário, observações e criado/atualizado em.
- `orders.customer_id` liga o pedido à cliente.

**Painel:**
- Nova aba **Clientes**: lista com busca, ficha da cliente (dados, compras com total gasto, última compra), criar, editar e apagar (LGPD; os pedidos ficam, sem o vínculo).
- **"Novo pedido":** escolher uma cliente cadastrada ou cadastrar na hora (nome + WhatsApp). Os dados do pedido vêm da ficha.
- **Pedido do site:** "Vincular cliente" no detalhe, buscando por nome ou WhatsApp, ou criando a ficha a partir do nome e da cidade do pedido.

**Mensagem da compra (o "envio automático"):**
- Novo modelo **"Compra registrada"** (loja → cliente): peças, total, nº do pedido, prazo da garantia com a data final (`{garantia}`, `{garantia_ate}`) e as regras da garantia (`{garantia_regras}`, campo novo nas Configurações, também mostrado na página `/garantia`).
- **O envio:** ao registrar uma venda confirmada (pedido manual) ou ao marcar um pedido como pago, quando há cliente com WhatsApp, o painel abre na hora a mensagem pronta na conversa daquela cliente (`wa.me/<número>`). É só tocar em enviar.
- **Por que não 100% automático:** a API oficial do WhatsApp exige verificação da Meta, modelos aprovados e cobrança por mensagem. Fica registrada como evolução opcional, com o custo por conta da loja.

## 2. Fichas e efetivação de revendedoras
- **Fichas (`leads`):** coluna nova `status` (`nova | analise | aprovada | recusada | efetivada`), mais observação interna no documento.
  - Na lista: filtros por status, "Em análise", "Aprovar", "Recusar" e "Conversar no WhatsApp" (mensagem pronta).
- **"Efetivar revendedora"** (ficha aprovada, ou do zero):
  1. Cria a revendedora com nome, WhatsApp, cidade/UF e Instagram vindos da ficha, e um slug do mostruário gerado do primeiro nome (único, editável).
  2. Gera o **convite de primeiro acesso** (`/revenda/convite/<token>`, válido por 7 dias, só o hash fica no banco) e o **link do mostruário** (`/r/<slug>`).
  3. Abre a mensagem **"Convite de revendedora"** (loja → revendedora) com os dois links, pronta para enviar no WhatsApp.
- **Contrato**, duas formas configuráveis no Programa:
  - **Aceite no próprio sistema (padrão):**
    - a Érika escreve o texto do contrato (versão automática a cada mudança);
    - no primeiro acesso, a revendedora lê, digita o nome completo e marca "Li e aceito";
    - fica registrado: data e hora, versão, hash SHA-256 do texto, nome digitado, rede (hash do IP) e navegador. A ficha da revendedora mostra "Contrato aceito em…".
  - **Link externo** (Autentique, ZapSign, Clicksign): a Érika cola o link geral, ou um por revendedora. O primeiro acesso mostra "Assinar o contrato" e a revendedora confirma "Já assinei". A Érika marca "Contrato conferido" depois de ver a assinatura.
- **Status da revendedora:**
  - `ativa`;
  - `pausada`: não entra no painel, e o mostruário mostra "Em breve";
  - `encerrada`: idem; exige acerto feito.

## 3. Acesso e painel da revendedora
**Acesso:**
- **Login** em `/revenda`: WhatsApp + PIN de 6 dígitos, criado pela própria revendedora no convite.
- **Bloqueio de tentativas:** 5 erradas por rede a cada 15 minutos e 10 por revendedora por hora.
- **Esqueceu o PIN:** a Érika gera um convite novo, que permite criar outro PIN.
- **Sessão:** cookie `__Host-eka_revenda` (HttpOnly, Secure, SameSite=Strict), 30 dias. Pausar ou encerrar a revendedora encerra as sessões dela.
- **Autorização:** toda rota `/api/revenda/*` resolve a revendedora pela sessão e só lê ou grava linhas dela.

**Painel:** chunk lazy, mobile first, instalável como "ÉKA Revenda" (manifesto próprio, escopo `/revenda`). Tem:
1. **Resumo:**
   - total vendido no ciclo;
   - comissão atual (% e R$) com barra de progresso até a próxima faixa;
   - lucro acumulado (recebido + previsto);
   - dias até o acerto;
   - valor da maleta.
2. **Maleta:**
   - cada peça com foto, acabamento, tamanho, preço, quantidade recebida, vendida e disponível;
   - valor total da maleta (enviado e disponível).
3. **Vendas:**
   - "Registrar venda": escolher peças da maleta, quantidade, preço (padrão o da maleta; desconto opcional), cliente (nome e WhatsApp opcionais) e forma de pagamento;
   - a venda abre a mensagem **"Venda da revendedora"** (revendedora → cliente), com peças, total e garantia;
   - lista das vendas do ciclo, com "Desfazer venda" nas primeiras 24 h enquanto a maleta está aberta.
4. **Mostruário:** link para copiar e compartilhar.
5. **Histórico:** ciclos anteriores, com vendido, comissão e acerto.

## 4. Maleta, vendas e acerto (painel da Érika)
- **Maleta (ciclo):** tabela `kits` (`aberta | fechada`), no máximo uma aberta por revendedora (índice único parcial).
  - Itens no documento: peça, acabamento, tamanho, quantidade, preço unitário e nome.
  - **Montar ou ajustar a maleta** usa o mesmo editor de peças dos pedidos. Peças com controle de estoque saem do estoque no mesmo batch (motivo `maleta`). Tirar uma peça não vendida devolve ao estoque (motivo `retorno_maleta`). Não dá para tirar menos do que já foi vendido.
- **Vendas da revendedora:** tabela `reseller_sales` (`ativa | cancelada`).
  - A venda confere o disponível na maleta com compare-and-swap no `updated_at` da maleta, para duas vendas da última peça não passarem as duas.
  - A venda **não** mexe no estoque central: a peça já saiu quando foi para a maleta.
  - O painel da Érika recebe aviso ao vivo, e um aviso no celular: "Nova venda · Ana (revendedora) · R$ 159,90".
- **Acerto (fechar o ciclo):**
  - A Érika informa, por peça, quantas voltaram (padrão: todas as disponíveis).
  - O sistema calcula vendido, faixa e comissão, peças faltando (preço cheio) e **valor a repassar** = vendido − comissão + faltantes.
  - Ao confirmar: as peças devolvidas voltam ao estoque (`retorno_maleta`), a maleta fecha com o resumo do acerto gravado, e "Repasse recebido" pode ser marcado depois.
  - Opção "Abrir nova maleta" logo em seguida.
- **Visão geral:**
  - lista de revendedoras com status, maleta (valor, vendido, comissão prevista), dias até o acerto (alerta quando vence) e último acesso;
  - totais do mês: vendido pelas revendedoras e comissões.

## 5. Mostruário digital
- **Página pública** `/r/<slug>`: "Mostruário de Ana · ÉKA Semijoias", com as peças **disponíveis** na maleta aberta (foto, nome, acabamento, preço) e o botão "Pedir para a Ana", que abre o WhatsApp da revendedora com a mensagem **"Pedido pelo mostruário"**.
- **API pública** `GET /api/r/:slug`: só o primeiro nome, o WhatsApp (se ela permitir; padrão sim) e as peças, com `Cache-Control` de 60 s. Revendedora pausada, encerrada ou sem maleta mostra "Mostruário em preparação" com o WhatsApp da loja.

## 6. Estoque (item 4)
- **Movimentos:** a migração `0006` recria `stock_movements` com os motivos `ajuste | pedido | devolucao | entrada | saida | maleta | retorno_maleta` e as colunas `note` e `kit_id`, copiando o histórico.
- **Registrar entrada / Registrar saída** na aba Estoque: peça, acabamento, tamanho, quantidade e motivo.
  - Entrada: compra do fornecedor, troca, outro.
  - Saída: perda ou defeito, brinde, uso próprio, outro.
  - Observação opcional.
  - A rota `POST /api/admin/stock/moves` aplica deltas com guarda (`qty >= n` na saída) e o guard de versão do catálogo. Ligar o controle de estoque de uma peça com entrada inicial também funciona.
- **Visão geral no topo:**
  - unidades em casa, nas maletas e total;
  - valor do estoque a preço de venda;
  - peças esgotadas e com poucas unidades.

  Filtros: todas, com estoque, esgotadas, poucas unidades, nas maletas.
- **Por peça:** em casa e nas maletas (por revendedora).
- **Histórico:** rótulo de cada motivo e a revendedora quando for de maleta.

## 7. Rotas
| Rota | Quem | O quê |
|---|---|---|
| `GET/POST /api/admin/customers`, `GET/PUT/DELETE /api/admin/customers/:id`, `POST /api/admin/orders/:id/customer` | Érika | Clientes e vínculo com o pedido |
| `PATCH /api/admin/leads/:id` | Érika | Status e observação da ficha |
| `GET/POST /api/admin/resellers`, `GET/PATCH /api/admin/resellers/:id`, `POST /api/admin/resellers/:id/invite`, `POST /api/admin/resellers/:id/contract-check` | Érika | Revendedoras |
| `GET/PUT /api/admin/reseller-program` | Érika | Comissão, prazo, contrato |
| `POST /api/admin/resellers/:id/kits`, `PUT /api/admin/kits/:id/items`, `POST /api/admin/kits/:id/settle`, `POST /api/admin/kits/:id/paid`, `GET /api/admin/resellers/:id/sales` | Érika | Maleta, acerto, vendas |
| `POST /api/admin/stock/moves`, `GET /api/admin/stock` (+ `inKits`) | Érika | Estoque |
| `GET /api/revenda/invite/:token`, `POST /api/revenda/invite/:token` | Convite | Contrato + criar PIN |
| `POST /api/revenda/login`, `POST /api/revenda/logout`, `GET /api/revenda/me` | Revendedora | Sessão e painel |
| `POST /api/revenda/sales`, `POST /api/revenda/sales/:id/cancel` | Revendedora | Vendas |
| `GET /api/r/:slug` | Público | Mostruário |

## 8. Mensagens novas (`src/data/messages.ts`)
- `compra` (loja): Compra registrada, com garantia.
- `convite_revendedora` (loja): convite com os links de primeiro acesso e do mostruário.
- `venda_revendedora` (revendedora): resumo para a cliente dela, com garantia.
- `mostruario` (cliente → revendedora): pedido pelo mostruário.

Variáveis novas: `garantia`, `garantia_ate`, `garantia_regras`, `link_convite`, `link_mostruario`, `revendedora`. Cada tipo tem 3 variações embutidas, editáveis em Painel → Mensagens.

## 9. Divisão do trabalho
**Pré-requisito (eu, um commit), base dos agentes:**
- as migrações `0006`, `0007` e `0008`;
- os esquemas e as regras puras (`src/data/revenda.ts` com comissão e acerto, e `src/data/customers.ts`);
- os motivos de estoque;
- as mensagens novas e `settings.warrantyTerms`;
- o `planStock` generalizado (motivo, nota e maleta);
- a aba Clientes com uma página provisória.

**Agentes, em paralelo:**
- **Agente C (worktree): clientes e mensagem da compra.** Dono de `worker/customers.ts`, `src/admin/sections/Customers*`, `src/admin/lib/customers.ts`, do seletor de cliente em `OrderForms.tsx`/`OrdersPage.tsx`, de `OrderMessages.tsx` (abrir a "Compra registrada") e do campo de regras de garantia em `SettingsPage.tsx` e na página `/garantia`.
- **Agente D (worktree): estoque.** Dono de `worker/stock.ts` (rota de entradas e saídas, `inKits`), `src/admin/sections/StockPage.tsx` e `src/admin/lib/stock.ts`.
- **Eu: revendedoras.** `worker/resellers.ts`, `worker/kits.ts`, `worker/resellerAuth.ts`, `worker/showcase.ts`, `src/admin/sections/Resellers*` (substitui `LeadsPage`), `src/revenda/*` (painel), `src/pages/Showcase.tsx`, rotas, manifesto "ÉKA Revenda", integração, revisão, testes no Chrome.

## 10. Testes
- **Unitários:**
  - comissão por faixa e progresso;
  - acerto (vendido, faltante, repasse);
  - slug único;
  - disponível na maleta;
  - modelos de mensagem novos.
- **Integração:**
  - cliente: criar, vincular, apagar;
  - ficha → efetivar → convite → contrato → PIN → login;
  - revendedora A não lê nem grava nada da B;
  - maleta tira do estoque e a corrida pela última unidade (maleta × pedido);
  - venda concorrente da última peça da maleta;
  - acerto devolve ao estoque e fecha;
  - pausar encerra sessões;
  - mostruário público sem dados pessoais;
  - entradas e saídas com guarda.
- **E2E:** painel da revendedora no celular (Chromium e WebKit), mostruário e acessibilidade.
- **Chrome (Claude in Chrome):** fluxo completo local, da ficha ao acerto, nos dois papéis.
