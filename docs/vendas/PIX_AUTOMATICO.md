# Pix automático (Mercado Pago) e avisos no celular: como ligar

Atualizado em 23/11/2026. O código já está no ar. Os dois recursos ficam desligados até os segredos abaixo existirem. Enquanto isso, o site segue com o Pix pela chave e o envio de comprovante.

## Pix automático (Mercado Pago)

**Como funciona para a cliente**
1. No link de pagamento, ela informa o e-mail. O Mercado Pago exige o e-mail, e a gente não guarda.
2. Aparecem o QR Code e o Pix Copia e Cola daquele pedido, no valor exato, válidos por 24 horas.
3. Quando ela paga, o Mercado Pago avisa o site. O pedido vira "Pago" sozinho e a página mostra "Pagamento confirmado".
4. Se o aviso atrasar, o botão "Já paguei" consulta o Mercado Pago na hora.

**O que garante que ninguém marca como pago sem pagar**
- O aviso do Mercado Pago precisa ter a assinatura certa.
- Mesmo com a assinatura certa, o site busca o pagamento direto na API do Mercado Pago.
- Ele só marca como pago se o pagamento estiver aprovado, em reais, para aquele pedido e aquela cobrança, e no valor exato.
- Se a Érika muda o frete ou as peças depois de gerado o Pix, a cobrança antiga deixa de valer.

**Para ligar (uma vez)**
1. Ter uma conta Mercado Pago de vendedor com uma chave Pix cadastrada nela.
2. Em [Suas integrações](https://www.mercadopago.com.br/developers/panel/app), criar uma aplicação ("Pagamentos online", sem loja pronta).
3. Em **Credenciais de produção**, copiar o **Access Token** (começa com `APP_USR-`).
4. Em **Webhooks → Configurar notificações**, no modo produção:
   - URL: `https://eka-semijoias.eka-semijoias.workers.dev/api/webhooks/mercadopago`
   - Evento: **Pagamentos**
   - Salvar e copiar a **assinatura secreta** gerada.
5. No terminal, na pasta do projeto:
   ```bash
   npx wrangler secret put MP_ACCESS_TOKEN
   npx wrangler secret put MP_WEBHOOK_SECRET
   ```
   Cada comando pede o valor. Não precisa publicar de novo: os segredos valem na hora.
6. Testar com um pedido de valor baixo (R$ 1,00) e depois excluir o pedido no painel.

**Taxa:** o Mercado Pago cobra uma porcentagem por Pix recebido. Confira o valor atual no painel do Mercado Pago antes de ligar.

**Para desligar:** `npx wrangler secret delete MP_ACCESS_TOKEN`. A página volta ao Pix pela chave.

## Avisos no celular (Web Push)

- O segredo `VAPID_PRIVATE_KEY` já foi criado na publicação de 23/11/2026.
- No celular da Érika:
  1. Abrir o **Painel ÉKA instalado**. No iPhone, o aviso só funciona com o painel instalado na tela de início, iOS 16.4 ou mais novo.
  2. Ir em Configurações → **Avisos no celular → Ativar avisos neste aparelho** e permitir as notificações.
  3. Tocar em "Enviar aviso de teste".
- Chega aviso quando entra pedido pelo site, quando chega comprovante e quando o Pix automático é pago. O aviso mostra só o número do pedido e o valor.

**Gerar uma chave nova** (só se precisar trocar; depois, ativar os avisos de novo em cada aparelho):
```bash
node -e "(async()=>{const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const {kty,crv,d,x,y}=await crypto.subtle.exportKey('jwk',k.privateKey);console.log(JSON.stringify({kty,crv,d,x,y}))})()" | npx wrangler secret put VAPID_PRIVATE_KEY
```
