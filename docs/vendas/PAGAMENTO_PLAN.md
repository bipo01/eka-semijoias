# Plano — cobrança por Pix com link e comprovante

23/11/2026. Muda o Pix descrito em `docs/vendas/PLAN.md` §1.4, a pedido da Érika: **a cliente só paga depois de falar com ela**, e o pagamento só vale com comprovante.

## Fluxo

1. **Cliente finaliza a sacola.** O pedido é registrado (nº) e aparece só o botão "Enviar pedido pelo WhatsApp", com o aviso "A gente confirma a disponibilidade e te manda o link de pagamento por lá". **Nenhum Pix na tela da cliente.** A mensagem do WhatsApp deixa de ter a linha "Pagamento".
2. **A Érika conversa** e combina frete ou desconto.
3. **No painel, no pedido, ela toca em "Cobrar por Pix"** e ajusta frete e desconto (o padrão é o total do pedido).
   - Se o pedido ainda está "Em negociação", ele é confirmado antes: a peça sai do estoque, para não ser vendida duas vezes enquanto a cliente paga.
   - O servidor cria um **link de pagamento** com token aleatório (128 bits, impossível de adivinhar): `/pagamento/<token>`.
   - O painel mostra a **mensagem pronta** (pedido, peças, frete e desconto, total, link e Pix Copia e Cola), com os botões "Copiar mensagem" e "Abrir WhatsApp".
4. **A cliente abre o link:**
   - Vê o resumo do pedido, o valor exato, o QR e o Copia e Cola.
   - Envia o comprovante (PNG, JPG, WebP, HEIC ou PDF), pelo celular ou arrastando o arquivo no computador.
   - Depois do envio, aparece "Comprovante recebido! A gente confere e confirma pelo WhatsApp".
5. **No painel, o pedido ganha o selo "Comprovante"** e aparece um aviso ao vivo. A Érika abre o comprovante (imagem na tela, PDF em outra aba), confere o valor ao lado do valor cobrado e toca em **"Pagamento conferido"**, que marca o pedido como pago.

## Decisões

- **Comprovante é dado pessoal e financeiro.** Fica numa tabela própria (`receipts`), servido só por `/api/admin/receipts/:id` com sessão. Nunca vai para `/media`, o snapshot ou o WebSocket. "Apagar dados da cliente" e "Excluir pedido" apagam os comprovantes também.
- **Armazenamento em D1**, que aceita no máximo 2 MB por linha:
  - O navegador reduz imagens grandes antes de enviar (JPEG, lado maior de até 2400 px, qualidade alta para o texto continuar legível). PNG e JPEG de até 1,5 MB vão como estão.
  - PDF vai como está, até 1,8 MB.
  - O servidor confere o tipo real pelos primeiros bytes do arquivo (assinatura): PNG, JPEG, WebP ou `%PDF-`.
- **Limites contra abuso:** 6 comprovantes por pedido, 20 envios por hora por rede e 300 por hora no total, além do token secreto. Pedido cancelado ou entregue não aceita comprovante.
- **Mudanças em pedidos:**
  - A cobrança grava `charge` no pedido e o token numa coluna própria com índice único (migração 0004).
  - Toda escrita confere `updated_at` (compare-and-swap); o upload do comprovante grava o arquivo e o pedido no mesmo batch.
  - Trocar o valor gera um token novo, então o link antigo deixa de valer e nunca mostra um valor desatualizado.
- **Página pública `/pagamento/:token`:**
  - É um pedaço separado do site (lazy), com cabeçalho mínimo da marca e sem a navegação da loja, para a cliente se concentrar em pagar.
  - Mostra o primeiro nome da cliente, as peças, os valores e o status: aguardando pagamento, comprovante em análise, pago, ou pedido cancelado.
  - Volta a consultar o servidor quando a cliente retorna à aba.
- **Relatório:** vendas passam a usar o valor cobrado menos o frete (`total − desconto`). O CSV ganha as colunas de frete, desconto e valor cobrado.
- **Ilustrações da marca:** pedido registrado, pagar com Pix e comprovante recebido, geradas no ChatGPT na paleta da ÉKA, convertidas para WebP em `public/images/illustrations/`.

## API

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/admin/orders/:id/charge` | painel | `{ shippingCents, discountCents }` → pedido com `charge` (exige Pix configurado; status enviado ou confirmado) |
| `GET /api/pay/:token` | público | Resumo do pedido para pagamento (sem dados além do primeiro nome) |
| `POST /api/pay/:token/receipt` | público | Arquivo bruto (≤ 1,9 MB) → `{ receipt }` |
| `GET /api/admin/receipts/:id` | painel | O arquivo, `no-store`, `inline` |

## Testes

- **Unitários:** total com frete e desconto, montagem da mensagem de cobrança, assinatura dos arquivos, plano de compressão.
- **Integração:**
  - Cobrança confirma e tira do estoque.
  - Token inválido dá 404; trocar o valor invalida o link antigo.
  - Upload: tipo falso recusado, arquivo grande recusado, limite por pedido.
  - Comprovante visível só para o painel; anonimizar e excluir apagam os comprovantes.
- **E2E:** do painel gerando a cobrança à cliente enviando o comprovante e ao painel vendo o comprovante e marcando como pago.
- **Produção:** o fluxo inteiro no Chrome, com limpeza no final.
