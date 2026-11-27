# Planning prompt — one replaceable receipt, size notice, no orphan photos (ÉKA Semijoias)

You are a principal full-stack engineer and a senior UI/UX designer on the ÉKA Semijoias site (read `AGENTS.md` first; it is the project truth). **This step is investigation and planning only: write no application code.** The deliverables are `docs/arquivos/PLAN.md` (decisions, phases, acceptance criteria, test plan) and `docs/arquivos/IMPLEMENTATION_PROMPT.md` (a self-contained, step-by-step brief a fresh session could execute without this conversation).

## The owner's request (26/11/2026, `docs/pendencias.md` items 8 and 9)
1. **One receipt per order.** The customer can replace it; sending a new one replaces the previous one (the old file is erased).
2. **Up to 700 KB per attachment** (today's `RECEIPT_MAX_BYTES`, kept on purpose: no R2, no bigger limit). When a file is over the limit, the payment page says so (file size and limit) and offers "Enviar pelo WhatsApp" so the customer sends the file in the chat.
3. **Photos of a piece can be deleted, or swapped for another, and the old file is erased.** Goal: no unused photos piling up in the database (D1 `media` rows today; R2 later).

## Hard constraints
- Workers **Free plan**: 10 ms CPU per request, D1 rows ≤ 2 MB, 5 M rows read/day. Photos live in D1 (`MEDIA` R2 binding absent) but the code must keep working when R2 is enabled.
- Every write validated server-side (zod + `checkIntegrity`), atomic (one D1 batch guarded by compare-and-swap), idempotent under retries, never a fake success, errors surfaced in pt-BR.
- Personal/financial data (receipts) stays admin-only; nothing about it in logs, the public snapshot or WebSocket messages.
- UI copy in pt-BR, brand voice, copper actions, native `<dialog>` sheets, editable texts through `src/content/defaults.ts` + `src/data/content.ts` (sections saved before a new field must show the built-in text: `withBuiltIn`).
- Preserve the work just committed in `8c5a661` (owner discards/erases a single receipt; `rejected` records; SHA-256 refusal of the same file re-sent; erased records kept for stable numbering) and `c1140c9` (cron erases receipt files 7 days after the order settles).

## Investigate (cite file:line for every fact you rely on)
1. **Receipts today, end to end:** `src/data/orders.ts` (receipt schemas, `MAX_RECEIPTS_PER_ORDER`, `RECEIPT_MAX_BYTES`, append/discard helpers, `receiptsUnderReview`-style selectors), `worker/payments.ts` (upload route, throttles, sniffing, SHA-256 dedup, guarded batch, discard/erase, cron), `src/lib/receipt.ts` (client preparation and its error messages), `src/pages/Payment.tsx` (states: none sent, under review, discarded, paid; upload flow, preview, errors), `src/admin/sections/OrderPayment.tsx` and the admin order page (how receipts are listed, badges, actions), push notices (`worker/push.ts`), privacy text, tests that pin today's behavior (`src/data/orders.test.ts`, `src/pages/Payment.test.tsx`, `worker/test/integration/*.test.ts`, `e2e/*`).
2. **Media today:** `worker/media.ts` (upload, keys, storage in D1/R2, serving, existence check), `worker/catalog.ts` (change sets, photo existence check, snapshot), every place a `media/<sha>` key can be referenced: product images and variant galleries, content sections (`site:*` rows in `app_config`, hero slides with per-shape photos), settings, backups/restore, legacy import, reseller data, anything else (`grep -rn "media/"`). The D1 schema of the `media` table (columns, created time).
3. **Client save path:** `src/store/catalog` `commit`, `src/admin/lib` save, photo upload before save, what happens when a save fails after an upload (orphan by design?), multi-device concurrency.

## Decide and document (decide, don't survey; one-line rationale each)
- **Receipt model:** what "one per order" means with the existing records (current file vs history), how replacement interacts with discard (`rejected`), erase-after-settle, `pay_token`/new charges, the SHA-256 refusal, old orders already holding several files (migration-free compatibility), the admin view and push notice for a replacement, and which statuses still accept a replacement (e.g. not once paid).
- **Atomicity of replacement:** new file stored and old file deleted in the same guarded batch; what a retry or two parallel uploads do.
- **Over-limit UX:** where the check happens (client before upload and server 413), exact copy (editable or not), the WhatsApp message used, accessibility (live region, focus), what the page shows for PDFs vs images that cannot be reduced or opened.
- **Orphan photos:** deletion strategy (reference counting vs a mark-and-sweep scan over every reference), when it runs (inside the catalog commit, a cron, an admin button — or a combination), a grace period for freshly uploaded files that a save has not referenced yet, CPU/row-read budget on the Free plan (bounded batches), behavior with R2 present, what backups/restores referencing erased photos do, and the owner-facing UI (Painel: how she removes a photo from a piece, swaps it, and optionally sees/cleans unused photos). Never delete a file still referenced anywhere, including by an older catalog version an open tab may still save against.
- **Phases and work fronts**, each independently testable and committable, with acceptance criteria.
- **Test plan:** unit, worker unit, integration (real local Worker + D1), e2e (four browsers), and a real-browser run of each flow on the local stack; production smoke checks after deploy without leaving test data behind.
- **Docs to update:** `AGENTS.md`, `docs/pendencias.md` (mark done), privacy text if what is kept changes.

## Rules
- Ground every claim in the current code; mark anything unverified.
- Smallest complete solution; no new abstractions without a reason.
- Flag anything that needs the owner or an irreversible production action (e.g. deleting existing orphan photos in production) as an explicit step.
