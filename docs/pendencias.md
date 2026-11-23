# Pendências — ÉKA Semijoias

Funcionalidades pedidas para depois da versão atual. Registrado em 19/11/2026.

> **Atualização 23/11/2026:** os itens 1 (Pix estático), 2 (controle de estoque) e 3 (registro de pedidos e relatório de vendas) estão prontos: plano em `docs/vendas/PLAN.md`. Na mesma data, Coleções saíram do site (menu, cabeçalho, banner da página inicial e `/colecao/*`, que agora leva ao catálogo) e o menu lateral deixou de mostrar preços, a pedido da Érika. Falta a Érika preencher a chave Pix em Painel → Configurações. O Pix dinâmico continua como próximo passo opcional. **O backend já existe** desde 23/11/2026 (Cloudflare Workers + D1 + Durable Objects, com tempo real por WebSocket; veja `docs/backend/PLAN.md` e `AGENTS.md`): pedidos, estoque e Pix entram como novas tabelas e rotas nele.

## 1. Pix com os dados certos (QR Code e copia e cola) — feito (estático)

**Objetivo:** na sacola, depois de montar o pedido, a cliente vê o valor exato com um QR Code Pix e o código "copia e cola", com os dados corretos da ÉKA.

**Como fazer**
- Gerar o código Pix no padrão do Banco Central (BR Code / EMV): chave Pix, nome do recebedor, cidade, valor do pedido e identificador (txid), com o CRC16 no final. Um código malformado faz o app do banco recusar o pagamento, então ele precisa de teste automatizado com códigos de exemplo válidos.
- O QR Code e o "copia e cola" saem do mesmo código. O botão de copiar avisa "Código copiado".
- A chave Pix, o nome e a cidade do recebedor ficam nas Configurações do painel (e em `src/config/business.ts` enquanto não forem confirmados), nunca escritos no código.
- O valor vem do total da sacola (em centavos), e a mensagem do WhatsApp passa a dizer "Pagamento via Pix".

**Decisão a tomar: Pix estático ou dinâmico**
- **Estático** (sem custo, sem integração): o QR Code é gerado no próprio site. A confirmação do pagamento é manual: a cliente manda o comprovante pelo WhatsApp e a Érika confere no banco.
- **Dinâmico** (com um provedor de pagamento, como Mercado Pago, Efí ou o banco dela): o pagamento é confirmado sozinho e o pedido muda para "pago". Exige conta no provedor, tem taxa por transação e precisa de um endpoint no servidor para receber a confirmação.
- Recomendação: começar pelo estático e passar ao dinâmico quando o volume justificar.

**Perguntar à Érika:** a chave Pix (CPF, CNPJ, e-mail, telefone ou aleatória), o nome exato do recebedor como aparece no banco, a cidade, e se ela tem CNPJ.

## 2. Controle de estoque — feito

**Objetivo:** cada peça tem a quantidade disponível por acabamento e tamanho (ex.: Anel Solitário, Dourado, aro 16: 3 unidades). Quando acaba, a peça aparece como "Esgotado" sozinha.

**Como fazer**
- Estoque por combinação de acabamento e tamanho no banco (D1), editável no painel. O interruptor "Disponível" de hoje continua como chave geral.
- Na página da peça e na sacola, não deixar escolher mais unidades do que há em estoque. Mostrar "Últimas unidades" quando restarem poucas (limite configurável).
- **Quando baixar o estoque:** o pedido fecha no WhatsApp, então o site não sabe sozinho que a venda aconteceu. A baixa acontece quando a Érika marca o pedido como confirmado no painel (ou automaticamente, com o Pix dinâmico). Pedido cancelado devolve as unidades ao estoque.
- Duas clientes pedindo a última unidade ao mesmo tempo: a confirmação no servidor tem de ser atômica (uma transação no D1), para o estoque nunca ficar negativo.
- Histórico de entradas e saídas (quem, quando, quanto e por quê), para conferência.

## 3. Relatório de vendas — feito

**Objetivo:** a Érika vê no painel quanto vendeu, o que mais sai e o andamento de cada pedido.

**Como fazer**
- Pré-requisito: **registrar os pedidos**. Hoje o pedido só vira uma mensagem de WhatsApp. Ao tocar em "Enviar pedido", o site passa a salvar o pedido no banco, com número, itens, valores em centavos, nome e cidade. A mensagem do WhatsApp inclui o número do pedido.
- No painel, cada pedido tem um status: enviado pelo WhatsApp → confirmado → pago → entregue (ou cancelado).
- Relatório com:
  - vendas por período (dia, semana, mês) em quantidade de pedidos e valor;
  - ticket médio;
  - peças, categorias e acabamentos mais vendidos;
  - vendas por cidade;
  - pedidos parados (enviados e nunca confirmados).
- O relatório conta só pedidos confirmados ou pagos. Pedidos apenas enviados aparecem à parte, como "em negociação".
- Exportar em CSV, como já é feito com as revendedoras.
- Os dados de clientes (nome e cidade) entram na política de privacidade e podem ser apagados a pedido (LGPD).

## 4. Botão "Instalar o app" (Android e iPhone)

Registrado em 23/11/2026. **Prioridade: depois dos itens 1 a 3.**

**Objetivo:** a cliente instala o site como um app na tela inicial (ícone da ÉKA, abre em tela cheia). A Érika tem um ícone próprio, "Painel ÉKA", que abre direto em `/admin`.

**Como funciona em cada aparelho**
- **Android (Chrome, Samsung Internet, Edge):** instalação de verdade com um toque, pelo evento `beforeinstallprompt`. O botão abre a janela nativa de instalação.
- **iPhone (Safari, Chrome, Edge, Firefox):** a Apple não deixa nenhum site disparar a instalação, nem no Chrome (todo navegador do iPhone usa o motor do Safari). O botão abre um guia curto com o passo certo para o navegador detectado:
  - Safari: Compartilhar → Adicionar à Tela de Início;
  - Chrome (`CriOS` no user agent): ícone de compartilhar na barra de endereço → Adicionar à Tela de Início.
- **Navegador interno do Instagram, WhatsApp ou Facebook:** não instala. O botão explica "Abra no Safari ou no Chrome para instalar" e oferece copiar o link. É importante porque muita cliente chega pelo link da bio.

**Como fazer**
- O site já atende os requisitos: HTTPS, `manifest.webmanifest`, ícones 192/512 e ícone maskable. Conferir `display: standalone`, `start_url` e `scope` com as rotas limpas (`/`).
- Botão discreto no menu e no rodapé, sem pop-up automático. Some quando o site já está instalado (`display-mode: standalone` / `navigator.standalone`). Se a cliente dispensar, não aparece de novo por um tempo, lembrado no localStorage.
- Painel instalável à parte: em `/admin`, trocar o `<link rel="manifest">` por um manifesto próprio (`name: "Painel ÉKA"`, `start_url: "/admin"`, `scope: "/admin"`).
- Se precisar de service worker, liberar `worker-src 'self'` na CSP do documento (`worker/index.ts` e `public/_headers`). Hoje está `'none'`.
- Testar em Android real (Chrome), iPhone (Safari e Chrome) e no navegador interno do Instagram.

**Depois (opcional):** com o site instalado, notificação no celular da Érika quando chegar um novo pré-cadastro ou pedido (Web Push; o iPhone permite em apps instalados desde o iOS 16.4).

## 5. Padronizador de fotos (remover o fundo e aplicar o fundo da marca)

Registrado em 23/11/2026. **Prioridade: depois dos itens 1 a 3.**

**Objetivo:** no painel, a Érika cola ou tira a foto e toca em "Padronizar". O sistema:
- recorta a peça e a coloca sobre o fundo padrão da marca, com sombra suave;
- centraliza a peça e a deixa sempre na mesma escala e no formato 4:5;
- mostra o antes e depois, para ela salvar ou ficar com a original.

**Escolha do motor (gratuito, sem custo por foto):** IA rodando no próprio celular, só dentro do painel, sem pesar no site das clientes.
- **Recomendado:** `@huggingface/transformers` (Transformers.js, Apache-2.0) com o modelo **BiRefNet** (MIT), em WebGPU quando houver e WASM nos demais. O modelo tem dezenas de MB: é baixado no primeiro uso e fica em cache no aparelho.
- **Alternativa a comparar:** `onnxruntime-web` com **ISNet** (modelo do rembg, Apache/MIT).
- **Evitar:**
  - `@imgly/background-removal`: licença AGPL, obrigaria a abrir o código do site;
  - RMBG-1.4 da BRIA: proíbe uso comercial;
  - recorte só por cor, sem IA: falha com pérola branca em fundo branco e com zircônia transparente.

**Limites honestos:** corrente fina, zircônia transparente e reflexo de metal são o caso mais difícil para qualquer removedor de fundo. Nenhum acerta 100% sozinho.

**Como fazer**
1. **Teste antes de construir:**
   - Usar BiRefNet contra ISNet, com 5 a 10 fotos reais das peças da Érika: corrente fina, pedra transparente, metal brilhante, pérola.
   - Medir a qualidade do recorte e o tempo em um celular comum. O vencedor vira o motor do padronizador.
2. **No painel (`src/admin/products/PhotoManager.tsx`, junto do pipeline de `src/lib/image.ts`):**
   - "Padronizar foto": recorte, composição sobre o fundo da marca (cor dos tokens, sem degradê exagerado), sombra suave, peça centralizada ocupando uma fração fixa do quadro, saída 4:5 em WebP/JPEG dentro do orçamento atual de tamanho.
   - Antes/depois lado a lado, e **pincel de retoque** (apagar e restaurar) para os casos difíceis.
   - Opção de manter a original. A foto padronizada segue o fluxo de envio que já existe (`/api/admin/media`).
3. **Dica na tela para fotografar:** fundo liso, luz difusa, sem flash, peça inteira no quadro. Melhora muito o recorte.
4. O modelo carrega só quando ela toca em "Padronizar" (lazy), com barra de progresso no primeiro download e aviso para usar o Wi-Fi.

## Ordem sugerida

1. ~~Backend (pré-requisito de tudo).~~ Feito em 23/11/2026.
2. ~~Registro de pedidos + relatório de vendas.~~ Feito em 23/11/2026.
3. ~~Controle de estoque (usa a confirmação de pedidos).~~ Feito em 23/11/2026.
4. ~~Pix estático~~ (feito em 23/11/2026); depois, se fizer sentido, Pix dinâmico.
5. Botão "Instalar o app" (item 4) e padronizador de fotos (item 5).

## Tempo real (atualização ao vivo)

Para o painel atualizar sozinho quando chega um pedido novo, ou o estoque mudar na tela da cliente sem recarregar, há três caminhos na Cloudflare:

- **Atualização periódica** (o painel consulta a cada 15–30 segundos): o mais simples e suficiente para o volume atual.
- **WebSocket nativo com Durable Objects:** é a forma de tempo real da própria Cloudflare. **Implementado** (`worker/live.ts`): o catálogo já atualiza ao vivo nas telas abertas.
- **Socket.IO:** o servidor do Socket.IO precisa de um processo Node.js rodando sem parar, e os Workers não funcionam assim. Na Cloudflare, o equivalente é o WebSocket com Durable Objects, citado acima.

Situação atual: o WebSocket com Durable Objects já está no ar. O catálogo e o estoque atualizam ao vivo nas telas abertas, e o painel recebe pedidos novos na hora.
