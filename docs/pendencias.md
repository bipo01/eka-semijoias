# Pendências — ÉKA Semijoias

Funcionalidades pedidas para depois da versão atual. As três dependem do backend (Cloudflare Workers + D1 + R2), que substitui o localStorage e faz o painel publicar para todas as clientes. Registrado em 19/11/2026.

## 1. Pix com os dados certos (QR Code e copia e cola)

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

## 2. Controle de estoque

**Objetivo:** cada peça tem a quantidade disponível por acabamento e tamanho (ex.: Anel Solitário, Dourado, aro 16: 3 unidades). Quando acaba, a peça aparece como "Esgotado" sozinha.

**Como fazer**
- Estoque por combinação de acabamento e tamanho no banco (D1), editável no painel. O interruptor "Disponível" de hoje continua como chave geral.
- Na página da peça e na sacola, não deixar escolher mais unidades do que há em estoque. Mostrar "Últimas unidades" quando restarem poucas (limite configurável).
- **Quando baixar o estoque:** o pedido fecha no WhatsApp, então o site não sabe sozinho que a venda aconteceu. A baixa acontece quando a Érika marca o pedido como confirmado no painel (ou automaticamente, com o Pix dinâmico). Pedido cancelado devolve as unidades ao estoque.
- Duas clientes pedindo a última unidade ao mesmo tempo: a confirmação no servidor tem de ser atômica (uma transação no D1), para o estoque nunca ficar negativo.
- Histórico de entradas e saídas (quem, quando, quanto e por quê), para conferência.

## 3. Relatório de vendas

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

## Ordem sugerida

1. Backend (pré-requisito de tudo).
2. Registro de pedidos + relatório de vendas.
3. Controle de estoque (usa a confirmação de pedidos).
4. Pix estático; depois, se fizer sentido, Pix dinâmico.

## Tempo real (atualização ao vivo)

Para o painel atualizar sozinho quando chega um pedido novo, ou o estoque mudar na tela da cliente sem recarregar, há três caminhos na Cloudflare:

- **Atualização periódica** (o painel consulta a cada 15–30 segundos): o mais simples e suficiente para o volume atual.
- **WebSocket nativo com Durable Objects:** é a forma de tempo real da própria Cloudflare.
- **Socket.IO:** o servidor do Socket.IO precisa de um processo Node.js rodando sem parar, e os Workers não funcionam assim. Na Cloudflare, o equivalente é o WebSocket com Durable Objects, citado acima.

Recomendação: começar com a atualização periódica e usar WebSocket com Durable Objects só se o volume pedir.
