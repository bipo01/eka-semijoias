# Plano — pedidos, estoque, Pix e ajustes do menu

Planejado em 23/11/2026 a partir de `docs/vendas/PLANNING_PROMPT.md`. Implementação: `docs/vendas/IMPLEMENTATION_PROMPT.md`.

## 1. Decisões

### 1.1 Estoque: tabela no D1 como verdade, mapa no snapshot público
- **Fonte da verdade:** `stock_levels (product_id, variant_id, size, qty)`. Uma peça tem estoque controlado quando tem ao menos uma linha. Uma combinação que falta numa peça controlada vale **0**: nunca se vende o que não foi contado.
- **Leitura pública:** o snapshot de `GET /api/catalog` ganha `stock: { [productId]: { "<variantId>|<size>": qty } }`, só para peças controladas, com o número **limitado a 20** (o máximo da sacola). O site sabe o que está esgotado sem requisição extra, funciona offline com o cache e atualiza ao vivo pelo canal que já existe. O número exato fica só no painel.
- **Por que não guardar o estoque dentro do produto:** cada baixa mudaria a versão da peça, e a Érika levaria um conflito falso ao salvar uma peça aberta enquanto confirma um pedido. Com a tabela separada, os conflitos por entidade (`worker/conflicts.ts`) continuam valendo só para edições de catálogo.
- **Uma versão para tudo:** toda escrita de estoque reescreve o snapshot e incrementa a versão do catálogo no mesmo `batch` protegido por `guard(versão)`. Assim, a guarda de versão também protege o estoque: duas escritas concorrentes nunca se perdem, a segunda relê e tenta de novo.
- `handleChanges` lê as linhas de estoque, rematerializa o mapa e apaga as linhas órfãs (peça excluída, acabamento ou tamanho removido) no mesmo `batch`.
- `CHECK (qty >= 0)` no SQL é a última barreira: um `UPDATE` que deixaria o estoque negativo aborta o `batch` inteiro.

### 1.2 Pedidos
- **Registro antes do WhatsApp, em dois passos.** "Finalizar pedido" faz `POST /api/orders` e mostra "Pedido nº 1024 registrado", o Pix e o botão **"Enviar pedido pelo WhatsApp"**, que é um link de verdade. Abrir o WhatsApp depois de um `await` cairia no bloqueio de pop-up do Safari; um link tocado pela cliente nunca é bloqueado.
- **O servidor é a autoridade:** refaz preço, disponibilidade, tamanho e estoque a partir do snapshot. Se algo esgotou, responde 409 com os itens, e a sacola se atualiza.
- **Sem pedido duplicado:** a sacola gera uma `Idempotency-Key` por conteúdo (itens + cliente). Um clique duplo ou uma nova tentativa devolve o mesmo pedido.
- **Nenhuma venda perdida:** se o registro falhar (rede ou servidor), a tela diz isso e oferece "Tentar de novo" e "Enviar pelo WhatsApp mesmo assim" (mensagem sem número).
- **Número sequencial** a partir de 1001, gerado no próprio `INSERT ... SELECT MAX(number)+1` (D1 escreve em série; a coluna é `UNIQUE`).
- **Nome e cidade passam a ser obrigatórios** para finalizar. O relatório por cidade depende disso, e a Érika precisa saber de quem é o pedido.
- **Contra spam:** campo isca (honeypot), limite de 15 pedidos por hora por rede e 300 por hora no total, corpo de no máximo 16 KB e no máximo 50 itens. A Érika pode excluir um pedido falso.
- **"Pedir agora"** na página da peça passa a pôr a peça na sacola e abrir a sacola, para que todo pedido seja registrado.

### 1.3 Status e estoque
```
enviado ──► confirmado ──► pago ──► entregue
   │  ▲          │  ▲        │  ▲
   │  └─desfazer─┘  └desfazer┘  └desfazer
   └──► cancelado ◄── (de confirmado ou pago)
cancelado ──► enviado (reabrir)
```
- Seguram estoque: `confirmado`, `pago`, `entregue`. Passar de um status que não segura para um que segura dá baixa; o caminho inverso devolve.
- O pedido guarda em `stockMoves` exatamente o que foi baixado e devolve isso, mesmo que o controle da peça tenha sido ligado ou desligado no meio.
- `POST /api/admin/orders/:id/status { from, to }` faz compare-and-swap no status. Se o status já é `to`, responde ok (repetir é seguro). Se é outro, responde 409.
- Estoque insuficiente na confirmação dá 409 com a peça, o pedido e o saldo. Duas confirmações pela última unidade: uma passa, a outra recebe o 409.

### 1.4 Pix estático
- `src/lib/pix.ts` gera o BR Code (EMV MPM) com os campos 00, 26 (GUI `br.gov.bcb.pix` + chave), 52 `0000`, 53 `986`, 54 valor, 58 `BR`, 59 nome (até 25, sem acento), 60 cidade (até 15, sem acento), 62/05 txid (`EKA<nº>`) e 63 CRC16-CCITT (polinômio 0x1021, início 0xFFFF). O teste confere o exemplo do manual do Banco Central.
- A chave, o nome e a cidade ficam em `settings.pix` (Configurações do painel). Sem chave, o bloco Pix não aparece e a mensagem diz "Pagamento: a combinar".
- Tipos de chave validados: CPF, CNPJ, celular (vira `+55…`), e-mail, chave aleatória.
- O QR Code é desenhado como SVG em React a partir da matriz do `uqr` (MIT, sem dependências; nada de `dangerouslySetInnerHTML`). O "copia e cola" tem o botão "Copiar código" e o aviso "Código copiado".
- A confirmação do pagamento é manual: a cliente envia o comprovante pelo WhatsApp e a Érika marca o pedido como "pago". O Pix dinâmico fica para depois.

### 1.5 Relatório
- **Calculado no navegador** (`src/data/report.ts`, puro e testado), sobre os pedidos dos últimos 400 dias (no máximo 5000) entregues por `GET /api/admin/orders`. O agrupamento usa o fuso do aparelho da Érika. No volume atual, isso cabe com folga no plano Free e evita consultas por período.
- **Conta como venda:** `confirmado`, `pago` e `entregue`. `enviado` aparece à parte como "Em negociação"; `cancelado` não conta.
- **Mostra:** vendas e pedidos no período, ticket médio, peças vendidas, gráfico de barras por dia ou mês, peças, categorias e acabamentos mais vendidos, cidades, e pedidos parados (`enviado` há mais de 48 h).
- **CSV** do período, uma linha por item.

### 1.6 LGPD
- **"Apagar dados da cliente"** troca o nome por "Cliente removida" e apaga a observação, mantendo os valores para o relatório. A cidade é apagada também.
- **"Excluir pedido"** só vale para pedidos que não seguram estoque (`enviado` ou `cancelado`).
- Pedidos ficam fora do snapshot, dos logs e do WebSocket. Para o painel, a mensagem ao vivo é só `{"type":"orders"}`.
- Na sacola: "Usamos seu nome e cidade só para acompanhar o seu pedido."

### 1.7 Coleções e menu
- **Fora do site:** a seção Coleções do menu lateral, o item "Coleções" do cabeçalho, o banner "Coleção Rosé" da página inicial e a página `/colecao/:slug`, que agora leva a `/catalogo`, então os links antigos continuam funcionando.
- **Fora do painel:** a aba Coleções e a escolha de coleções no formulário da peça.
- **O que fica:** o esquema, os dados e os backups. Nada é apagado do banco; voltar atrás é só código.
- O menu lateral mostra as categorias sem "a partir de R$".

## 2. Modelo de dados (`worker/migrations/0002_orders_stock.sql`)
```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('enviado','confirmado','pago','entregue','cancelado')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, total_cents INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)));
CREATE INDEX orders_created ON orders (created_at);
CREATE INDEX orders_status ON orders (status, created_at);
CREATE TABLE stock_levels (
  product_id TEXT NOT NULL, variant_id TEXT NOT NULL, size TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL CHECK (qty >= 0 AND qty <= 100000), updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, variant_id, size));
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL, size TEXT NOT NULL DEFAULT '', delta INTEGER NOT NULL,
  qty_after INTEGER NOT NULL, reason TEXT NOT NULL, order_number INTEGER);
CREATE INDEX stock_movements_product ON stock_movements (product_id, id);
```
`worker/migrations/0003_order_counter.sql` (vinda da revisão adversarial): tabela `counters`. O número do pedido sai de um contador que só sobe, então um número excluído nunca volta. Na mesma revisão, as escritas em pedidos passaram a conferir `updated_at` (compare-and-swap da linha inteira), e as combinações removidas do catálogo deixaram de bloquear a confirmação.

Configurações (no snapshot, opcionais e compatíveis com backups antigos): `settings.pix?: { key, name, city }` e `settings.lowStockThreshold?: 0–20` (padrão 2).

## 3. API
| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/orders` | público, `Idempotency-Key` obrigatório | Valida contra o snapshot, grava, responde `{ order }` (número, itens, total, `pix`) |
| `GET /api/admin/orders` | painel | Pedidos dos últimos 400 dias, até 5000 |
| `POST /api/admin/orders/:id/status` | painel | `{ from, to }`; move estoque quando precisa |
| `POST /api/admin/orders/:id/anonymize` | painel | Apaga os dados da cliente |
| `DELETE /api/admin/orders/:id` | painel | Só `enviado` ou `cancelado` |
| `GET /api/admin/stock` | painel | Níveis exatos e os últimos movimentos |
| `PUT /api/admin/stock/:productId` | painel | `{ tracked, levels: [{variantId,size,qty,expected}] }`, com compare-and-swap por linha |

Erros no formato que já existe (`{error:{code,message,details}}`). Estoque insuficiente e status mudado respondem `409 conflict` com `details`.

## 4. Telas
- **Sacola** (folha e `/sacola`): nome e cidade obrigatórios, aviso de privacidade e "Finalizar pedido". Depois do registro: número, Pix (QR, copia e cola, valor, recebedor), "Enviar pedido pelo WhatsApp" e "Alterar pedido". A sacola se esvazia depois do envio. Quantidades acima do estoque são ajustadas com aviso.
- **Peça:** tamanho esgotado riscado e bloqueado, acabamento sem estoque marcado como esgotado, quantidade limitada ao estoque, "Últimas unidades" quando chegar ao limite.
- **Painel → Pedidos:** filtros por status com contagem; cartão com número, data, cliente, cidade, total e status. A folha de detalhe traz os itens, o próximo passo como botão principal, "Desfazer", "Cancelar", "Apagar dados da cliente", "Excluir" e o histórico. A aba mostra quantos pedidos estão abertos.
- **Painel → Estoque:** lista com o resumo de cada peça (sem controle, N un., últimas unidades, esgotado) e busca. A folha de edição tem "Controlar estoque", a grade acabamento × tamanho com campos numéricos e o histórico.
- **Painel → Relatório:** períodos, indicadores, barras, rankings, cidades, pedidos parados e CSV.
- **Painel → Configurações:** bloco Pix com prévia e o limite de "Últimas unidades". Novo item no checklist: "Chave Pix para receber os pedidos".
- Abas do painel: Pedidos, Produtos, Estoque, Relatório, Categorias, Revendedoras, Configurações, Backup. `/admin` abre em Pedidos.

## 5. Testes
- **Unitários (Vitest):**
  - `pix` (CRC do exemplo do Banco Central, montagem dos campos, normalização da chave, truncamento sem acento);
  - `stock` (materialização, combinação que falta vale 0, disponibilidade, limite);
  - `orders` (transições, o que segura estoque, montagem da mensagem com número);
  - `report` (períodos, o que conta como venda, rankings, ticket médio, parados);
  - BagContents (validação, fluxo registrado, falha com fallback).
- **Worker (integração com D1 local real):**
  - criar pedido (preço do servidor, peça esgotada → 409, honeypot, limite, replay de idempotência);
  - dados pessoais fora do snapshot;
  - confirmar dá baixa, cancelar devolve, desfazer;
  - duas confirmações concorrentes pela última unidade → uma 200 e uma 409, estoque nunca negativo;
  - `PUT` de estoque com `expected` desatualizado → 409;
  - edição de catálogo depois do estoque preserva o mapa e apaga órfãos;
  - excluir pedido que segura estoque → recusado.
- **E2E (Playwright, Chromium e WebKit):** rotas públicas sem coleções, `/colecao/rose` → catálogo, checkout completo até o link do WhatsApp com número, e o painel (Pedidos e Estoque) com a baixa refletida na página pública ao vivo.
- **Produção, depois do deploy:** `/api/health`, snapshot com `stock`, páginas sem "Coleções", fluxo da sacola no navegador e um pedido de teste excluído logo em seguida.

## 6. Riscos e limites
- **Free plan:** cada mudança de status relê e reescreve o snapshot (cerca de 100 KB), o que cabe nos 10 ms de CPU com 24 a 500 peças. O relatório lê até 5000 linhas por carga; quando o volume crescer, trocar por agregação SQL por período.
- **A cliente pode registrar e não enviar:** o pedido fica como "enviado" e aparece como parado. É informação útil para a Érika, não um erro.
- **O Pix estático não confirma sozinho.** Está dito na tela e no painel.
- **Fica de fora:** Pix dinâmico, edição dos itens de um pedido no painel, frete, notificação push e exportar ou importar pedidos no backup (a restauração do D1 por Time Travel cobre o banco inteiro).

## 7. Ordem
1. Menu e coleções. 2. Migração e módulos puros (`stock`, `orders`, `pix`, `report`). 3. Worker (pedidos, estoque, rematerialização no `handleChanges`, mensagem ao vivo). 4. Site público (disponibilidade e sacola com Pix). 5. Painel (Pedidos, Estoque, Relatório, Configurações). 6. Testes, revisão adversarial, E2E. 7. Documentação, commit, deploy e verificação em produção.
