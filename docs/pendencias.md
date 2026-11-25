# Pendências — ÉKA Semijoias

Funcionalidades pedidas para depois da versão atual. Registrado em 19/11/2026.

> **Atualização 24/11/2026 (fase 6):** feitos os dois itens que tinham ficado para depois. (1) Apagar os dados de uma revendedora que saiu (LGPD): em Painel → Revendedoras, numa revendedora com a parceria encerrada e os acertos recebidos, "Apagar os dados" tira do sistema o cadastro, a ficha, o acesso, o aceite do contrato, as maletas, os acertos e as vendas dela (com os dados das clientes que ela registrou); antes, dá para baixar os acertos em planilha. (2) Os textos da página de pagamento e do painel da revendedora agora são editáveis em Painel → Site → "Pagamento e revenda". Continua para depois: envio 100% automático pela API oficial do WhatsApp (custo por mensagem).

> **Atualização 24/11/2026 (fase 5):** a Érika passou a editar o site inteiro em Painel → Site (`docs/conteudo/PLAN.md`): página inicial (chamada, foto, títulos, faixa da revenda, dicas, fotos do Instagram), depoimentos (adicionar, editar, ocultar, apagar, só com autorização da cliente; os de exemplo saíram), perguntas frequentes, Sobre, Como cuidar, Garantia, Seja revendedora, Contato, textos gerais, Política de privacidade (`/privacidade`, nova) e o texto/foto do Google e da prévia no WhatsApp (uma peça compartilhada mostra foto, nome e preço). Fatos do negócio (antialérgicas, envio, parcelamento, banho, consignado, investimento) em Configurações → "O que a loja oferece". Fica para depois: apagar os dados de uma revendedora (LGPD), textos transacionais da página de pagamento e do painel da revendedora.

> **Atualização 23/11/2026 (fase 4):** pedido da Érika implementado (`docs/revenda/PLAN.md`): cadastro de clientes com a mensagem "Compra registrada" (garantia) abrindo na conversa dela, fichas de revendedora com aprovação e efetivação (convite com contrato + PIN, mostruário digital `/r/<nome>`), painel da revendedora (`/revenda`: maleta, vendas, comissão por faixas, lucro acumulado, acertos) e estoque com entradas, saídas e o que está nas maletas. **Falta a Érika confirmar:** as faixas de comissão (padrão 25/30/35%), o prazo do acerto (30 dias) e o texto do contrato (o inicial é um modelo para revisar). Pendente para depois: envio 100% automático pela API oficial do WhatsApp (custo por mensagem) e um caminho para apagar os dados de uma revendedora (LGPD).

> **Atualização 23/11/2026 (fase 3):** tudo desta lista está pronto. Botão "Instalar o app" e o app "Painel ÉKA" (item 4), padronizador de fotos (item 5), pedido manual, edição das peças de um pedido, avisos no celular (Web Push) e Pix automático pelo Mercado Pago. Plano: `docs/vendas/FASE3_PLAN.md`. O Pix automático fica desligado até a conta do Mercado Pago ser ligada (`docs/vendas/PIX_AUTOMATICO.md`).

> **Atualização anterior, 23/11/2026:** os itens 1 (Pix estático), 2 (controle de estoque) e 3 (registro de pedidos e relatório de vendas) estão prontos: plano em `docs/vendas/PLAN.md`. Na mesma data, Coleções saíram do site (menu, cabeçalho, banner da página inicial e `/colecao/*`, que agora leva ao catálogo) e o menu lateral deixou de mostrar preços, a pedido da Érika. Falta a Érika preencher a chave Pix em Painel → Configurações. O Pix dinâmico continua como próximo passo opcional. **O backend já existe** desde 23/11/2026 (Cloudflare Workers + D1 + Durable Objects, com tempo real por WebSocket; veja `docs/backend/PLAN.md` e `AGENTS.md`): pedidos, estoque e Pix entram como novas tabelas e rotas nele.

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

## 4. Botão "Instalar o app" (Android e iPhone) — feito

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

## 5. Padronizador de fotos (remover o fundo e aplicar o fundo da marca) — feito

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

## 6. Preço de custo e lucro

Registrado em 25/11/2026. **Fica para depois** (decisão de 25/11/2026).

**Objetivo:** a Érika informa quanto pagou em cada peça e vê no relatório o lucro e a margem, além do faturamento. Hoje cada peça só tem o preço de venda: o relatório mostra quanto ela vendeu, não quanto ganhou. O "lucro acumulado" do painel da revendedora é a comissão dela, não o lucro da loja.

**Como fazer**
- **Custo só no painel.** O catálogo (`/api/catalog`) é público, então o custo **não** pode ficar no produto. Ele fica numa tabela à parte, lida só por rotas do admin, como o estoque (`stock_levels`). Custo por peça, com a opção de um custo por acabamento quando ela precisar.
- **Custo congelado na venda.** Ao entrar em confirmado/pago (e no pedido manual, e na venda da revendedora), cada linha do pedido guarda o custo daquele momento. Mudar o custo depois não altera o lucro das vendas antigas.
- **Relatório:** lucro bruto e margem no total, por período, por peça e por categoria. Venda de revendedora: venda − comissão − custo. Frete e desconto entram na conta como estão no pedido.
- **Peça sem custo cadastrado** aparece como "sem custo" e fica fora do cálculo, com o aviso de quantas vendas ficaram de fora. Nunca vira lucro de 100%.
- **Backup e exportação:** o custo entra no backup do painel e no CSV do relatório; nunca no snapshot público, no WebSocket ou nos logs.
- Formulário da peça: campo "Quanto você pagou" ao lado do preço, com a margem calculada na hora.

## 7. Melhorias sugeridas (vender mais, fazer a cliente voltar, segurança)

Registrado em 25/11/2026, depois de olhar o site como dona de loja, cliente e programador. Nenhuma foi pedida pela Érika ainda. Os itens 7.1, 7.2, 7.6 e 7.8 são rápidos e sem risco.

### Vender mais

**7.1 Guia de medida do aro.** A página do anel pede o aro, mas não ensina a descobrir. A cliente desiste ou erra e depois pede troca.
- "Como descobrir meu aro" ao lado da escolha do tamanho (`src/pages/Product.tsx`), num `Sheet`: medir com uma linha ou tira de papel em volta do dedo, ou o diâmetro de um anel que ela já usa, com a tabela de conversão para a numeração brasileira.
- Dicas: medir no fim do dia, dedo frio afina, junta larga pede o aro de cima.
- Texto editável em Painel → Site; ilustração no estilo da marca (ChatGPT).

**7.2 Aparecer no Google (busca e aba Shopping).** Hoje o Google só sabe que o site existe se alguém o encontrar por um link.
- `sitemap.xml` gerado pelo Worker a partir do snapshot (página inicial, catálogo, categorias, cada peça visível), citado no `robots.txt`.
- Dados de produto em JSON-LD (`schema.org/Product`: nome, foto, preço em BRL, disponível/esgotado) em cada página de peça, escritos pelo `serveDocument` como as tags de compartilhamento (`worker/seo.ts`).
- Cadastrar o site no Google Search Console e no Google Merchant Center (listagens gratuitas na aba Shopping), com um feed de produtos (`/feed/google.xml`). O cadastro nas contas do Google é da Érika; o site só entrega os arquivos.

**7.3 Catálogo no Instagram e no WhatsApp.** O mesmo feed de produtos alimenta o catálogo da Meta (Commerce Manager): as peças ficam marcáveis nos posts e stories e aparecem no catálogo do WhatsApp Business, cada uma com o link da página dela.
- Feed `/feed/meta.csv` (ou XML) do snapshot, atualizado sozinho a cada mudança no painel. Só peças visíveis, com preço, foto principal e estoque.
- Exige conta comercial no Instagram e no Facebook (decisão e cadastro da Érika).

**7.4 Frete na sacola.** Hoje o frete é sempre combinado no WhatsApp.
- Regras simples editáveis em Configurações: motoboy em Cuiabá (e Várzea Grande) com valor fixo, retirada, Correios para o resto do Brasil "a combinar" ou por faixa, frete grátis acima de um valor.
- A sacola pergunta a cidade (ou o CEP) e mostra a estimativa; o pedido guarda o frete escolhido (o servidor recalcula, como já faz com o preço). A Érika ainda pode ajustar no pedido.
- Cálculo exato dos Correios por API fica para depois (contrato e custo).

**7.5 Cupom de desconto.** Hoje o desconto só existe na cobrança feita pela Érika.
- Painel → Cupons: código, % ou valor fixo, validade, valor mínimo, limite de usos, um uso por cliente (por WhatsApp).
- A sacola aceita o código; o servidor valida e aplica no `priceOrder`; o relatório mostra o desconto dado por cupom.
- Serve para lançamento, campanha do Instagram e indicação de cliente.

### Fazer a cliente voltar

**7.6 Aniversariantes.** A ficha da cliente já guarda o aniversário (DD/MM), mas nada avisa a Érika.
- "Aniversariantes da semana" no Início do painel (`sections/HomePage.tsx`, bloco "Precisa de você"), com a mensagem pronta no WhatsApp (novo tipo em `src/data/messages.ts`, com variações editáveis em Painel → Mensagens).
- Opcional: aviso no celular no dia (Web Push).

**7.7 Pós-venda.** Uns 10 dias depois de o pedido ir para "entregue", o painel lembra a Érika de pedir a opinião da cliente, com a mensagem pronta (e o pedido de autorização para usar como depoimento).
- Alimenta os depoimentos (hoje vazios) e reforça a garantia e os cuidados com a peça.

### Saber o que funciona

**7.8 Números de visita.** Hoje ela não sabe quantas pessoas entram, quais peças olham nem quantas montam a sacola e desistem.
- Cloudflare Web Analytics (grátis, sem cookies, sem aviso de LGPD): visitas, páginas e peças mais vistas, de onde vêm (Instagram, Google, WhatsApp). Liberar o script na CSP.
- Depois, se quiser: no relatório, "olharam × colocaram na sacola × finalizaram" por peça, contado no próprio servidor, sem dado pessoal.
- Atualizar a Política de privacidade (`privacidade` em `src/content/defaults.ts`) se algo novo for coletado.

### Segurança do negócio

**7.9 Backup automático.** Hoje o backup só existe quando ela baixa pelo painel, e o D1 volta no tempo só até 7 dias (plano Free).
- Cron do Worker (semanal) exporta catálogo, pedidos, clientes, revenda e estoque para o R2 (exige ligar o R2; ver o topo do `AGENTS.md`), guardando as últimas N cópias.
- O painel mostra "Último backup: há X dias" e permite baixar qualquer cópia. Dados pessoais: o backup segue a mesma regra de acesso (só admin) e as exclusões da LGPD valem também para as cópias antigas, que expiram.

**7.10 Domínio próprio (.com.br).** O endereço `eka-semijoias.eka-semijoias.workers.dev` passa pouca confiança para quem vai pagar por Pix.
- Registrar `ekasemijoias.com.br` (ou parecido) no Registro.br (cerca de R$ 40 por ano; compra e titularidade da Érika, de preferência com o CNPJ), apontar para o Worker na Cloudflare e redirecionar o endereço antigo.
- Depois: refazer os links já compartilhados (bio do Instagram, mostruários das revendedoras), o webhook do Mercado Pago, o Search Console, e conferir no código tudo que cite o endereço antigo (CSP, `AGENTS.md`, página de redirecionamento do GitHub Pages).

## Ordem sugerida

1. ~~Backend (pré-requisito de tudo).~~ Feito em 23/11/2026.
2. ~~Registro de pedidos + relatório de vendas.~~ Feito em 23/11/2026.
3. ~~Controle de estoque (usa a confirmação de pedidos).~~ Feito em 23/11/2026.
4. ~~Pix estático~~ (feito em 23/11/2026). ~~Pix dinâmico~~: feito com o Mercado Pago, desligado até a conta ser ligada.
5. ~~Botão "Instalar o app" (item 4) e padronizador de fotos (item 5).~~ Feitos em 23/11/2026, com pedido manual, edição de peças e avisos no celular.

## Tempo real (atualização ao vivo)

Para o painel atualizar sozinho quando chega um pedido novo, ou o estoque mudar na tela da cliente sem recarregar, há três caminhos na Cloudflare:

- **Atualização periódica** (o painel consulta a cada 15–30 segundos): o mais simples e suficiente para o volume atual.
- **WebSocket nativo com Durable Objects:** é a forma de tempo real da própria Cloudflare. **Implementado** (`worker/live.ts`): o catálogo já atualiza ao vivo nas telas abertas.
- **Socket.IO:** o servidor do Socket.IO precisa de um processo Node.js rodando sem parar, e os Workers não funcionam assim. Na Cloudflare, o equivalente é o WebSocket com Durable Objects, citado acima.

Situação atual: o WebSocket com Durable Objects já está no ar. O catálogo e o estoque atualizam ao vivo nas telas abertas, e o painel recebe pedidos novos na hora.
