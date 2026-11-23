# Plano — fase 3

23/11/2026, a partir de `docs/vendas/FASE3_PLANNING_PROMPT.md`.

## 1. App instalável (PWA)

**Service worker (`public/sw.js`, escopo `/`)**
- Faz só três coisas: instalabilidade, push e clique na notificação.
- **Sem cache de páginas nem de API:** o site nunca fica preso numa versão antiga. O `fetch` não é interceptado.
- `skipWaiting` + `clients.claim`.
- É servido como arquivo estático (`!/sw.js` em `run_worker_first`) com `Cache-Control: no-cache` em `public/_headers`.

**Botão "Instalar o app"**
- Fica no menu lateral e no rodapé, sem pop-up automático, e some quando o site já está instalado (`display-mode: standalone` / `navigator.standalone`).
- **Android, Chrome e Edge:** `beforeinstallprompt` abre a janela nativa.
- **iPhone:** abre um guia curto com o passo de cada navegador.
  - Safari: Compartilhar → Adicionar à Tela de Início.
  - Chrome (`CriOS`): ícone de compartilhar na barra de endereço → Adicionar à Tela de Início.
- **Navegador interno do Instagram, WhatsApp ou Facebook:** orienta a abrir no Safari ou no Chrome e tem "Copiar link".
- Quem dispensa o convite não o vê de novo por 30 dias (localStorage).

**Painel ÉKA como app próprio**
- Em `/admin`, o `<link rel="manifest">` passa a apontar para `/admin.webmanifest`: `name` "Painel ÉKA", `start_url` `/admin`, `scope` `/admin`, ícones próprios com fundo cobre e o logo.
- O `apple-touch-icon` e o `apple-mobile-web-app-title` também mudam no `/admin`.

**CSP**
- `worker-src 'self'` em todas as páginas, para o service worker.
- No `/admin` também: `'wasm-unsafe-eval'` em `script-src`, os domínios do modelo em `connect-src` e `worker-src 'self' blob:` (veja o item 2).

## 2. Padronizador de fotos
- **Motor:** `@huggingface/transformers` (Apache-2.0), WebGPU quando houver e WASM nos demais.
- **Modelo:** decidido por medição, entre BiRefNet lite (MIT) e ISNet (Apache-2.0), testando com fotos de joia geradas no ChatGPT (`assets/test-photos/`). Ganha o que tiver melhor recorte em corrente fina, pérola e zircônia, com tempo aceitável num celular comum.
  - Proibidos: `@imgly/background-removal` (AGPL) e RMBG-1.4 (uso não comercial).
- **Carregamento:** os arquivos do modelo vêm do Hugging Face no primeiro uso e ficam no cache do navegador. Os arquivos WASM do ONNX Runtime saem do próprio site (`/assets`), não de um CDN.
- **Fluxo no PhotoManager:**
  1. "Padronizar" abre uma tela cheia que avisa para usar o Wi-Fi no primeiro uso e mostra o progresso do download.
  2. A IA recorta a peça e compõe sobre o fundo da marca (`#F3E6DC` → `#FBF8F5`, gradiente suave), com sombra leve, a peça centralizada ocupando cerca de 72% do quadro, no formato 4:5.
  3. Antes e depois lado a lado, com um pincel de retoque (apagar e restaurar a máscara) e as opções "Usar a padronizada" ou "Manter a original".
  4. A foto escolhida segue o pipeline atual (`processImage`, envio no salvar).
- **Dica antes de fotografar:** fundo liso, luz difusa, sem flash, peça inteira no quadro.

## 3. Pedido manual
- **Rota:** `POST /api/admin/orders` (painel) `{ items, name, city, note, status: 'enviado' | 'confirmado' }`.
- Preço sempre do catálogo (o servidor recalcula, com o mesmo `priceOrder`). Sem limite de pedidos por rede.
- Grava `source: 'manual'` nos dados do pedido.
- Se nascer confirmado, tira as peças do estoque no mesmo batch, com a mesma lógica da mudança de status.
- **Tela:** botão "Novo pedido" no topo de Pedidos, com busca de peças, escolha de acabamento, tamanho e quantidade, nome e cidade da cliente, observação, e "Já confirmado" (que separa as peças).

## 4. Editar itens de um pedido
- **Rota:** `PUT /api/admin/orders/:id/items` `{ items, stamp }`. Vale só para pedidos em **negociação** ou **confirmados**.
- **Confirmado:** a mesma batch devolve ao estoque o que o pedido segurava e tira o novo, com checagem de saldo e o mesmo `guard` de versão do catálogo.
- O servidor recalcula os preços.
- **Cobrança:** se o valor mudou, ela cai (`pay_token = NULL`) e o painel avisa para gerar uma nova. Os comprovantes ficam guardados.
- **Histórico:** registra "Itens alterados".

## 5. Aviso no celular (Web Push)
- **Chaves VAPID P-256:** a pública numa variável do Worker (`VAPID_PUBLIC_KEY`), a privada como secret (`VAPID_PRIVATE_KEY`, JWK).
- **Assinaturas:** tabela `push_subscriptions` (endpoint, p256dh, auth, criado em, último uso). Rotas do painel para assinar e cancelar.
- **Envio** em `waitUntil` quando chega um pedido novo ou um comprovante.
  - Payload: `{ title, body, url }`, com o número do pedido e o valor (sem o nome da cliente).
  - Criptografia RFC 8291 (aes128gcm) e JWT VAPID ES256, com WebCrypto, sem bibliotecas.
  - Respostas 404 ou 410 apagam a assinatura.
- **Tela:** em Configurações → "Avisos no celular", ativar, ver os aparelhos e testar.
  - No iPhone só funciona com o Painel instalado (iOS 16.4+), e a tela explica isso.

## 6. Pix automático (Mercado Pago)
- **Por que o Mercado Pago:** API simples com token Bearer (a Efí exige certificado mTLS), Pix com QR dinâmico e webhook assinado. A taxa do Pix é cobrada pelo Mercado Pago.
- **Liga sozinho quando os secrets existem:** `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`. Sem eles, o Pix estático de hoje continua igual.
- **Fluxo:**
  1. Na página de pagamento, "Gerar Pix automático" pede o e-mail da cliente, que o Mercado Pago exige.
  2. O servidor cria o pagamento (`POST /v1/payments`, `payment_method_id: pix`, `external_reference: <order id>:<charge token>`, `notification_url` com o webhook, expiração em 24 h, `X-Idempotency-Key`).
  3. O pagamento fica guardado em `order.charge.mp`, e a página mostra o QR e o Copia e Cola do Mercado Pago.
  4. A página consulta o status a cada 5 s enquanto está visível.
- **Webhook** `POST /api/webhooks/mercadopago`:
  - confere a assinatura `x-signature` (HMAC-SHA256 do manifesto `id;request-id;ts`, com tolerância de 5 min);
  - busca o pagamento na API (nunca confia no corpo da notificação);
  - exige `status = approved`, referência e valor batendo;
  - marca como pago com compare-and-swap (`confirmado → pago`), registra no histórico e manda aviso no celular. Repetições não fazem nada.
- **Testes:** um provedor simulado (servidor HTTP local) nos testes de integração, com `MP_API_BASE` apontando para ele.

## Divisão do trabalho
- **Agente A** (worktree), dono de `public/sw.js`, `public/admin.webmanifest`, ícones do painel, `public/_headers`, `wrangler.jsonc` (`run_worker_first`) e a parte de instalação (hook, botão, guia e troca de manifesto no `/admin`). O service worker já vem com `push` e `notificationclick` no formato `{ title, body, url }`.
- **Agente B** (worktree), dono do padronizador: `src/admin/products/standardize/*`, a integração no `PhotoManager`, `package.json` com `@huggingface/transformers` e os testes do modelo.
- **Eu:** CSP em `worker/index.ts`, pedido manual, edição de itens, Web Push (servidor e tela) e Pix automático. Depois integro, reviso, testo no Chrome, publico e testo em produção.
