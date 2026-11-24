# Prompt de implementação — fase 5: conteúdo editável, depoimentos e privacidade

> 24/11/2026, para o Claude (Opus 5.5) e os agentes que ele coordena. Plano: `docs/conteudo/PLAN.md` (leia inteiro antes). Regras do projeto: `AGENTS.md`.

## Objetivo
A Érika ajusta pelo painel tudo o que a visitante lê no site, sem programador. O resultado tem de ser:
- exato: nenhum texto salvo pela metade, nenhum conteúdo apagado por outro aparelho ou por um painel antigo;
- seguro: o servidor valida tudo e só aceita imagens que existem;
- bonito no celular.

## Ordem de execução
1. **Base** (§8.1 do plano), com testes unitários e de worker passando, antes de qualquer frente.
2. **Frentes A, B e C em paralelo**, cada uma só nos próprios arquivos. Contratos que não mudam sem o coordenador: `src/data/content.ts`, `src/content/defaults.ts` e `src/hooks/useSection.ts`.
3. **Integração:** `npm run typecheck`, `npm run lint`, `npm test -- --run`, `npm run test:worker`, `npm run test:integration`, `npm run build` e `npm run e2e`, tudo verde.
4. **Revisão adversarial** independente do diff, com correção dos achados confirmados.
5. **Chrome local** (Claude in Chrome sobre `wrangler dev`): cada editor do painel, ao vivo noutra aba, a 360 px e no desktop.
6. **Publicação:** `npm run deploy` (sem migração).
7. **Chrome em produção:**
   - editar e restaurar uma seção;
   - ver a prévia do `/produto/...` no HTML;
   - deixar o site exatamente como estava (seções de teste restauradas ao original).

## Regras de implementação
- **Esquemas:** zod com limites em todo campo e `trim`. As listas têm `max` e os ids de item são estáveis (gerados no navegador), para a ordem e o React.
- **Validação dupla:** o servidor valida cada seção com o esquema do seu id (`superRefine` no change set) e recusa id desconhecido com 400. O navegador valida antes, para dar resposta na hora.
- **Imagens:**
  - `src` é uma raiz embutida (`images/...`), uma foto enviada (`media/<sha256>.<ext>`) ou uma data URL só no navegador, antes do envio;
  - o servidor recusa data URL e confere a existência das fotos enviadas;
  - banners usam o perfil largo (1600 px), as demais imagens o perfil normal.
- **Texto do site:** os padrões não podem ter palavras proibidas pelo `e2e/public.spec.ts`, nem afirmar fatos não confirmados (§3 do plano).
- **Painel:**
  - nada parece salvo antes do servidor confirmar;
  - conflito mostra a mensagem do servidor e mantém o que ela digitou;
  - "Restaurar o original" e "Apagar" pedem confirmação;
  - fechar com alteração pendente pergunta antes;
  - os controles têm nome acessível, e a área de toque tem no mínimo 44 px.
- **Site:**
  - seção sem itens não deixa título solto (depoimentos vazios = seção some);
  - textos longos quebram linha (`[overflow-wrap:anywhere]` em blocos livres);
  - parágrafos respeitam as quebras de linha da Érika.
- **Worker de meta tags:**
  - escapar tudo o que vem do conteúdo;
  - falha de leitura cai nas tags padrão;
  - não tocar em `/admin`, `/revenda` e `/pagamento` (`noindex` neles);
  - `og:image` com URL absoluta.
- **Sem regressão:**
  - pedidos, estoque, maletas e mensagens seguem como estão;
  - `snapshotBody()` preserva `content`;
  - um save de `settings` não toca no conteúdo.
- **Documentação:** atualizar `AGENTS.md` (estrutura, fluxo do conteúdo, aba Site, privacidade, meta tags), `docs/pendencias.md` e `docs/PERGUNTAS_ERIKA.md` (o que agora ela mesma preenche).
- **Commits** em inglês, com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Pronto quando
- Todas as linhas da tabela do §2 do plano estão editáveis no painel e aparecem no site ao vivo.
- Os depoimentos de exemplo sumiram, e a Érika adiciona, edita, oculta e apaga os reais.
- `/privacidade` existe, com link em todos os pontos do §5.
- A prévia no WhatsApp de uma peça mostra foto, nome e preço.
- Todos os testes passaram, a revisão adversarial foi tratada, o Chrome local e o de produção foram verificados, e a produção ficou limpa.
