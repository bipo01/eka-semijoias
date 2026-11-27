# Avisos no celular (Web Push): como ligar

Atualizado em 26/11/2026. O Pix automático pelo Mercado Pago foi retirado do sistema nessa data (a loja confere o Pix pelo comprovante); este guia ficou só com os avisos no celular.

- O segredo `VAPID_PRIVATE_KEY` já foi criado na publicação de 23/11/2026.
- No celular da Érika:
  1. Abrir o **Painel ÉKA instalado**. No iPhone, o aviso só funciona com o painel instalado na tela de início, iOS 16.4 ou mais novo.
  2. Ir em Configurações → **Avisos no celular → Ativar avisos neste aparelho** e permitir as notificações.
  3. Tocar em "Enviar aviso de teste".
- Chega aviso quando entra pedido pelo site e quando chega comprovante. O aviso mostra só o número do pedido e o valor.

**Gerar uma chave nova** (só se precisar trocar; depois, ativar os avisos de novo em cada aparelho):
```bash
node -e "(async()=>{const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const {kty,crv,d,x,y}=await crypto.subtle.exportKey('jwk',k.privateKey);console.log(JSON.stringify({kty,crv,d,x,y}))})()" | npx wrangler secret put VAPID_PRIVATE_KEY
```
