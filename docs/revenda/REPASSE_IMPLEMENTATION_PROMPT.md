# Prompt de implementação — repasse das revendedoras (opção 1)

Implemente `docs/revenda/REPASSE_PLAN.md` inteiro, na worktree `eka-semijoias-repasse` (branch `feature/repasse-revendedora`). Leia `AGENTS.md` antes.

## Ordem
1. **Regras compartilhadas** (`src/data/revenda.ts`): `settlementSchema.reportedAt` (opcional); `repasseState(settlement)` → `'none' | 'pending' | 'reported' | 'paid'`; `repassePixTxid(kitId)` (letras e números, ≤ 25, prefixo `REP`). Testes primeiro.
2. **Worker:** `pix` no `GET /api/revenda/me`; `POST /api/revenda/settlements/:kitId/report` e `POST /api/admin/kits/:id/report-clear` no laço CAS de `handleKitPaid` (reler, `kitUnchanged`, `nextStamp`, `WRITE_ATTEMPTS`), audit log, `notifyLeads`, aviso no celular só no report; `reported` na lista de revendedoras; rotas em `worker/index.ts`. Integração antes de seguir.
3. **Textos:** grupo opcional `repasse` (cycleNote, title, text, noPix, reported, whatsapp) em `src/data/content.ts`; padrão em `src/content/defaults.ts`; editor em `SectionForms.tsx` (RevendaForm). Garanta que uma seção salva sem o grupo continua válida.
4. **Painel da revendedora:** linha no resumo; `RepasseCard` (QrCode + PixCopyField com `buildPixPayload({ ...pix, amountCents: dueCents, txid })`, "Já fiz o repasse" com estado ocupado e erro visível, WhatsApp com `fillString`); histórico com o estado. Recarrega o `me` depois de avisar.
5. **Painel da Érika:** aviso + "Desfazer aviso" em Acertos; "Repasse avisado" na lista; toast do acerto; coluna no CSV.
6. **Docs:** `PLAN.md` §0, `PERGUNTAS_ERIKA.md` (decisão registrada), `AGENTS.md`.

## Regras
- pt-BR na interface, inglês no código. Nada de sucesso falso: um aviso só aparece como avisado depois que o servidor confirma.
- Sem migração. Sem `dangerouslySetInnerHTML`, `alert/confirm/prompt`. Dinheiro em centavos, `formatBRL`.
- Cobre de ação em cobre (`#8A5A45`), nunca verde do WhatsApp. Folhas/diálogos com `Sheet`.
- Não toque em arquivos fora do escopo; não mexa nas mudanças não commitadas das outras sessões.

## Validação obrigatória
`npm run typecheck`, `npm run lint`, `npm test -- --run`, `npm run test:worker`, `npm run test:integration`, `npm run build`; E2E novo `e2e/reseller-repasse.spec.ts` em `desktop-chromium`, `mobile-chromium` e `mobile-webkit`; olhar no navegador (celular e desktop); iPhone no Simulador (Safari, porta 4180); Android no Emulador (Chrome); Chrome real. Revisão adversarial do diff antes do commit.

## Entrega
Commits só dos arquivos desta tarefa → merge da `main` na branch → `git merge --ff-only` na `main` (aborta se tocar em mudança não commitada de outra sessão) → `git push` → deploy do que está no ar + estes commits, sem aplicar migrações de outras tarefas → conferir os arquivos novos e o fluxo no ar.
