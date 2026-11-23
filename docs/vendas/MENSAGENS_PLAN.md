# Plano — modelos de mensagem editáveis

23/11/2026. A Érika quer mudar o texto das mensagens de WhatsApp sem depender de código e quer ter várias opções para escolher.

## O que muda

- **Uma aba nova no painel, "Mensagens",** com todos os tipos de mensagem. Cada tipo tem **variações prontas** (Clássica, Carinhosa, Direta e outras) e aceita variações **criadas por ela**.
  - Ela escolhe a variação padrão de cada tipo, edita o texto, insere informações do pedido com um toque e vê a prévia num balão de conversa com dados de exemplo.
- **No pedido, o botão "Enviar mensagem"** abre as mensagens da loja (cobrança, lembrete de pagamento, pagamento confirmado, pedido a caminho, pós-venda). Ela escolhe a variação, ajusta o texto daquela vez, copia ou abre o WhatsApp. A "Cobrança pronta" usa o mesmo componente.
- **No site, cada botão de WhatsApp usa a variação padrão do seu tipo.** A cliente ainda pode mudar o texto no WhatsApp antes de enviar.

## Tipos

**Enviadas pelas clientes** (abrem o WhatsApp da cliente já escritas):

| Tipo | Onde | Informações disponíveis |
|---|---|---|
| Pedido pela sacola | Sacola | `{pedido}` `{itens}` `{total}` `{nome}` `{cidade}` `{obs}` |
| Dúvida sobre uma peça | Página da peça | `{peca}` `{link_peca}` |
| Avise-me quando voltar | Peça esgotada | `{peca}` `{link_peca}` |
| Contato | Botão flutuante, rodapé, menu, Contato | `{loja}` |
| Comprovante enviado | Página de pagamento | `{pedido}` `{primeiro_nome}` |
| Quero ser revendedora | Formulário de revendedoras | `{nome}` `{whatsapp}` `{cidade}` `{uf}` `{instagram}` `{ja_revende}` `{origem}` |

**Enviadas pela Érika** (saem prontas no painel):

| Tipo | Onde | Informações disponíveis |
|---|---|---|
| Cobrança Pix | Pedido → Cobrar por Pix | `{primeiro_nome}` `{pedido}` `{itens}` `{frete}` `{desconto}` `{total}` `{link}` `{pix}` (obrigatório: `{link}`) |
| Lembrete de pagamento | Pedido com cobrança em aberto | `{primeiro_nome}` `{pedido}` `{total}` `{link}` |
| Pagamento confirmado | Pedido pago | `{primeiro_nome}` `{pedido}` `{total}` |
| Pedido a caminho | Pedido pago ou entregue | `{primeiro_nome}` `{pedido}` `{rastreio}` (preenchido na hora) |
| Pós-venda | Pedido entregue | `{primeiro_nome}` `{pedido}` `{loja}` |
| Boas-vindas à revendedora | Revendedoras | `{primeiro_nome}` `{loja}` |

## Regras do modelo

- **`{variavel}`** é trocada pela informação. Uma variável que não existe naquele tipo fica como foi escrita, e o editor avisa.
- **`[ … ]`** marca um trecho opcional: some quando alguma informação de dentro está vazia. Exemplo: `Olá! Fiz o pedido[ nº {pedido}] pelo site`.
- **Linhas vazias:** uma linha cujas informações vieram todas vazias some sozinha (por exemplo, `Frete: {frete}` sem frete).
- **Formatação** do próprio WhatsApp: `*negrito*` e `_itálico_`. A prévia mostra os dois.
- **`{itens}`** vira a lista numerada de peças. Quando a mensagem passaria de cerca de 1.800 caracteres (o limite prático dos links do WhatsApp), a lista usa o formato compacto.
- **Limites:** cada texto tem até 1.500 caracteres; são no máximo 30 variações próprias, com nome de até 40 caracteres.
- **Obrigatórias:** a cobrança não salva sem `{link}`, porque sem ele a cliente não consegue enviar o comprovante.

## Dados

- **Onde fica:** `settings.messages?: { active: { [tipo]: idDaVariacao }, edited: { [idDaVariacaoPronta]: texto }, custom: [{ id, type, name, text }] }`, dentro das configurações do catálogo.
- **O que vai salvo:** só o que a Érika mudou. As variações prontas ficam no código (`src/data/messages.ts`), e um snapshot sem `messages` usa as padrões.
- **Gravação:** salva por change set, como as outras configurações (validação zod + `checkIntegrity` no servidor).
- **Privacidade:** não há dado pessoal nos modelos, só textos com variáveis. Os dados da cliente entram na hora de montar a mensagem: no navegador da cliente ou no painel.

## Compatibilidade

- A variação **"Clássica"** de cada tipo reproduz exatamente o texto de hoje, e os testes conferem isso.
- Backups antigos continuam válidos, porque `messages` é opcional.

## Testes

- **Unitários do motor:** trechos opcionais, linhas vazias, variáveis desconhecidas, obrigatórias, formato compacto e a "Clássica" idêntica ao texto atual em cada tipo.
- **Componentes:** editor (inserir variável, prévia, salvar).
- **E2E:**
  - A Érika troca a variação de "Pedido pela sacola" e edita o texto, e a mensagem da sacola sai com o texto novo.
  - "Enviar mensagem" no pedido monta "Pagamento confirmado".
- **Produção:** o mesmo fluxo no Chrome, voltando às variações padrão no final.
