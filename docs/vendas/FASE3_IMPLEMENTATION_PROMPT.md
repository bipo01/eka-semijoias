# Prompt de implementação — fase 3

> Para o Claude e os agentes da fase 3, 23/11/2026. Implementar `docs/vendas/FASE3_PLAN.md` inteiro.

## Regras
- `AGENTS.md` vale integralmente: voz, tokens, `Sheet`, pt-BR, erros visíveis e o servidor como autoridade.
- **Um dono por arquivo:** cada agente trabalha só no seu escopo do plano. Mudanças fora dele viram nota no relatório.
- **Migrações só aditivas:** `0005_*.sql` em diante.
- **Recurso sem segredo fica escondido:** sem chaves VAPID não há avisos no celular; sem token do Mercado Pago, o Pix continua o estático. Nada pode quebrar o fluxo atual.

## Critérios de aceite
1. **App instalável:**
   - Chrome Android/desktop: o botão abre a instalação nativa.
   - iPhone: guia correto para Safari e Chrome.
   - Instagram, WhatsApp ou Facebook: orientação e "Copiar link".
   - No `/admin`, o manifesto "Painel ÉKA" com `start_url` `/admin`.
   - O service worker registra sem cachear o site.
   - O Lighthouse aponta o site como instalável.
2. **Padronizador:**
   - Tira o fundo das fotos de teste (joias geradas no ChatGPT) e compõe 4:5 sobre o fundo da marca.
   - O pincel corrige o recorte.
   - Dá para manter a original.
   - O modelo só carrega ao usar, com barra de progresso.
   - Nenhum byte do motor vai para o pacote público.
3. **Pedido manual:**
   - Nasce como "Em negociação" ou "Confirmado", com preço do servidor.
   - Confirmado: tira as peças do estoque, e recusa quando falta estoque.
   - Aparece no relatório.
4. **Edição de itens:**
   - Em negociação: troca livremente.
   - Confirmado: o estoque fica certo (o que saiu volta, o novo sai) e uma corrida pela última unidade não deixa o saldo negativo.
   - Valor mudou: a cobrança cai e o link antigo deixa de valer.
5. **Avisos no celular:**
   - Ativar no painel cria a assinatura.
   - Um pedido novo e um comprovante geram notificação com o número e o valor.
   - Assinatura morta é apagada.
   - A criptografia passa no vetor da RFC 8291.
6. **Pix automático:**
   - Com os secrets: QR dinâmico na página de pagamento, webhook assinado marcando como pago, e a página mudando sozinha.
   - Webhook inválido, valor diferente ou repetido não muda nada.
   - Sem os secrets: tudo como antes.

## Validação
- `typecheck`, `lint`, testes unitários, `test:worker`, `test:integration` (com o Mercado Pago simulado) e `e2e` nos quatro navegadores.
- No Chrome, pelo Claude in Chrome:
  - instalação;
  - padronizador com as fotos geradas;
  - pedido manual e edição;
  - avisos no celular (a Érika precisa permitir as notificações).
- Revisão adversarial independente, correção do que for confirmado e nova rodada de testes.

## Publicação
- Commit e push na `main`.
- `npm run deploy` (migração aditiva).
- Criar os secrets VAPID.
- Testar em produção.
- Limpar os dados de teste.
