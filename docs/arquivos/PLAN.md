# Plan: one replaceable receipt, a 700 KB notice, no unused photos

Written 26/11/2026 from `docs/arquivos/PLANNING_PROMPT.md`. Owner's request: `docs/pendencias.md` items 8 and 9.

## What the code does today (verified)
- **Receipts.** `src/data/orders.ts:138` `MAX_RECEIPTS_PER_ORDER = 6` stored files, `:137` `RECEIPT_MAX_BYTES = 700_000` (cut from 1.9 MB for the Free plan CPU, commit 187f68f), `:140` `MAX_RECEIPT_RECORDS = 20` records. `receiptsWithNew` (`:221`) refuses a 7th file. Upload `worker/payments.ts:138` (`handleUploadReceipt`): type sniffing, per-network and global throttles, same-file retry returns 201 (SHA-256 against `receipts` rows), the file the store discarded is refused, one guarded batch (order CAS + insert + audit). Discard/erase of one receipt (`handleEraseReceipt`, commit 8c5a661) and the daily erase 7 days after settling (`eraseExpiredReceipts`).
- **Payment page** (`src/pages/Payment.tsx`): state `analise` shows "Comprovante recebido" with "Enviar outro comprovante" (while fewer than 6), which opens the upload again with `receipt.againTitle`. `prepareReceipt` (`src/lib/receipt.ts:47`) rejects a PDF over 700 KB with a message that still asks for a print, and an image it cannot reduce under 380 KB with a generic message. A server 413 shows the generic `ApiError` text.
- **Photos.** `worker/media.ts:37` stores uploads content-addressed (`media/<sha256>.<ext>`) in D1 (`media.bytes`) or R2; nothing ever deletes them. References live only in the catalog: product images (`src`, `thumb`), collection `heroImage` and site content (`contentImageSources`, `src/data/content.ts:416`); `imageSourcesOf` (`src/data/changes.ts:169`) lists them all. The commit (`worker/catalog.ts:303`) checks that every referenced key exists. The client uploads first, then sends the change set in **chunks** (`sendChanges`, `src/store/catalog.ts`), so an intermediate chunk may drop a photo a later chunk re-adds (backup restore). Backups embed every photo, and a restore re-uploads photos the current catalog does not reference (`withEmbeddedMedia`), so a restore survives deleted files.
- **Production now:** 0 rows in `media` (no uploaded photo yet), the `pagamento` section was never saved (built-in texts are live).

## Decisions

### Front A — one receipt per order, replaceable
- `MAX_RECEIPTS_PER_ORDER = 1`. A new upload while a file is stored **replaces** it: in the same guarded batch the old file rows are deleted (`DELETE FROM receipts WHERE order_id = ?`), the old records get `erasedAt` + `replaced: true`, the new record and file are added. Atomic, so there is never zero or two files for a retry or a race (the CAS on `orders.updated_at` re-reads and retries).
- Allowed exactly where uploads are allowed today: order `confirmado` with a live charge (not paid, delivered, cancelled or anonymized). The same-file retry still answers 201 with the current file; the discarded file is still refused by its SHA-256; a file replaced earlier may be sent again (it was not wrong, just replaced).
- Records stay for history (up to 20; the oldest erased record goes first). Old orders holding several files keep showing them in the panel; their next upload replaces all.
- Push notice: "Comprovante trocado no pedido nº N" when a file was replaced (same tag, so it replaces the earlier notice). Audit: `order.receipt_replace`.
- Payment page: "Trocar o comprovante" replaces "Enviar outro comprovante" (no count limit), the upload shows `receipt.againTitle` (default "Trocar o comprovante") and a note that the new file replaces the one sent (`replaceNote`, editable), plus "Manter o comprovante enviado" to go back.
- Panel: a replaced record reads "Trocado pela cliente em …".
- Privacy text: sending another receipt replaces (and erases) the previous one.

### Front B — 700 KB limit with a WhatsApp way out
- Limit stays `RECEIPT_MAX_BYTES = 700_000` (owner's decision).
- `prepareReceipt` returns a `reason` (`too_big` | `unreadable` | `empty`) and the size; an image whose last JPEG step is still over 380 KB but within 700 KB is accepted (today it is refused for no good reason).
- Over the limit (PDF > 700 KB, image that cannot be reduced, file > 40 MB, or a server 413 `too_large`) the page shows a notice (`role="alert"`, focus moves to it): the editable `tooBig` text, a line with the file size and the limit ("Arquivo de 2,3 MB · o limite é 700 KB"), the primary button "Enviar pelo WhatsApp" (copper, `wa.me` with the editable `tooBigMessage`, `{pedido}` / `{primeiro_nome}`) and "Escolher outro arquivo". An unreadable file shows its message with the same WhatsApp button.
- New texts are top-level optional fields of the `pagamento` section (`withBuiltIn` merges only top level), editable in Painel → Site → Pagamento.

### Front C — no unused photos
- **Mark and sweep against the whole catalog**, never per change: a key is deleted only when nothing in the catalog after the commit references it (products, variants' photos through `images`, collections, every site section) and its upload is older than a grace period (`MEDIA_GRACE_MS` = 1 h; `media.created_at` is refreshed when the same photo is uploaded again, so a photo another tab is about to save is protected).
- **When:** (1) inside the catalog commit, in the same guarded batch, when the client marks the change set `sweepMedia: true` (only on the last chunk, so a restore split in chunks never loses a photo between chunks); (2) the daily cron (with the receipts); (3) "Apagar agora" in Painel → Backup. All three use one pure function (`unusedMediaKeys`) and a bounded `DELETE … WHERE key IN (…) AND created_at < cutoff` (≤ 500 keys per run), guarded by the catalog version, so a concurrent save is never undone.
- R2: rows deleted with `RETURNING key`, then the same objects are deleted from the bucket (best effort, logged).
- Owner UI: the product photo panel gets "Trocar foto" (keeps the position, the finishes it is linked to and the description; undo in the toast) and a line saying removed or swapped photos are erased when she saves. Painel → Backup gets a "Fotos guardadas" card: how many photos and MB are stored, how many are unused, and "Apagar agora".
- Not deleted: built-in stems (`images/…`), anything referenced, uploads younger than the grace period.

## Phases (each committed separately)
1. **A + B (receipts)**: data helpers + server replacement + push/audit + payment page (replace, notice) + panel label + texts/editor + privacy + tests.
2. **C (photos)**: sweep module + commit integration + upload touch + cron + admin endpoints + client flag + "Trocar foto" + Backup card + tests.
3. **Validation and release**: typecheck, lint, unit, worker unit, integration, build, e2e on four browsers, a manual run of every flow on the local stack (phone and desktop sizes), docs (`AGENTS.md`, `docs/pendencias.md`), commit, push to `main`, `npm run deploy`, production smoke checks.

## Acceptance criteria
- An order never stores more than one receipt file; a second upload replaces the first (old file gone from `receipts`, admin download 404, record "trocado"); a retry of the same upload does not create a second record.
- The payment page offers "Trocar o comprovante" while the payment is under review and nowhere else.
- A file over 700 KB is never uploaded; the page shows the size, the limit and a working WhatsApp link with the order number; a 413 from the server shows the same notice.
- Removing or swapping a product photo and saving erases the old file (404 on `/media/…`, row gone) unless another piece or section uses it or it was uploaded under an hour ago; the daily cron and "Apagar agora" clear leftovers; a backup restore in several chunks keeps every photo.
- All existing tests still pass; new unit, integration and e2e tests cover each criterion.

## Test plan
- Unit: `receiptsWithNew` replacement, `prepareReceipt` reasons, payment page (replace link, notice, WhatsApp href), `unusedMediaKeys`, PhotoManager swap.
- Worker integration (real `wrangler dev`, temporary D1): replace flow end to end, 413 over 700 KB, sweep in commit (swap, shared photo kept, grace kept, chunked restore), cron via `/__scheduled`, admin usage/sweep.
- E2E (Chromium/WebKit, phone/desktop): replace a receipt on the payment link; over-limit PDF shows the notice; swap a product photo and the old URL stops loading.
- Production after deploy: catalog and payment page load, `/api/admin/media/usage` answers (no test data created).
