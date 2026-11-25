# Prompt de pensamento e planejamento — repasse das revendedoras (opção 1)

> Escrito em 24/11/2026. A Érika escolheu a **opção 1**: a cliente paga **à revendedora** (Pix dela, dinheiro ou cartão), e a revendedora repassa à ÉKA, no acerto, o vendido menos a comissão. O resultado deste prompt é `docs/revenda/REPASSE_PLAN.md`.

## Papel
Você é, ao mesmo tempo, designer de produto sênior e engenheiro sênior deste repositório (leia `AGENTS.md`). Pense antes de escrever código: o entregável deste passo é um **plano**, não a implementação.

## Contexto verificado no código
- Modelo consignado (`docs/revenda/PLAN.md` §0). Acerto: `settle()` em `src/data/revenda.ts` → `dueCents = vendido − comissão + peças que faltaram`, gravado em `kits.data.settlement` (JSON; `paidAt` opcional).
- A Érika marca "Repasse recebido" em Painel → Revendedoras → Acertos (`POST /api/admin/kits/:id/paid`, `handleKitPaid`, CAS em `updated_at`).
- O painel da revendedora (`src/revenda/RevendaApp.tsx`, `GET /api/revenda/me`) **não mostra** quanto ela deve, para qual Pix pagar, nem se o repasse foi recebido. O histórico só mostra vendido e comissão.
- A chave Pix estática da loja está em `settings.pix` (`{key,name,city}`, pública no snapshot). `buildPixPayload` (`src/lib/pix.ts`), `QrCode` e `PixCopyField` (`src/components/pay/PixCode.tsx`) já existem e funcionam na página de pagamento.
- Os textos do painel são editáveis (seção `revenda` em `src/data/content.ts` + `src/content/defaults.ts`, editor em `src/admin/sections/site/SectionForms.tsx`). Um campo novo precisa ser **opcional** no schema (`withBuiltIn` completa), senão uma seção salva antes quebraria e cairia inteira no texto padrão.
- Outras sessões estão alterando, sem commit, `src/data/content.ts`, `src/content/defaults.ts` e `SectionForms.tsx` na pasta principal. Trabalhe na worktree `eka-semijoias-repasse` (branch `feature/repasse-revendedora`) e só integre na `main` quando não houver sobreposição com mudanças não commitadas.

## Perguntas que o plano precisa responder
1. **Durante o ciclo:** como a revendedora entende que o dinheiro que recebeu não é todo dela? (quanto é comissão, quanto vai para a ÉKA)
2. **Depois do acerto:** onde ela vê o valor do repasse, o Pix da ÉKA (QR + copia e cola **com o valor**), o prazo, e como avisa que pagou?
3. **Comprovante:** subir arquivo (novo armazenamento, LGPD) ou mandar pelo WhatsApp da loja com a mensagem pronta? Justifique.
4. **Lado da Érika:** como ela fica sabendo que a revendedora disse que pagou (painel, aviso no celular, lista de revendedoras) e como corrige um aviso indevido?
5. **Estados e transições** de um acerto: sem repasse (0), pendente, avisado, recebido; desmarcar recebido; desfazer aviso. Quem pode fazer o quê, idempotência, corrida entre os dois lados (CAS).
6. **Sem chave Pix cadastrada** ou com Pix automático (Mercado Pago) ligado sem chave estática: o que ela vê?
7. **Dados:** é preciso migração de banco? (preferir JSON no `kits.data`, sem migração.) Compatibilidade com acertos antigos.
8. **Segurança:** a revendedora só age nos acertos dela; nada de dados de outras; limites de corpo; erros em pt-BR; nunca sucesso falso.
9. **Textos:** quais são editáveis, quais são fixos (valores, datas), e o tom (marca fala como "a gente/a ÉKA", nada de "demonstração").
10. **Testes:** unidade (regras), integração (API real em `wrangler dev`), componente (painel), E2E Playwright (Chromium e WebKit), iPhone (Simulador do Xcode, Safari), Android (Emulador, Chrome), Chrome real (Claude in Chrome). Quais cenários em cada um.
11. **Entrega:** commits só dos arquivos desta tarefa, merge na `main` sem conflito, push, deploy só do que está pronto (a migração `0010` de outra sessão ainda não foi aplicada em produção), conferência no ar.

## Saída esperada
`docs/revenda/REPASSE_PLAN.md` com: decisões (com o porquê), estados, API, dados, telas (texto final em pt-BR), arquivos a mudar, riscos, critérios de aceite verificáveis e o plano de testes por plataforma. Depois, `docs/revenda/REPASSE_IMPLEMENTATION_PROMPT.md`.
