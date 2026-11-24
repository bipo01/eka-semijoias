# Plano — fase 5: conteúdo do site editável, depoimentos e privacidade

> 24/11/2026. Responde a `docs/conteudo/PLANNING_PROMPT.md`. Implementação: `docs/conteudo/IMPLEMENTATION_PROMPT.md`.

## 1. Decisão central: "seções do site", uma entidade nova do catálogo

**Decisão.** O conteúdo vira um tipo novo de alteração do catálogo, `content`. Cada **seção** (página ou lista) é uma entidade, com id fixo de uma lista fechada. A seção segue o mesmo caminho do resto do catálogo:
- change set com `baseVersion` e `Idempotency-Key`;
- conferência de conflito **por seção**;
- gravação junto com o snapshot no mesmo batch protegido pela versão do catálogo;
- aviso ao vivo para todas as páginas abertas.

**Por que não dentro de `settings`:**
- `settings` é uma entidade só, então editar o Sobre num aparelho e o Pix noutro daria conflito.
- Um painel antigo aberto (o zod dele remove chaves desconhecidas) reenviaria `settings` sem os campos novos e os apagaria.

Com `content` separado, um painel antigo nem sabe que a entidade existe e não toca nela.

**Onde fica:**
- **Fonte:** tabela `app_config` (já existe em produção, então não precisa de migração). Chave `site:<seção>` e `data = {"version": <versão do catálogo>, "content": {...}}`. A versão serve para a conferência de conflito.
- **Leitura:** o snapshot público ganha `content: { [seção]: dados }`, só com as seções editadas. `snapshotBody()` passa a incluir `content`, então as escritas de estoque, pedidos e maletas preservam o conteúdo.
- **Restaurar o original:** `op: 'delete'` remove a linha e tira a seção do snapshot, e o site volta ao texto padrão. Conteúdo não usa tombstones.

**Texto padrão.** Mora no código (`src/content/defaults.ts`) e é calculado a partir dos fatos do negócio. Exemplo: a pergunta sobre garantia só existe se houver prazo. O site mostra o padrão até a Érika salvar a seção. O editor sempre abre com o que está valendo (o salvo ou o padrão).

**Tamanho.** Cada campo tem limite. Todo o conteúdo editado cabe em cerca de 60 KB, muito abaixo do teto de 1,9 MB do snapshot.

## 2. Seções e campos

Todos os textos são `string` com `trim`. As listas têm limite de itens, e a ordem dos itens é a ordem da lista.

| Seção (`id`) | Onde aparece | Campos |
|---|---|---|
| `inicio` | Página inicial | chamada `{título ≤ 60, destaque (palavra em itálico) ≤ 30, subtítulo ≤ 140, botão 1 ≤ 30, botão 2 ≤ 30, imagem}`; títulos das seções (categorias, mais amadas, novidades, cuidados, depoimentos, perguntas) ≤ 40; faixa da revenda `{mostrar, título ≤ 60, texto ≤ 200, botão ≤ 30, imagem}`; dicas de cuidado (3 itens `{título ≤ 40, texto ≤ 140}`); faixa do Instagram (até 6 imagens) |
| `depoimentos` | Início | lista ≤ 12 `{id, texto ≤ 400, nome ≤ 40, cidade ≤ 40, visível, autorizado (precisa ser verdadeiro)}`; **padrão: vazia** (a seção some) |
| `perguntas` | Início | lista ≤ 15 `{pergunta ≤ 140, resposta ≤ 600}` |
| `sobre` | /sobre | título ≤ 60, história (parágrafos, ≤ 3000), assinatura ≤ 40, foto opcional, valores (≤ 6 `{título ≤ 40, texto ≤ 200}`) |
| `cuidados` | /como-cuidar, início, página da peça | título ≤ 60, introdução ≤ 300, passos (≤ 12 `{título ≤ 60, texto ≤ 300}`), "por que escurece" `{título ≤ 60, texto ≤ 1200}`, dicas curtas da página da peça (≤ 6, cada ≤ 120) |
| `garantia` | /garantia e página da peça | o que cobre (≤ 10 × 160), o que não cobre (≤ 10 × 160), como acionar (≤ 6 × 200), trocas ≤ 600, texto da página da peça ≤ 300. Prazo e regras continuam nas Configurações. |
| `revendedoras` | /revendedoras e o cartão do menu | topo `{chamada ≤ 40, título ≤ 80, texto ≤ 300, botão ≤ 30, imagem}`; como funciona (≤ 6 `{título, texto}`); vantagens (≤ 6 `{título, texto}`); perguntas (≤ 10); introdução do formulário ≤ 300; texto do cartão do menu ≤ 60 |
| `contato` | /contato | título ≤ 60, introdução ≤ 300, título da mensagem rápida ≤ 60 |
| `geral` | Rodapé, sacola, 404 | frase do rodapé ≤ 120; sacola vazia `{título, texto}`; texto depois do pedido ≤ 300; 404 `{título, texto}` |
| `privacidade` | /privacidade (página nova) | título ≤ 60, introdução ≤ 600, blocos (≤ 20 `{título ≤ 80, texto ≤ 2500}`) |
| `compartilhar` | Google e prévia no WhatsApp/Instagram | título do site ≤ 60, descrição ≤ 160, imagem de compartilhamento |
| `loja` | Fatos do negócio (Configurações) | antialérgicas (sim/não/não informar), envio para todo o Brasil (idem), parcelamento sem juros (0–12, 0 = não mostrar), banho (≤ 120, vazio = não mostrar), consignado (sim/não/não informar), sem investimento inicial (idem) |

**Imagens:**
- Formato `{src, alt}`. `src` é uma raiz de imagem embutida (`images/...`) ou uma foto enviada (`media/<sha256>.<ext>`).
- Envio pelo mesmo pipeline das fotos das peças, com um perfil **largo** (lado maior 1600 px) para banners.
- Conferência de existência no servidor e inclusão no backup (`imageSourcesOf`).

## 3. Fatos do negócio e o que deixa de ser fixo
- `useBusiness()` lê a seção `loja` por cima de `src/config/business.ts`. Antialérgicas, envio, parcelamento, banho, consignado e investimento passam a ser editáveis.
- A lista "O que falta preencher" das Configurações marca esses itens sozinha, e também "Depoimentos" (quando houver ao menos 1 autorizado) e "Sobre" (quando a seção for editada).
- Os textos padrão que fazem afirmações passam a depender dos fatos:
  - "banho de qualidade" só com banho informado;
  - "contra defeitos no banho" vira "contra defeitos de fabricação" quando não há regra escrita;
  - "Envio para todo o Brasil" só com envio = sim.
- Dois textos de WhatsApp escritos no código viram modelos editáveis em **Mensagens**: `garantia` (acionar a garantia) e `procura` ("procurando algo específico?" no catálogo). Os textos da página de pagamento continuam fixos: são transacionais e já estão corretos.

## 4. Painel: aba nova **Site**
- **Lugar:** entre Mensagens e Categorias. A aba lista cartões em três grupos:
  - **Páginas:** Início, Sobre, Como cuidar, Garantia, Revendedoras, Contato, Privacidade;
  - **Listas:** Depoimentos, Perguntas frequentes;
  - **Geral:** Textos gerais, Google e WhatsApp.
- **Cada cartão:** estado ("Texto original" ou "Editado em dd/mm/aaaa, hh:mm"), o botão "Editar" e o link "Ver no site".
- **Editor** (tela cheia, `Sheet` lateral):
  - campos com contador de caracteres;
  - listas com adicionar, editar, apagar (com confirmação) e mover para cima ou para baixo;
  - campo de imagem: enviar foto, escolher entre as fotos das peças ou remover;
  - "Restaurar o texto original" (com confirmação);
  - "Salvar", que só fica ativo com alteração;
  - aviso ao fechar com alteração não salva;
  - erros de validação ao lado do campo, e o salvamento mostra o erro do servidor.
- **Depoimentos** tem editor próprio:
  - prévia do cartão como aparece no site;
  - "A cliente autorizou publicar" é obrigatório;
  - "Mostrar no site" liga e desliga sem apagar.
- **Fatos do negócio:** cartão novo "O que a loja oferece" nas Configurações (grava a seção `loja`).

## 5. Política de privacidade
- **Página `/privacidade`:** título, introdução, blocos e "Atualizada em" (a data do último salvamento da seção ou a data do texto padrão).
- **Texto padrão**, fiel ao sistema:
  1. Quem somos e como falar com a gente (WhatsApp das Configurações).
  2. Dados que coletamos e para quê:
     - pedido: nome, cidade, peças e observação;
     - pré-cadastro de revendedora: nome, WhatsApp, cidade, UF, Instagram, se já revende, como conheceu e consentimento;
     - comprovante de pagamento (arquivo);
     - e-mail para o Pix automático (repassado ao Mercado Pago, não guardado);
     - clientes que a loja cadastra;
     - revendedoras: contrato aceito, data, versão e um resumo cifrado da rede;
     - avisos no celular (só da equipe).
  3. O que fica só no seu aparelho: sacola, favoritos e dados do formulário.
  4. Com quem compartilhamos: Cloudflare (hospedagem, servidores fora do Brasil), WhatsApp/Meta (quando você abre a conversa) e Mercado Pago (Pix automático). Não vendemos dados.
  5. Por quanto tempo guardamos e como apagamos: a pedido, a gente anonimiza ou apaga pedidos, comprovantes, cadastros e fichas.
  6. Seus direitos (LGPD, art. 18) e como pedir pelo WhatsApp.
  7. Segurança: acesso restrito ao painel, conexão cifrada e senhas guardadas só como resumo cifrado.
  8. Cookies: só os necessários para o login do painel; nenhum de propaganda ou rastreamento.
  9. Alterações desta política.
- **Links para `/privacidade`:** rodapé, consentimento do pré-cadastro de revendedora, nota de privacidade da sacola, página de pagamento (perto do envio de comprovante) e primeiro acesso da revendedora.

## 6. Google e prévia no WhatsApp
- **O Worker injeta as meta tags** no `index.html`, em toda rota de página: `<title>`, `description`, `og:*` e `twitter:card`. Usa o `HTMLRewriter` e uma leitura do snapshot.
- **O que cada rota mostra:**
  - **padrão:** a seção `compartilhar`;
  - **`/produto/<slug>`:** nome da peça, "R$ preço · descrição curta" e a primeira foto;
  - **`/catalogo/<categoria>`:** o nome da categoria.
- **Rotas fora:** `/admin`, `/revenda` e `/pagamento` ficam com o padrão fixo, `noindex`.
- **Custo:** 1 leitura D1 por carregamento de página (navegação interna não chega ao Worker). `JSON.parse` do snapshot leva cerca de 0,04 ms com 25 KB e cerca de 0,7 ms com 480 peças.
- **Se o D1 falhar,** a página sai com as tags padrão: o site nunca cai por causa disso.

## 7. Backup e restauração
- O snapshot já inclui `content`, então o backup exportado leva o conteúdo.
- Restaurar um backup:
  - gera os changes de `content` pelo `diffCatalog`;
  - um backup antigo, sem `content`, volta o site ao texto padrão (coerente com "deixar igual ao backup"). A tela de confirmação avisa isso.
- As imagens do conteúdo entram em `imageSourcesOf`, que já embute as fotos enviadas no arquivo.

## 8. Divisão do trabalho
1. **Base, antes de tudo (um responsável):**
   - `src/data/content.ts`: ids, esquemas, limites e tipos;
   - `src/content/defaults.ts`: padrões a partir dos fatos;
   - `schema.ts` (`Catalog.content`);
   - `changes.ts`: kind `content` com diff, aplicação, ordem e esquema;
   - `conflicts.ts`;
   - `integrity.ts` e `imageSourcesOf`;
   - `worker/catalog.ts`: leitura, versões, linhas `site:*`, snapshot e auditoria;
   - envio de fotos do conteúdo em `store/catalog.ts`;
   - hook `useSection(id)`;
   - `useBusiness` com a seção `loja`;
   - testes da base.
2. **Frentes paralelas, depois da base (arquivos disjuntos):**
   - **A, site público:** componentes do início, Sobre, Como cuidar, Garantia, Revendedoras, Contato, rodapé, menu, sacola, 404, página da peça, página `/privacidade` com a rota e os links, e os modelos de mensagem `garantia` e `procura`.
   - **B, painel:** aba Site, editores, campo de imagem, editor de listas, depoimentos, fatos nas Configurações, aviso no Backup.
   - **C, Worker:** injeção de meta tags e limpeza do `index.html`.
3. **Fechamento (um responsável):** E2E, revisão adversarial, Chrome local, publicação, Chrome em produção e limpeza.

## 9. Testes
- **Unitários:**
  - os esquemas aceitam o padrão de cada seção;
  - os limites recusam excesso;
  - `diffCatalog`/`applyChanges` com `content` (upsert, delete, sem mudança);
  - `findConflicts` por seção;
  - `imageSourcesOf` inclui as imagens do conteúdo;
  - os padrões mudam com os fatos;
  - `useBusiness` aplica a seção `loja`.
- **Worker (integração):**
  - salvar uma seção aparece no snapshot;
  - conflito em duas abas na mesma seção, e nenhum conflito em seções diferentes;
  - um save de `settings` (painel antigo) não apaga o conteúdo;
  - uma escrita de estoque preserva o conteúdo;
  - restaurar o original (delete) devolve o padrão;
  - foto inexistente é recusada;
  - seção desconhecida e campo grande demais dão 400;
  - as meta tags de `/produto/<slug>` vêm com nome e foto.
- **E2E:**
  - depoimento adicionado no painel aparece ao vivo noutra aba, e apagá-lo faz a seção sumir;
  - editar o início e restaurar;
  - `/privacidade` acessível e com link no rodapé;
  - fatos (antialérgicas) aparecem e somem;
  - sem estouro horizontal a 360 px no painel e no site.
- **Chrome:** o fluxo completo no local; em produção, editar e restaurar uma seção, conferir e voltar ao estado inicial.
