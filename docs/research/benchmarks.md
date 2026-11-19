# Benchmarks de UX/UI: e-commerce de joias premium, para ÉKA

Pesquisa feita em 2026-11-19, durante a Black Friday. Por isso há mais promoções na tela do que o normal; ignore o volume de banners de desconto.

**Método.** O WebFetch falhou em Monte Carlo (404) e Pandora (403). Por isso, quase tudo abaixo foi **observado ao vivo no Chrome** (Claude in Chrome), com a janela no menor tamanho possível, **viewport CSS de ~606 px de largura**, que já mostra o layout mobile, mas não exatamente um celular de 360–390 px. Também foram lidos via JS a estrutura de headings, as fontes computadas e os campos de formulário. Itens marcados *(inferido)* vieram de fontes secundárias ou da marcação do HTML, não da tela.

Tags: **ADOPT** = copiar o padrão · **ADAPT** = usar numa versão mais leve/adaptada para uma marca pequena que vende pelo WhatsApp · **AVOID** = não fazer.

---

## 1. Vivara (vivara.com.br): joalheria premium BR

Observado ao vivo: home, listagem de brincos e página de produto (PDP), em largura mobile.

- **Home, ordem das seções:** barra de frete grátis com valor mínimo → header (hambúrguer, logo centralizado, busca, favoritos, sacola) → hero com foto lifestyle de modelo (externa, luz natural, mãos e pulsos com joias) → "Navegue por categoria" (carrossel de tiles still-life em fundo branco) → vitrine de produtos da campanha → relógios → coleções → bloco de vantagens → localizador de lojas → redes sociais → newsletter. **ADOPT** a ordem hero → categorias → vitrine → vantagens.
- **Modal de CEP logo na entrada** ("encontre o melhor perto de você"), aparecendo antes de qualquer conteúdo. **AVOID**: para quem chega pelo Instagram ou WhatsApp, é atrito puro.
- **Taxonomia:** só por tipo de peça (Anéis e Alianças, Brincos, Colares, Pingentes, Pulseiras, Relógios). Na listagem há um carrossel de **subtipos com imagem** (no caso de brincos: Studs e Solitários / Argolas / Longos e Pendentes). **ADOPT**: tipo primeiro, subtipo em chips com imagem.
- **Tipografia:** display em serifa (Cormorant Garamond 700, caixa-alta, tracking ~1.6px) e corpo em sans (Roboto). Nos acordeões e botões, rótulos em caixa-alta com tracking largo. Accent em pêssego/rosé claro, usado com parcimônia: badge "LANÇAMENTO", contador da sacola, botão OK. **ADOPT**: a combinação serifa display + sans corpo combina com o logo rose-gold da ÉKA.
- **Card de produto:** imagem ~4:5, levemente retrato, still-life num cinza muito claro; badge pequeno no canto superior direito com fundo rosé; nome em sans; preço simples. Na listagem, a parcela não aparece no card. **ADAPT**: para o ticket da ÉKA, mostrar a parcela no card (ver Monte Carlo/Rommanel).
- **Filtros no mobile:** botão redondo flutuante de filtro + pílula de ordenação ("Lançamentos"). O filtro abre um **drawer em tela cheia** com acordeões (Material, Pedras, Tipo de produto, Público, Coleção, Faixa de preço) e botão fixo "Aplicar filtro". **ADAPT**: com catálogo pequeno, basta Tipo + Cor do banho + Faixa de preço.
- **PDP:** galeria grande com numeração de imagens; selo "Coleção X" acima do título; preço + "8x sem juros de R$ …"; bônus de giftback; CTA preto em largura total; **acordeões**: Detalhes / Sobre a coleção / Composição / Certificação e garantias / Troca e devolução; simulador de frete por CEP; depois, um bloco "Está com dúvida? Fale com nossas especialistas no WhatsApp" com botão para uma personal shopper; e "Complete o look" (cross-sell). **ADOPT** os acordeões e o bloco de WhatsApp *contextual* dentro da PDP.
- **Barra fixa no rodapé da PDP no mobile** (preço + "Adicionar à sacola"), que aparece quando o CTA original sai da tela. **ADOPT**: na ÉKA, essa barra vira "Pedir pelo WhatsApp".
- **"A Experiência Vivara"**: faixa de vantagens com ícone + título + uma linha (consultoria digital, pagar com ouro, entrega rápida, giftback). **ADOPT** o formato com 3–4 itens.
- Na hora do pedido, o banner de cookies (AdOpt) se sobrepôs aos produtos e ao drawer de filtros. **AVOID** banners que bloqueiam conteúdo.

## 2. Monte Carlo (montecarlo.com.br): joalheria BR

O WebFetch devolveu 404. Observado ao vivo no Chrome: home em desktop; listagem de anéis e PDP em largura mobile.

- **Home:** topbar com cupom rotativo (setas) → header (lojas/ajuda à esquerda, logo no centro, busca/conta/sacola à direita) → menu (Black Friday, Joias, Jolie, Casamento, Relógios, Masculino, Presentes, Acessórios) → hero em carrossel com modelo e still-life → **faixa de confiança logo abaixo do hero** (frete grátis, parcele em 10x sem juros, bônus, 5% OFF no Pix, desconto com código de vendedor) → "Navegue por categorias" (6 tiles quadrados: Anéis, Brincos, Colares, Pulseiras, Pingentes, Correntes) → tiles por faixa de desconto → vitrine com setas + botão "ver todos" → editorial "Destaques" com 3 cards de foto grande + título + subtítulo (por **ocasião/significado**: infantis, clássicos atemporais, joias com significado) → vitrine de brincos → banner de relógios → lojas → newsletter. **ADOPT** a faixa de confiança imediatamente abaixo do hero.
- **Fotografia:** still-life em **fundo preto**, com luz dura e reflexo especular, para categorias e banners; nos cards, still-life em cinza claro. O dourado salta no preto. **ADAPT**: o preto é dramático demais para semijoia acessível; vale como um único bloco editorial de contraste.
- **Tipografia:** Inter em tudo (sans, títulos em bold); accent **amarelo-mostarda** nos botões "ver todos" e no cupom. **AVOID** CTA amarelo saturado: briga com dourado e rose-gold.
- **Card de produto:** imagem quadrada com **indicador de pontos** (várias fotos, deslizáveis) e **mini-swatches de metal** (prata/dourado) no canto da imagem; badge escuro "Black Friday" à esquerda e "% OFF" em vermelho à direita; nome longo com metal e pedra ("… em Prata 925 com Banho de Ouro 18K …"); preço em negrito, preço antigo riscado; linha "Nx de R$ … sem juros". **ADOPT** a parcela e o material no nome; **ADAPT** swatches para "dourado / ródio / rosé" quando a peça existir em mais de um banho.
- **Listagem mobile:** banner → título "Encontre o anel ideal" com **carrossel de estilos com foto** (Alianças e solitários, Maxi e bold, Cocktail, Sem pedras) → breadcrumb → contador ("Exibindo 24 de 868") → **dois botões lado a lado, "Filtros (n)" e "Ordenar"** → chips de filtros ativos + "Limpar filtros" → grid de 2 colunas → "Mostrar mais" (sem paginação) → bloco de texto SEO no fim. Drawer de filtros: Categoria, Subcategoria, Material, Aro, Gênero, Pedra, Cor, Marca, Faixa de preço, com botão "Filtrar (868)" que mostra a contagem ao vivo. **ADOPT** botões Filtros/Ordenar lado a lado + chips ativos + contagem no botão de aplicar.
- **PDP:** breadcrumb → selo da coleção (link) → título → referência → preço antigo riscado, preço atual e "em 5x R$ 90" → cashback → seletores **Material** (swatch de metal), **Pedras** (swatch de cor), **Tamanho** (dropdown) com link "Como medir seu anel" → "Adicionar à sacola" → cálculo de frete por CEP com "Não sei meu CEP" → **bloco de vantagens com ícones de linha em losango** (bônus, código do vendedor, primeira compra, Pix, troca fácil) → "Descrição" com specs em pares rótulo:valor (Coleção, Metal, Pedra, Altura mm, Largura mm). **ADOPT** a spec em lista rótulo:valor com medidas em mm e o link para guia de medidas ao lado do seletor de tamanho.
- **Na largura testada (606 px), não apareceu barra fixa de compra na PDP.** O botão "Ajuda" (chat) é uma aba vertical fixa na lateral direita. **AVOID** deixar o CTA principal sumir no scroll.
- **"Código do vendedor"**: desconto + frete grátis quando o cliente informa o código de um vendedor. Isso aparece na faixa de confiança, na PDP e no rodapé. **ADAPT, alto valor para a ÉKA**: um código ou link da revendedora (`?rev=ana`) que credita a venda a ela e dá um mimo ao cliente.
- **Rodapé:** institucional / serviços (embalagem para presente, gravação, certificado de garantia, retirada) / conta / atendimento + localizador de lojas + selos de segurança e pagamento + CNPJ e endereço. **ADOPT** o CNPJ visível como sinal de confiança.

## 3. Pandora BR (br.pandora.net)

O WebFetch devolveu 403. Observado ao vivo no Chrome: home, listagem de brincos e PDP, em largura mobile. Os cookies foram rejeitados.

- **Home:** hero com gradiente escuro + título curto em caixa-alta + CTA retangular branco largo → **categorias com preço-âncora: "Anéis a partir de R$114", "Brincos a partir de R$69" etc.** → "Joias a partir de R$ 69,50" → **presentes por destinatário ou ocasião** (família e amigos, amor pelos pets, para dizer sim, amigo secreto, Natal) → newsletter. **ADOPT** o "a partir de R$" nas categorias e a curadoria de presentes por ocasião.
- **Tipografia:** Gotham em caixa-alta para títulos (500) e até para o corpo (300). Quase tudo é preto e branco; o rosé/pink aparece só na faixa de campanha e o vermelho só no preço promocional. **ADOPT** a disciplina de cor: neutros com um único accent.
- **Card na listagem:** imagem still-life em fundo cinza-claro → **pontos de swatch de metal** (prata/rosé/dourado) → nome → **linha do metal ("Prata") em destaque** → preço promocional em vermelho + preço riscado + "(-30%)". **ADOPT** a linha de banho/metal logo abaixo do nome.
- **Filtros:** botão "Filtrar" → drawer com Departamento, Metal, Preços, Linha, Cor, Tamanho, Temas, mais Aplicar e Limpar; atalhos de departamento em chips no topo. **ADOPT** chips de categoria no topo da listagem.
- **Popup de login ("faça login para ter a melhor experiência") abrindo sozinho por cima da listagem.** **AVOID.**
- **PDP:** a primeira imagem é um **close extremo da peça no corpo** (orelha, tela cheia, sem margem); breadcrumb mínimo; **barra fixa escura no rodapé com preço + "Adicionar ao carrinho"** desde o primeiro scroll; prazo de entrega (padrão/expressa); linhas curtas de confiança: parcelamento em 10x sem juros, frete grátis acima de um valor, devolução gratuita, **garantia de 1 ano**. Cada metal é um produto/URL separado. **ADOPT** a primeira foto no corpo + barra fixa; **ADAPT** a variante de banho como seletor dentro da mesma página, que é mais simples para um catálogo pequeno.
- Havia um erro tipográfico visível ("Economize 30%%") e um "BLAK FRIDAY" na topbar. **AVOID**: revisar o texto; numa marca pequena, isso pesa mais.
- Não vi WhatsApp em nenhuma página da Pandora BR (0 links `wa.me`).

## 4. Mejuri (mejuri.com): DTC editorial

Observado ao vivo na loja internacional (`/world/en`, não existe loja BR): home, best sellers e PDP, em largura mobile. Antes, a home foi lida via WebFetch.

- **Home:** topbar de utilidade (limpeza de joias grátis nas lojas / login) → hero de **macro still-life em fundo escuro** (correntes cruzando o quadro, recorte ousado, sem texto por cima no mobile) → tiles grandes de categoria/material com **rótulo sublinhado em caixa-alta** (Solid Gold, Sterling Silver, Diamonds, Personalized, Best Sellers) num carrossel em que **o próximo tile aparece cortado na borda** → faixas de promoção empilhadas → bloco editorial curto da marca → cards de serviços (lojas, estúdio de piercing, eventos) → sustentabilidade → rodapé com garantia, trocas, materiais e cuidados. **ADOPT** o carrossel com o próximo tile cortado e o bloco editorial curto.
- **Taxonomia:** tipo + **material como eixo de primeiro nível** (ouro maciço / prata / vermeil) + presentes + best sellers + faixa de preço como coleção ("acima de X"). **ADAPT**: para a ÉKA, "Dourado / Prateado (ródio) / Rosé" funciona como atalho, já que a cor do banho é a primeira escolha do cliente.
- **Tipografia:** uma grotesca única (Syndicat Grotesk) em caixa-alta, com uma fonte mono em eyebrows e mensagens. Fica fria e de moda. **AVOID** para a ÉKA: o logo rose-gold pede mais calor (serifa ou sans humanista).
- **Listagem:** subcoleções em abas de texto rolável (melhores brincos, anéis…) → **chips de filtro rápido roláveis na horizontal** (20% OFF, Category, Material) + "Filter + Sort" à direita → cards com **tag de merchandising** em cinza no canto ("Stacking staple"), **coração de favoritos** e **"+" de adição rápida** sobre a imagem; abaixo, nome em caixa-alta, preço e linha de material. **ADOPT** a tag de merchandising suave ("Mais vendido", "Para presentear") e os chips de filtro rápido.
- **PDP:** imagem still-life em tela cheia, com indicador "sold out 9x" (prova social de escassez) → **faixa de confiança com 3 ícones logo abaixo da galeria (garantia de 2 anos, trocas grátis, frete grátis)** → título + **nota 4,9 com estrela** ao lado → preço → rótulo do material + **swatches quadrados de metal** → "Browse other styles" → "Add to bag" preto + botão de favoritos quadrado → "Style with" (cross-sell) → **Materiais e especificações**: hipoalergênico, **camada de ouro 18k de 2,5 mícrons**, prata reciclada, explicados sem jargão. Barra fixa de compra no mobile. **ADOPT** a faixa de confiança sob a galeria e a especificação do banho em mícrons + hipoalergênico, escrita em linguagem simples.
- Até o 404 de categoria tem uma saída útil ("shop by category" com tiles). **ADOPT** um 404 que leve a categorias e ao WhatsApp.
- Preço exclusivo para membros e "faça login para ver o desconto". **AVOID**: não se aplica a uma venda pelo WhatsApp.

## 5. Rommanel (rommanel.com.br): semijoias, vende por revendedoras

Observado ao vivo: home, listagem de brincos, PDP e a landing de revenda (revenda.rommanel.com.br), em largura mobile.

- **Header:** topbar roxa com **"Quero Revender" (dropdown) acima de tudo** → hambúrguer, logo, favoritos, busca e sacola → campo de busca em largura total com **"Termos mais buscados" numerados**. No rodapé há links separados para portal da consultora, site de revenda e academia de treinamento. **ADOPT**: o "Seja revendedora" sempre visível, uma faixa fina no topo ou um item fixo no menu.
- **Modal de CEP sem botão de fechar, em todas as páginas, que não fecha com Esc, empilhado com o banner de cookies.** **AVOID, com força.**
- **Home:** coleção de celebridade como hero → vitrine de 4 cards → banners de sub-marca e categoria → vitrine de berloques → banners temáticos → vitrine de coleção → newsletter → rodapé com selos (SSL, reviews, reciclagem). Fonte Open Sans em tudo; accent roxo/lilás. **AVOID** fonte genérica única; a hierarquia some.
- **Card:** imagem quadrada (há uma segunda tag de imagem no HTML, provavelmente para hover *(inferido)*); linha da coleção acima do título; título às vezes em CAIXA-ALTA e às vezes não (inconsistente); preço + "**Em até 10x R$ 14,90 sem juros**", mesmo em peça de R$149; botão "Comprar" em todo card; produto esgotado mostra "Avise-me". Opção de grid com 1 ou 2 colunas. **ADOPT** a parcela e "Avise-me" (que na ÉKA pode ser "Me avise pelo WhatsApp"); **AVOID** a caixa-alta inconsistente.
- **Faixa de preço próxima à da ÉKA:** brincos de ~R$105 a ~R$234 nas peças observadas. É a referência mais direta de preço e ticket.
- **Filtros:** Departamento, Categoria, **Alfabeto (Letra A…Z, para iniciais)**, Coleção, esta com dezenas de coleções antigas ("Lançamentos Catálogo 2019"…). **AVOID** facetas de coleções vencidas. **ADAPT** "Iniciais" como subcategoria, se a ÉKA tiver letras.
- **PDP:** título → código → preço + "ou 10x de R$ 14,90" + "Mais formas de pagamento" → Descrição curta → **Especificações** (medidas em cm/mm, tamanho da pérola) → **"Benefícios"**: entrega rápida, **todas as joias hipoalergênicas**, garantia contra defeito → "Você pode se interessar" / "Quem viu, viu também". Nenhuma espessura em mícrons apareceu na PDP. WhatsApp em **botão flutuante verde** + pílula "Ajuda". **ADOPT** a lista curta de benefícios na PDP; **ADAPT** acrescentando o que a Rommanel não mostra (mícrons e prazo da garantia).
- **Landing de revenda:** hero com mulher sorrindo segurando uma **maleta-mostruário aberta** + promessa de renda/liberdade financeira → **formulário logo abaixo, na primeira dobra**: Nome, Data de nascimento, **CPF**, E-mail, Celular, CEP, "Melhor forma de contato", **Senha** + aceite de termos + opt-in de marketing (opcional) → "Vantagens exclusivas" em acordeões com ícone (Lucro, Credibilidade, Ferramentas, Reconhecimento) → "Propostas únicas" (**imagem quebrada**, só aparecia o alt "Ações") → vídeo da marca no YouTube → CTA repetido → **"Como se tornar revendedora" em 3 passos numerados com ícones** (pré-cadastro → confirmação por e-mail → primeiro pedido com a loja distribuidora) → **FAQ** (requisitos, "é consignado?", margem de lucro, como adquirir as peças, treinamento, como manter a conta ativa, canais). **ADOPT** a estrutura hero com maleta → 3 passos → vantagens → FAQ com as dúvidas reais (consignado? margem? preciso investir?). **ADAPT** o formulário: 8 campos com CPF e senha é pesado para um primeiro contato; a ÉKA deve pedir nome, WhatsApp e cidade, e o resto na conversa. As respostas do FAQ não renderizaram (carregamento tardio), por isso não registrei a margem nem as condições de consignação.
- *(Fonte secundária: anúncios de marketplace, não o site oficial)* A garantia da Rommanel aparece como 1 ano contra defeito de fabricação. Não achei espessura em mícrons publicada.

## 5b. Francisca Joias (franciscajoias.com.br): semijoias, contraponto DTC

Observado ao vivo: home, listagem de anéis, PDP e a página de garantia.

- **Home:** hero com modelo + nome da coleção em serifa grande sobre a foto + CTA verde → **faixa de confiança com 4 itens** (frete grátis acima de R$299, 5% OFF no Pix, até 6x sem juros, envio para todo o Brasil) → **"Compre por categorias" com preço-âncora em cada tile ("Anéis a partir de R$129,90", "Brincos a partir de R$9,90")** → família de anéis → subcategorias → mais vendidos → **presentes** → novidades → **"Junte-se à Francisca: seja nossa afiliada"** → rodapé. **ADOPT** a ordem hero → faixa de confiança → categorias com "a partir de" → mais vendidos → presentes → bloco de recrutamento antes do rodapé.
- **Fontes:** display sans geométrica (Gravesend) + corpo em Poppins; botões verdes. Logo FRANCISCA em caixa-alta espaçada.
- **Card:** grid de 2 colunas alternando still-life (fundo cinza-claro) e foto em modelo; badge "30% OFF" preto pequeno; **preço do Pix como preço principal ("R$ 179,35 no pix")**, com o preço cheio riscado acima e a parcela abaixo. **ADOPT**: preço Pix em destaque é muito brasileiro e converte; na ÉKA pode ser "R$ X no Pix · ou 3x de R$ Y".
- **Filtros:** botão "Filtrar" preto + select de ordenação. A lista de categorias do filtro mistura campanhas e lives antigas ("Live 15-10", "10.10", "4 por 199,90"). **AVOID**: tags de campanha não podem vazar para a taxonomia.
- **PDP:** título → REF → descrição curta → preço Pix + parcela → cashback → "Adicionar ao carrinho" → **"Envio imediato"** → cálculo de frete → descrição longa. **Barra fixa de compra rápida no mobile** + **botão flutuante de WhatsApp** (FAB). **ADOPT** o selo "Envio imediato / pronta entrega".
- **Página de garantia:** **lista clara do que está coberto** (defeito de fabricação, desprendimento do folheado, fecho que quebra) **e do que não está** (escurecimento por sujeira, arranhões, peça amassada, mau uso…), prazo de **6 meses** com certificado, e peça em promoção sem troca. **ADOPT** o formato "coberto / não coberto": é honesto e reduz atrito no WhatsApp.

---

## Padrões a adotar na ÉKA (por prioridade, pensados para mobile)

1. **Barra fixa no rodapé da PDP**: preço (Pix) + botão "Pedir pelo WhatsApp", com mensagem pré-preenchida (nome da peça, banho, tamanho, link). Vivara, Pandora, Francisca e Mejuri têm a barra fixa; Monte Carlo não.
2. **WhatsApp contextual, não só o FAB**: um bloco "Ficou em dúvida? Fale com a gente" logo abaixo do CTA na PDP (Vivara) + FAB discreto, que não pode cobrir a barra fixa.
3. **Faixa de confiança logo após o hero** (3–4 itens com ícone de linha: garantia X meses · banho 18k com N mícrons · hipoalergênico/sem níquel · envio para todo o Brasil ou desconto no Pix). Monte Carlo e Francisca.
4. **Repetir essa faixa logo abaixo da galeria na PDP**, em versão curta de 3 ícones (Mejuri).
5. **Card de produto:** imagem 4:5 em fundo neutro claro e quente; nome + **linha do banho** ("Banho ouro 18k"); **preço Pix em destaque + "ou 3x de R$ …"**; no máximo uma tag suave ("Mais vendido" / "Novo"); coração opcional.
6. **Categorias por tipo com "a partir de R$"** (Anéis, Brincos, Colares, Pulseiras, Conjuntos), em carrossel com o próximo tile cortado na borda (Pandora, Francisca, Mejuri).
7. **Atalho por cor do banho** (Dourado / Prateado / Rosé) como chips no topo da listagem e swatches no card e na PDP.
8. **Listagem:** chips de categoria/banho roláveis na horizontal + botões "Filtrar" e "Ordenar" lado a lado; drawer simples (tipo, banho, preço) com contagem no botão de aplicar; chips de filtros ativos com "Limpar".
9. **Especificação da PDP em acordeões:** Detalhes (rótulo:valor, com medidas em mm) · Banho e materiais (mícrons, base, hipoalergênico, escrito em linguagem simples) · Cuidados · Garantia e trocas.
10. **Página de garantia "coberto / não coberto"** com prazo explícito (Francisca), com link a partir de toda PDP.
11. **Presentes por ocasião ou destinatário** (Natal, amigo secreto, mãe, madrinhas) como seção da home e entrada no menu (Pandora).
12. **"Seja revendedora" sempre visível** (item no menu + faixa fina no topo ou bloco antes do rodapé), como fazem Rommanel e Francisca.
13. **Landing de revenda:** hero com a maleta/mostruário aberta → 3 passos numerados → benefícios em cards → FAQ honesto (consignado? investimento inicial? margem? reposição?) → **formulário curto (nome, WhatsApp, cidade/UF e "já revende?")** que abre o WhatsApp; nada de CPF ou senha no primeiro contato.
14. **Link ou código da revendedora** (`?rev=nome`) que leva a mensagem do WhatsApp com a atribuição da venda, inspirado no "código do vendedor" da Monte Carlo.
15. **Tipografia:** serifa de display (alto contraste, caixa-alta com tracking, ao estilo Vivara) + sans humanista no corpo; **um só accent rose-gold/cobre**, usado em CTA secundário, tags e detalhes; CTA principal escuro (quase-preto quente) ou verde WhatsApp apenas no botão de pedido.
16. **Fotografia:** still-life em fundo neutro quente (bege ou cinza-claro) para cards; **segunda imagem sempre na pele** (orelha, pescoço, mão), como na primeira foto da PDP da Pandora; um ou dois close-ups macro editoriais na home (Mejuri); evitar fundo preto em massa.
17. **Selo "Pronta entrega / envio imediato"** e "Me avise quando voltar" via WhatsApp para peças esgotadas (Francisca, Rommanel).
18. **Cross-sell "Complete o look"** na PDP (conjunto brinco + colar), que também aumenta o ticket do pedido pelo WhatsApp (Vivara, Mejuri).
19. **Nada de interstício na entrada:** sem modal de CEP, login ou newsletter por cima do conteúdo; cookies num banner fino e recusável (Rommanel, Vivara e Pandora mostram o custo disso).
20. **Revisar o texto e o estado das imagens antes de publicar** (erros vistos: Pandora com "30%%" e "BLAK FRIDAY", Rommanel com imagem quebrada na landing de revenda).

---

## O que não consegui verificar

- **Largura real de celular:** o Chrome não reduziu abaixo de ~606 px de viewport CSS. Os layouts "mobile" foram vistos nessa largura; em 360–390 px pode haver diferenças, como grid de 2 em vez de 3 colunas na Pandora, ou a barra fixa da Monte Carlo aparecer só em larguras menores.
- **Carrinho e checkout:** não adicionei nada à sacola em nenhum site, então não há observação de etapas de checkout, upsell no carrinho ou selos de pagamento no checkout. Os selos de segurança e pagamento foram vistos só nos rodapés (Monte Carlo, Rommanel).
- **Zoom da galeria e segunda imagem no hover:** não testei pinça ou zoom nem o hover no desktop. O hover da Rommanel é *inferido* da segunda tag de imagem no HTML.
- **Avaliações:** só a Mejuri mostrou nota na PDP. Não vi reviews na Vivara, na Monte Carlo, na Pandora BR, na Rommanel nem na Francisca nas PDPs abertas (podem estar mais abaixo ou depender do produto).
- **Rommanel:** as respostas do FAQ de revenda não renderizaram (margem e condições de consignação não registradas); garantia e camadas de ouro só via anúncios de marketplace, não pelo site oficial; o modal de CEP sem fechar bloqueou capturas da listagem.
- **Mejuri:** vista a loja internacional (`/world/en`), não existe loja BR; não há parcelamento nem Pix.
- **Pandora:** vista em br.pandora.net pelo Chrome (o WebFetch levou 403); não abri as páginas de garantia nem de materiais.
- **Monte Carlo:** o WebFetch levou 404 em todas as URLs; tudo veio do Chrome. A home foi vista em desktop; listagem e PDP em mobile.
- **Morana:** não pesquisada (Rommanel e Francisca carregaram).
- Tudo foi observado em 19/11/2026, em plena Black Friday: hero, badges e cores de campanha não representam o visual de linha de nenhuma das marcas.
