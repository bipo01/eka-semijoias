# Prompt de planejamento — fase 3 (app instalável, fotos, pedido manual, edição, avisos, Pix automático)

> 23/11/2026, para o Claude (Opus 5.5). Saída: `docs/vendas/FASE3_PLAN.md` e `docs/vendas/FASE3_IMPLEMENTATION_PROMPT.md`.

## Papel
Designer de produto sênior e engenheiro sênior de Cloudflare Workers, React e PWA. Cada decisão vem do código atual (`AGENTS.md`, `docs/vendas/*.md`) e é provada com teste, inclusive no Chrome real (Claude in Chrome) e em produção.

## Pedido
Implementar todas as pendências:
1. **Botão "Instalar o app"** (`docs/pendencias.md` §4).
   - Android: instalação com um toque.
   - iPhone: guia por navegador.
   - Navegador interno do Instagram, WhatsApp ou Facebook: orientar a abrir no Safari ou no Chrome e copiar o link.
   - O painel ganha um app próprio, "Painel ÉKA", que abre direto em `/admin`.
2. **Padronizador de fotos** (`docs/pendencias.md` §5).
   - A IA roda no próprio aparelho, carregada só quando a Érika usa.
   - Licença livre para uso comercial; nada AGPL ou não comercial.
   - Mostra antes e depois e tem um pincel de retoque.
   - Testar com fotos de joia geradas no ChatGPT pelo Claude in Chrome: corrente fina, pérola no branco, metal brilhante, zircônia.
3. **Pedido manual:** a Érika registra no painel uma venda que chegou direto pelo WhatsApp. O pedido entra no estoque e no relatório.
4. **Editar os itens de um pedido** no painel: trocar peça, acabamento, tamanho ou quantidade, com estoque e cobrança coerentes.
5. **Aviso no celular da Érika** (Web Push) quando chegar um pedido ou um comprovante.
6. **Pix automático (dinâmico)** por um provedor, com o pedido marcado como pago sozinho quando o pagamento cai.

## Restrições
- **Plano Free da Cloudflare:** 10 ms de CPU por requisição; D1 só com `batch`; nada de bibliotecas pesadas no Worker.
- **Bundle público enxuto:** o código do padronizador e do push fica no pedaço lazy do painel.
- **CSP:** hoje `worker-src 'none'`. Abrir só o necessário: o service worker na raiz, e WASM e o download do modelo apenas no `/admin`.
- **Segredos só como Worker secrets:** chaves VAPID, token do provedor de Pix e segredo do webhook. Sem eles, o recurso fica escondido e o site segue funcionando.
- **Nada de dado pessoal na notificação** além do número do pedido e do valor; o nome da cliente não vai para o push.
- **Pagamento confirmado sozinho só com prova:** assinatura do webhook válida, pagamento conferido na API do provedor, valor e referência do pedido batendo, e compare-and-swap no status.
- **Sem conta do provedor ainda:** o Pix automático não pode ser testado ao vivo. Precisa de um provedor simulado nos testes de integração e de documentação de como ligar.
- **Voz e design da marca:** cobre `#8A5A45`, `Sheet` nativo, pt-BR.

## Perguntas que o plano responde
1. **Service worker:** o que ele faz (só push e instalabilidade, sem cache que deixe o site velho), como é servido (`run_worker_first`) e como evitar um service worker preso numa versão antiga.
2. **Instalação e manifesto:** como detectar `beforeinstallprompt`, standalone, iOS, Chrome no iOS e navegadores internos, e como trocar o manifesto no `/admin`.
3. **Modelo de remoção de fundo:** qual (licença, tamanho, qualidade com joias), como carregar (Transformers.js, WebGPU com recurso a WASM) e qual CSP isso exige.
4. **Edição de itens:** como editar com segurança se o pedido já segura estoque, e o que acontece com a cobrança e o link quando o valor muda.
5. **Web Push no Worker:** como fazer sem bibliotecas (VAPID ES256 e criptografia aes128gcm com WebCrypto), com teste contra o vetor oficial da RFC 8291.
6. **Pix automático:** qual provedor (API, taxa, exigências como o e-mail do pagador), qual fluxo, como validar o webhook e como testar sem conta.
7. **Divisão do trabalho:** o que dá para delegar em paralelo sem dois agentes mexerem nos mesmos arquivos.
