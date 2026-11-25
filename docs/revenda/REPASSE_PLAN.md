# Plano — repasse das revendedoras (opção 1)

> 24/11/2026. Decisão da Érika: **a cliente paga à revendedora**; no acerto, a revendedora repassa à ÉKA o vendido menos a comissão (mais as peças que faltaram). Prompt de origem: `REPASSE_PLANNING_PROMPT.md`.

## 1. Decisões (e o porquê)
| # | Decisão | Por quê |
|---|---|---|
| D1 | O dinheiro da venda continua com a revendedora; nada muda no registro da venda. | É o que a Érika escolheu e o que o sistema já faz. |
| D2 | Durante o ciclo, o resumo do painel mostra **"Para a ÉKA no acerto"** (vendido − comissão) e uma frase explicando a divisão. | Ela recebe o dinheiro inteiro; sem isso, parece que é todo dela. |
| D3 | Depois do acerto, um cartão **"Repasse do acerto"** no topo do painel, enquanto não for recebido: valor, data do acerto, Pix da ÉKA (**QR + copia e cola com o valor e a referência**), botão **"Já fiz o repasse"** e **"Enviar comprovante no WhatsApp"**. | O valor exato no código evita erro de digitação; o cartão fica onde ela olha primeiro. |
| D4 | Comprovante **pelo WhatsApp da loja**, com mensagem pronta; nada de upload. | A Érika já confere tudo no WhatsApp; upload criaria armazenamento novo de dado financeiro (LGPD, limites do D1) sem ganho real. |
| D5 | "Já fiz o repasse" grava `settlement.reportedAt` e avisa a Érika (aviso no celular + painel ao vivo). A Érika continua sendo quem confirma ("Repasse recebido"). | O aviso da revendedora não é prova; quem confirma é quem recebe. |
| D6 | A Érika pode **desfazer o aviso** (quando o dinheiro não chegou). Desmarcar "recebido" volta ao estado anterior (avisado ou pendente). | Corrige um toque por engano dos dois lados, sem apagar histórico. |
| D7 | **Sem migração**: o estado vive no JSON do acerto (`kits.data`). Acertos antigos continuam válidos (`reportedAt` opcional). | Deploy sem tocar no banco de produção. |
| D8 | Sem chave Pix estática cadastrada (ou só Pix automático): o cartão mostra "Combine o repasse com a ÉKA" + WhatsApp; o botão "Já fiz o repasse" continua (ela pode pagar em mãos). | Nunca um código Pix inválido ou vazio. |
| D9 | Textos novos editáveis num grupo **opcional** `repasse` da seção `revenda`; valores, datas e botões são fixos. | Mesmo padrão do resto do painel; seção salva antes continua valendo (`withBuiltIn`). |

## 2. Estados de um acerto
`dueCents ≤ 0` → **sem repasse** · `paidAt` → **recebido** · `reportedAt` sem `paidAt` → **avisado** · senão → **pendente**.

| Ação | Quem | De → para | Regras |
|---|---|---|---|
| Já fiz o repasse | revendedora | pendente → avisado | só o acerto dela; maleta fechada; `dueCents > 0`; idempotente (avisado/recebido → 200 sem mudar) |
| Desfazer aviso | Érika | avisado → pendente | só sem `paidAt` |
| Repasse recebido | Érika | qualquer → recebido | já existe |
| Desmarcar recebido | Érika | recebido → avisado/pendente | já existe; mantém `reportedAt` |

Toda escrita relê a maleta e grava com compare-and-swap em `updated_at` (mesmo laço de `handleKitPaid`), então "avisar" e "receber" ao mesmo tempo nunca se sobrescrevem.

## 3. API
- `GET /api/revenda/me` passa a devolver `pix: { key, name, city } | null` (do snapshot, `settings.pix`). O histórico já traz o `settlement` (com `dueCents`, `paidAt`, `reportedAt`).
- **Novo** `POST /api/revenda/settlements/:kitId/report` (sessão da revendedora, corpo `{}` ≤ 512 B) → `{ settlement }`. 404 se a maleta não é dela; 409 "Esta maleta ainda não teve acerto." / "Este acerto não tem repasse."; audit log `kit.report`; `notifyLeads` + aviso no celular "Repasse informado · Ana" / "R$ 150,00 do acerto de 24/11. Confira e marque como recebido.".
- **Novo** `POST /api/admin/kits/:id/report-clear` (sessão da Érika) → `{ kit }`; 409 se já recebido; audit log `kit.report_clear`.
- Lista de revendedoras (`GET /api/admin/resellers`): soma também `reported` (valor avisado e não recebido).

## 4. Telas (texto padrão)
**Painel da revendedora — resumo (maleta aberta):** nova linha "Para a ÉKA no acerto · R$ X" e a frase editável: *"Você recebe das clientes. No acerto, a comissão fica com você e o restante vai para a ÉKA."*

**Cartão "Repasse do acerto"** (um por acerto não recebido, mais antigo primeiro):
- Valor grande; "Acerto de 24/11 · vendeu R$ 199,80, comissão R$ 49,95" (+ "peças que faltaram R$ X" se houver).
- Pendente, com Pix: texto editável *"Pague pelo Pix da ÉKA: o valor já vai no código."*; QR (telas largas) + "Pix copia e cola" com copiar; chave e nome do recebedor; botões "Já fiz o repasse" e "Enviar comprovante no WhatsApp".
- Pendente, sem Pix: *"Combine com a ÉKA como fazer o repasse."* + WhatsApp + "Já fiz o repasse".
- Avisado: *"Você avisou que pagou. Quando a ÉKA conferir, aparece aqui como recebido."* + "Avisado em 24/11, 18:30" + WhatsApp.
- Mensagem do WhatsApp (editável): *"Oi! Aqui é {primeiro_nome}. Fiz o repasse de {total} do acerto da minha maleta. Segue o comprovante."*

**Histórico:** cada acerto ganha "Repasse R$ X · recebido em 24/11" / "avisado em 24/11" / "pendente" / "sem repasse".

**Painel da Érika:** em Acertos, "Ela avisou que pagou em 24/11, 18:30" + "Desfazer aviso"; na lista de revendedoras, "Repasse avisado: R$ X"; no acerto confirmado, o toast diz que ela já vê o valor e o Pix no painel. A planilha de acertos ganha a coluna "Repasse avisado em".

## 5. Arquivos
`src/data/revenda.ts` (schema `reportedAt`, `repasseState`, `repassePixTxid`), `worker/revenda.ts` (me + report), `worker/resellers.ts` (report-clear, lista), `worker/index.ts` (rotas), `src/revenda/api.ts`, `src/revenda/RevendaApp.tsx` (resumo, cartão, histórico), `src/admin/lib/resellers.ts`, `src/admin/sections/ResellersPage.tsx`, `src/admin/sections/ResellerForms.tsx` (toast), `src/data/content.ts` + `src/content/defaults.ts` + `SectionForms.tsx` (grupo `repasse`), docs (`PLAN.md` §0, `PERGUNTAS_ERIKA.md`, `AGENTS.md`).

## 6. Riscos
- Conflito com sessões que mexem em `content.ts`/`defaults.ts`/`SectionForms.tsx`: integrar só quando não houver mudança não commitada sobreposta; `git merge --ff-only` aborta sem estragar nada.
- Chave Pix inválida/ausente: só gerar código com `settings.pix` válido (já validado no schema).
- Revendedora com mais de 24 acertos: `me` lê os 24 mais recentes; um repasse pendente mais antigo que isso é improvável e continua visível para a Érika.

## 7. Critérios de aceite
1. Com maleta aberta e vendas, o resumo mostra "Para a ÉKA no acerto" = vendido − comissão.
2. Após o acerto com `dueCents > 0`, o painel dela mostra o cartão com o valor exato, e o copia e cola tem o valor e a referência (CRC válido).
3. "Já fiz o repasse" muda para "avisado" na hora, avisa a Érika e sobrevive a recarregar; tocar duas vezes não duplica nada.
4. A Érika vê o aviso, marca "Repasse recebido" → o cartão some e o histórico dela mostra "recebido em".
5. "Desfazer aviso" volta o cartão para pendente.
6. Outra revendedora (ou sem sessão) recebe 404/401 ao tentar avisar.
7. Sem chave Pix, nenhum código aparece e o WhatsApp é oferecido.
8. Seção `revenda` salva antes desta mudança continua com os textos dela, e o grupo novo aparece com o padrão.

## 8. Testes
- **Unidade:** estados, txid, payload Pix com valor; textos padrão.
- **Componente:** cartão nos três estados e sem Pix; histórico.
- **Integração (`wrangler dev`):** report (dona, idempotência, 404 de outra, 409 aberta/sem repasse), report-clear, paid depois de report, `me.pix`.
- **E2E Playwright (Chromium + WebKit):** fluxo completo Érika ↔ revendedora em dois contextos.
- **iPhone (Simulador do Xcode, Safari, porta 4180) e Android (Emulador, Chrome):** cartão, copiar código, botão, WhatsApp.
- **Chrome real (Claude in Chrome):** fluxo local e conferência no ar depois do deploy.
