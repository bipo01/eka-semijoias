# Backend plan — ÉKA Semijoias on Cloudflare

Output of `docs/backend/PLANNING_PROMPT.md`. Written 2026-11-23. Scope: the backend and its wiring to the existing frontend. Pix, stock and the sales report (`docs/pendencias.md`) are out of scope; the model leaves room for them.

## 1. Topology

**One Worker, one origin.** The Worker `eka-semijoias` serves:
- the built SPA from `dist/` as Workers Static Assets (served at the edge without invoking the Worker; free and unmetered);
- `/api/*` (JSON API and the WebSocket at `/api/live`) and `/media/*` (uploaded photos), routed to the Worker with `run_worker_first: ["/api/*", "/media/*"]`.

Rationale: same origin means no CORS, `SameSite=Strict` cookies work everywhere (including Safari, which blocks third-party cookies), one CSP with `connect-src 'self'`, and one deploy that keeps frontend and API versions in lockstep.

- Vite `base` becomes `/` for the Cloudflare build (overridable with `VITE_BASE`).
- **GitHub Pages** stops serving a second, diverging copy of the store. Its workflow publishes a tiny page that forwards to the Cloudflare URL and keeps the `#/route` hash, so old links keep working.
- Security headers for static assets come from `public/_headers` (supported by Workers Static Assets). The Worker sets them itself on API and media responses.

## 2. Data model (D1, SQLite)

All money stays in integer centavos. Entities keep their existing zod shape (`src/data/schema.ts`), stored as JSON documents plus the columns that need constraints or indexes.

| Table | Purpose / key columns |
|---|---|
| `meta` | `key` PK, `value`. Rows: `catalog_version` (integer as text), `settings` (public settings JSON). |
| `categories` | `id` PK, `slug` UNIQUE, `position`, `data` JSON, `version` (catalog version of last change). |
| `collections` | same shape as categories. |
| `products` | `id` PK, `slug` UNIQUE, `category_id` → `categories(id)`, `position`, `data` JSON, `version`, `created_at`, `updated_at`. Future `stock_levels` and `order_items` reference `products(id)`. |
| `catalog_snapshot` | single row (`id = 1`): `version`, `body` (the exact public JSON). Reads never assemble rows. |
| `leads` | `id` PK, `created_at` (indexed), `data` JSON. PII; admin-only. |
| `media` | `key` PK (`<sha256>.<ext>`), `content_type`, `size`, `created_at`, `bytes` BLOB (only when R2 is not bound). |
| `admin_credentials` | single row: `pin_hash`, `salt`, `updated_at`. |
| `admin_sessions` | `token_hash` PK, `created_at`, `expires_at`, `last_seen_at` (indexed by expiry). |
| `throttle` | `key` PK (`login:ip:<hash>`, `login:global`, `lead:ip:<hash>`), `count`, `window_start`, `locked_until`. |
| `idempotency` | `key` PK, `response` JSON, `created_at`. Replays a write whose response was lost. |
| `audit_log` | `id` autoincrement, `at`, `action`, `summary` (no PII). Base for the future stock history. |
| `write_guard` | one column `ok INTEGER CHECK (ok = 1)`; never holds rows. Used to abort a batch (see §3). |

- Migrations: `worker/migrations/NNNN_*.sql`, applied with `wrangler d1 migrations apply`.
- **First run:** when `meta.catalog_version` is missing, the Worker seeds D1 from `createSeed()` in one batch guarded by `INSERT OR IGNORE` on the version row, so concurrent first requests seed exactly once. Seed photos stay as static asset stems (`images/products/...`).
- Schema version 2: settings lose `pinHash` (credentials live server-side) and image sources accept `media/<sha256>.<webp|jpg|png>`. Backups from version 1 migrate by dropping `pinHash`; their data-URL photos are uploaded by the admin before import.

## 3. Writes: validation, atomicity, concurrency, idempotency

Admin edits stay as they are in the UI (`save(update)`), but the store turns each update into a **change set**: upserts and deletes per entity (product, category, collection, settings), computed by diffing the previous and next state. It sends the set as `POST /api/admin/changes` with `baseVersion`, which is the catalog version the edit started from.

Server algorithm:
1. Authenticate the session and check the Origin; cap the body at 2 MB; validate the envelope and every upserted entity with the shared zod schemas. Data URLs are refused here, so photos must already be uploaded.
2. Read the current state in one batch: catalog version, all entity rows (id, version, data), and the media keys the change set references.
3. **Lost-update protection, per entity.** If an entity in the set changed after `baseVersion` (`row.version > baseVersion`) and the stored data differs from what the client wants to write, the server answers 409 with the conflicting entities. Edits to different products from two phones never conflict.
4. Apply the set in memory, then run `checkIntegrity` (unique ids and slugs, existing categories, photo references) and check that every `media/...` key exists.
5. Write one D1 batch, which is a single transaction:
   - a guard: `INSERT INTO write_guard SELECT 0 WHERE (SELECT value FROM meta WHERE key='catalog_version') <> ?read`. If another write landed in between, the CHECK fails and the whole batch rolls back; the server re-reads and retries (up to 3 times).
   - the upserts and deletes, stamped with `version = read + 1`, ordered parents first, so foreign keys hold;
   - the new version, the new public snapshot built from the in-memory state (no second read), an `audit_log` row and the `idempotency` row.
6. After the commit, `waitUntil`: tell the live hub the new version.

The client sends an `Idempotency-Key` (UUID) and reuses it on retry. A replay returns the stored response instead of writing twice. Rows older than 24 h are pruned on write.

## 4. Reads and speed

- `GET /api/catalog` returns the snapshot body as stored, with `ETag: "c<version>"`. With `If-None-Match`, the answer is a 304 with no body.
  - Unversioned request: `Cache-Control: no-cache`. The Worker also keeps it in the per-colo Cache API for 10 s, so Brazilian traffic rarely crosses to D1.
  - `GET /api/catalog?v=N` (used after a live update): `public, max-age=31536000, immutable` when N is current, and cached at the edge. A stale N gets the current body with `no-cache`.
- One D1 query per cache miss (`catalog_snapshot` row). No JSON parsing on the hot path, which keeps CPU far under the Free plan's 10 ms.
- D1 location hint `enam` (no South America region exists; US East is the nearest primary to Brazil).
- Client:
  - `index.html` preloads `/api/catalog` (`<link rel="preload" as="fetch" crossorigin>`), so the request starts before the JS bundle runs.
  - The last snapshot is kept in localStorage (`eka:catalog-cache:v2`) and rendered instantly on return visits, then revalidated with ETag.
  - A first visit shows a short loading state; it falls back to the bundled seed only if the API is unreachable for 8 s, with a quiet "sem conexão" notice.
  - Routes never flash "not found" while the catalog is loading.
- Media responses: `Cache-Control: public, max-age=31536000, immutable` (content-addressed keys), with edge caching through the Cache API.

## 5. Real time (Durable Object `LiveHub`)

- `GET /api/live` (WebSocket upgrade):
  - The Worker checks the `Origin` (same host only) and forwards to the single `LiveHub` instance (`idFromName("catalog")`).
  - With a valid admin session cookie, the socket is tagged `admin`.
- The hub uses the **hibernation API** (`ctx.acceptWebSocket`), so idle sockets cost nothing.
  - `setWebSocketAutoResponse("ping" → "pong")` answers heartbeats without waking the object.
  - The current version is persisted in the object's storage.
- Messages, all server → client and with no PII:
  - `{"type":"hello","version":N}` on connect;
  - `{"type":"catalog","version":N}` after each write;
  - `{"type":"leads"}` to admin sockets only.
- Any other client message closes the socket (1008). Frames are capped at 512 bytes.
- Client:
  - The client connects after the first load and heartbeats every 25 s; with no pong in 10 s, it reconnects.
  - Reconnection uses exponential backoff with jitter (1 s → 30 s). When the tab becomes visible again it reconnects at once.
  - `hello` and `catalog` messages with a newer version trigger `GET /api/catalog?v=N`, so missed updates heal on reconnect.
  - Admin screens with open forms show a toast instead of yanking the form.

## 6. Media

- The admin photo pipeline stays (WebP or JPEG, about 180 KB main image and 480 px thumb). On save, every `data:` source is converted to a Blob and sent as `POST /api/admin/media`, with the raw body and `Content-Type` set to `image/webp`, `image/jpeg` or `image/png`.
  - Identical photos are uploaded once.
  - The `data:` sources are then replaced by the returned `media/<key>` before the change set is sent.
- The server:
  - checks the size (≤ 1 MB);
  - sniffs the magic bytes, which must match the declared type;
  - hashes with SHA-256;
  - stores the photo idempotently (an existing key is a no-op).
- Storage:
  - **R2** (`MEDIA` binding) when the account has R2 enabled;
  - otherwise the `media.bytes` BLOB column in D1. Same API, so enabling R2 later is a binding change plus a one-off copy.
- `GET /media/<key>` serves the photo with the right type, `X-Content-Type-Options: nosniff`, a `default-src 'none'` CSP and immutable caching.
- Orphan photos are kept; storage is cheap, and old backups may still reference them. A cleanup job can come later.

## 7. Security

**Admin authentication**
- A PIN of 6 to 8 digits, verified only on the server.
  - Trivial PINs are refused: all digits the same, or ascending/descending runs like 123456.
  - Stored hash: `HMAC-SHA256(PIN_PEPPER, salt || pin)`. `PIN_PEPPER` is a Worker secret, so a database leak alone cannot brute-force the small PIN space.
  - Compared with `crypto.subtle.timingSafeEqual`.
- **No public default PIN.** Until a PIN is stored, the login accepts only the `ADMIN_INITIAL_PIN` secret, generated randomly at deploy. The first successful login stores its hash.
- Throttling:
  - per IP: 5 failures → locked 15 min, doubling up to 24 h;
  - globally: more than 50 failures in an hour locks every login until the hour ends;
  - IPs are stored only as salted hashes.
  - The global cap means at most about 1,200 guesses a day against a 1,000,000-PIN space. A 7- or 8-digit PIN scales that by 10× or 100×.
- Sessions:
  - 256-bit random token in the cookie `__Host-eka_admin` (`Secure; HttpOnly; SameSite=Strict; Path=/`); only its SHA-256 is stored.
  - Sliding expiry: 14 days idle, 30 days absolute. `last_seen` is updated at most hourly.
  - Logout deletes the row. Changing the PIN requires the current PIN and revokes every other session.

**Request integrity**
- Every non-GET `/api` request must carry an `Origin` equal to the site's own origin (`Sec-Fetch-Site: cross-site` is rejected too).
- JSON endpoints require `Content-Type: application/json`, so cross-site forms cannot reach them.

**Public lead form**
- `POST /api/leads` validates with the shared lead schema.
- Body capped at 4 KB; honeypot field; per IP at most 5 leads per hour.
- Leads appear only in `/api/admin/leads`, never in the public snapshot.

**Headers**
- SPA, via `_headers`:
  - CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
  - `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, HSTS.
  - `/assets/*` gets one-year immutable caching.
- API: `Cache-Control: no-store` on everything admin.

**Logging**
- One structured JSON line per request: request id, route, status, duration, D1 retry count. No bodies, no IPs, no lead fields.
- Workers Observability is enabled.

## 8. Error semantics

- Body: `{"error":{"code":"conflict","message":"<pt-BR text>","details"?:…}}` plus an `X-Request-Id` header.
- Status codes:

| Status | Code | Meaning |
|---|---|---|
| 400 | `bad_request` | Validation failure, with field details |
| 401 | `unauthenticated` | No valid admin session |
| 403 | `forbidden_origin` | Request did not come from the site's own origin |
| 404 | `not_found` | Unknown route or entity |
| 409 | `conflict` | An edited entity changed after `baseVersion` |
| 413 | `too_large` | Body over the endpoint's cap |
| 415 | `unsupported_type` | Wrong `Content-Type` or image type |
| 422 | `integrity` | The change set would break catalog integrity |
| 429 | `rate_limited` | Throttled; includes `Retry-After` |
| 500 | `internal` | Unexpected failure; generic message |
| 503 | `unavailable` | D1 transient failure; retryable |

- Transient D1 errors (network lost, overloaded, timed out, object reset):
  - reads retry twice with jittered backoff;
  - writes retry only through the version guard plus the idempotency key.
- Client:
  - `ApiError { status, code, message, retryable }`;
  - every failed save shows the server message and keeps the form open;
  - a 409 offers "Recarregar" and explains that another device changed the item.

## 9. Frontend integration

- `src/lib/api.ts` is the fetch wrapper: timeouts, JSON handling, `ApiError`, and retries for GETs.
- `src/lib/live.ts` is the WebSocket client.
- `src/store/catalog.ts`:
  - State: `data` (a `Catalog`, which is `CatalogState` without leads), `version`, `status` (`loading | ready | offline`).
  - `refresh(version?)`, and `commit(update): Promise<SaveResult>`. `commit` uploads photos, diffs and sends the change set, then applies the result. If the version jumped past base + 1, it refetches the snapshot.
  - The localStorage snapshot cache is kept. The old localStorage-catalog code paths go away; cart, favorites and customer stay in localStorage, because they belong to each visitor.
- `Layout` gates on the catalog being loaded. Pages render as before after that.
- Admin:
  - `PinGate` posts the PIN (6–8 digits). `AdminApp` checks `GET /api/admin/session`.
  - Settings changes the PIN through `/api/admin/pin`.
  - `LeadsPage` reads and deletes through the API.
  - Backup exports catalog plus leads from the server, and imports by diffing against the current catalog and sending one change set. Old backups are migrated and their photos uploaded.
  - The "Espaço usado" browser-storage meter goes away; the per-photo limits stay.
  - A legacy customized localStorage catalog on the admin's device gets a download offer, so nothing is lost.
- Lead form: `fetch('/api/leads', { keepalive: true })` is started before `window.open`, so the WhatsApp popup still opens synchronously inside the click handler.

## 10. Testing

| Layer | What |
|---|---|
| Worker unit (Vitest, node) | PIN policy and hashing, cookie building and parsing, origin checks, change-set validation, conflict detection, integrity, magic-byte sniffing, error mapping, throttle maths. |
| Worker integration (Vitest + real `wrangler dev`, local D1 and Durable Object) | First-run seeding; catalog GET with ETag, 304 and `?v=`; login success, failure, lockout and global cap; session cookie flags; CSRF/Origin refusal; change sets with conflicts and idempotent replay; integrity errors; media upload, sniff refusal and serving; leads create, list and delete, plus rate limit; WebSocket hello and broadcast on write; admin tag; bad-message close. |
| Frontend unit | Diff and change-set builder, store commit paths (success, 409, network failure), PinGate against a mocked API, lead submission, backup migration. |
| E2E (Playwright, Chromium + WebKit) | Against `wrangler dev` serving `dist/`. The existing public and admin specs, adjusted for a server PIN, plus a two-context test: an admin edit appears live in a visitor tab without reload. |
| Deployed smoke | Catalog, 304, security headers, media, WebSocket hello, admin login with the initial PIN, one edit round trip that is then reverted. |

## 11. Deployment

1. **Owner step:** sign in to Cloudflare (`wrangler login`).
2. `wrangler d1 create eka-semijoias --location enam`, then put the id in `wrangler.jsonc`.
3. Try `wrangler r2 bucket create eka-semijoias-media`:
   - if it works, add the `MEDIA` binding;
   - if R2 is not enabled (the account needs a payment method on file), deploy with the D1 media fallback and record the switch steps.
4. `wrangler secret put PIN_PEPPER` (32 random bytes) and `ADMIN_INITIAL_PIN` (random 6 digits). The PIN is handed to the owner privately and never committed.
5. `wrangler d1 migrations apply DB --remote`.
6. `npm run build`, then `wrangler deploy`.
7. Smoke test the deployed URL (§10).
8. Push to `main`: GitHub Pages switches to the forwarding page.
9. CI checks:
   - typecheck (app and worker), unit tests and build on every push;
   - Cloudflare deploys stay manual with `npm run deploy` until a scoped API token exists as a repository secret.
10. Rollback: `wrangler rollback`. D1 Time Travel restores the database to any minute in the retention window.

## 12. Free-plan limits and when to upgrade

- **Per-request CPU (10 ms).** The hot path does no parsing. Admin writes validate only the changed entities. A full 500-product import could approach the limit, so the client sends imports in chunks of 100 entities; each chunk is atomic, and chunks are applied in order.
- **Request volume.** 100k Worker requests/day; assets don't count. Catalog reads are cut further by the browser cache, the 304s and the edge cache.
- **D1.** 5 M rows read and 100 k rows written per day; a catalog read costs about 1 row.
- **Durable Objects.** Hibernating sockets cost nothing while idle.
- **When to upgrade** (Workers Paid, US$5/month): sustained traffic near the request cap, catalogs past about 500 products, or the move to orders and Pix.

## 13. Changes after the independent plan review (implemented)

The plan was challenged by an independent reviewer before implementation. What changed, and why:

| Plan said | Implemented | Why |
|---|---|---|
| `meta` key/value table with the version as text | `catalog_snapshot.version` (INTEGER) is the compare-and-swap target; settings live in their own `settings` row with a `version` | Text vs integer comparisons in SQLite made the guard either always fail or pass on NULL. The guard is written `(cond) IS NOT 1`, so NULL aborts too. |
| Conflict only when the stored row is newer | Plus **tombstones** (`tombstones` table) | A stale device editing a product another device deleted would otherwise re-create it. Undo right after a delete still works (its base version is the delete's). |
| Count failed PINs after checking | Count **attempts before** checking (atomic upsert … RETURNING) | Parallel guesses could slip past a read-then-write counter. Per network = IPv4 or IPv6 /64. |
| Global login cap for everyone | Devices that logged in before carry a signed `__Host-eka_device` cookie and skip the global cap | An attacker could otherwise keep the owner locked out indefinitely. |
| Per-colo Cache API | **Workers Caching** (`"cache": {"enabled": true}`) driven by Cache-Control; versioned catalog at a path (`/api/catalog/v/<n>`), not a query | The Cache API is not confirmed on `*.workers.dev`; Workers Caching answers hits without running the Worker. Path versions avoid any query-string cache-key doubt. |
| `connect-src 'self'` from `_headers` | The Worker serves `/` and sets a CSP naming `wss://<host>` | Older Safari did not match `wss:` with `'self'`. |
| Version preview URLs | `preview_urls: false` | Preview versions would write to the production database. |
| Imports in chunks | Change sets use JSON bulk statements (`json_each`), so one batch has a constant ~15 statements whatever its size; up to 120 entities per request, larger edits are split parents-first | D1's per-invocation query limit and the 100-parameter limit never bind. |
| 8 s fallback to the bundled seed | An error state with "Tentar de novo"; the seed is no longer in the public bundle | The seed can carry outdated prices that visitors would order with. |
| GitHub Pages redirect | The forwarding page first offers a download when the old origin still holds a customized catalog | localStorage is per origin; the new site cannot read it. |
| Lead POST fire-and-forget | Started before `window.open` (keepalive), then awaited; a failure is shown in the confirmation panel | Never fail silently; the WhatsApp message still carries every field. |
