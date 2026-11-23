# Backend implementation prompt (ÉKA Semijoias)

You are a principal engineer implementing the Cloudflare backend for the ÉKA Semijoias site and wiring the existing frontend to it. Read `AGENTS.md`, then `docs/backend/PLAN.md`, which is the spec; this prompt is the execution order and the acceptance bar. Do not implement Pix, stock or the sales report.

## Stack and layout
- Wrangler 4 (pinned devDependency), `compatibility_date` = the newest date the installed `workerd` supports, `@cloudflare/workers-types`, TypeScript strict. No web framework: a small typed router.
- `wrangler.jsonc` at the repo root:
  - `main: worker/index.ts`;
  - `assets: { directory: "./dist", not_found_handling: "single-page-application", run_worker_first: ["/api/*", "/media/*"] }`;
  - bindings: D1 `DB`, Durable Object `LIVE` (class `LiveHub`, `new_sqlite_classes` migration), optional R2 `MEDIA`;
  - `observability.enabled = true`.
- `worker/` contains:
  - `index.ts` (entry, routing, request id, logging, security headers);
  - `env.ts`, `http.ts` (responses, errors, body limits), `db.ts` (D1 helpers, transient retry), `catalog.ts` (snapshot, seeding, change sets), `auth.ts` (PIN, sessions, throttle), `media.ts`, `leads.ts`, `live.ts` (Durable Object);
  - `migrations/0001_init.sql`;
  - `test/` for unit and integration tests.
- Shared code is imported from `src/`: `src/data/schema.ts`, `checkIntegrity`, `createSeed`, `src/lib/lead.ts`. Keep it free of DOM access so it bundles for workerd.
- `tsconfig.worker.json`, referenced from `tsconfig.json`, so `npm run typecheck` covers the worker.
- Scripts:
  - `dev:worker` (build + `wrangler dev`);
  - `test:worker` (unit tests);
  - `test:integration` (spawns `wrangler dev` on a temp persist dir, applies migrations locally, runs HTTP and WebSocket tests);
  - `deploy` (build + migrations + `wrangler deploy`).
- `.dev.vars.example` holds local-only test values; `.dev.vars` is gitignored.

## Order of work
1. **Schema v2.**
   - Settings drop `pinHash`. Image sources also accept `media/<64 hex>.<webp|jpg|png>`.
   - Add the migration 1 → 2.
   - Add a `Catalog` type (no leads) and a server-side "no data URLs" check.
   - Update the seed and the tests.
2. **Worker core:**
   - D1 schema;
   - first-run seeding;
   - `GET /api/catalog` (ETag, 304, `?v=`, 10 s per-colo Cache API);
   - `GET /api/health`;
   - error shape and security headers;
   - structured logs.
3. **Auth:**
   - login with the initial-PIN bootstrap;
   - PIN policy (6–8 digits, no trivial PINs);
   - HMAC with pepper and timing-safe compare;
   - per-IP and global throttles;
   - `__Host-` session cookie (plain name and no `Secure` only when `DEV_INSECURE_COOKIES=1`);
   - session check, logout, PIN change with session revocation;
   - an Origin/CSRF guard on every non-GET.
4. **Change sets:** `POST /api/admin/changes`, implementing §3 of the plan exactly:
   - zod validation;
   - per-entity conflict detection against `baseVersion`;
   - in-memory apply plus `checkIntegrity` plus media existence;
   - one atomic batch with the version guard;
   - snapshot rewrite, audit row and idempotency row;
   - retry on guard failure;
   - hub notification in `waitUntil`.
   - Also `GET /api/admin/backup` (catalog plus leads).
5. **Media:** `POST /api/admin/media` (≤ 1 MB, magic-byte sniffing, SHA-256 key, R2 or D1 BLOB) and `GET /media/:key` (immutable caching, nosniff, edge cache).
6. **Leads:** `POST /api/leads` (shared lead schema, 4 KB cap, honeypot, 5/hour per IP), `GET /api/admin/leads`, `DELETE /api/admin/leads/:id`, and an admin live notification.
7. **LiveHub:**
   - hibernation WebSockets;
   - Origin check in the Worker, and an `admin` tag when the session is valid;
   - `hello`, `catalog` and `leads` messages;
   - ping/pong auto-response;
   - the stored version is never lowered when notifications arrive out of order;
   - the socket closes on any other client message.
8. **Frontend:**
   - `src/lib/api.ts`, `src/lib/live.ts`;
   - the catalog store rewrite (`status`, `version`, snapshot cache, async `commit` that uploads photos, diffs and sends the change set, conflict and refresh handling);
   - loading gate in `Layout`;
   - preload in `index.html`;
   - `base` `/`;
   - admin login, session, PIN change, leads, backup and legacy-data offer;
   - async `save()` everywhere with disabled buttons while saving;
   - lead form with `keepalive` fetch before `window.open`;
   - remove the browser-storage meter.
   - Copy stays pt-BR and follows the voice rules.
9. **Headers and hosting:** `public/_headers` (CSP, HSTS, nosniff, referrer and permissions policies, immutable `/assets/*`), and the GitHub Pages forwarding page plus workflow update.
10. **Tests:**
    - worker unit and integration suites (§10 of the plan);
    - updated frontend unit tests;
    - Playwright against `wrangler dev` serving `dist/`, including a live-update test with two browser contexts.
    - Run typecheck, lint, unit, integration, build and E2E (Chromium + WebKit). All green before deploying.
11. **Review:** an independent adversarial review of the diff (security, concurrency, error paths). Fix confirmed issues and re-run the suites.
12. **Deploy:** plan §11.
    - The owner signs in to Cloudflare.
    - Create D1 with the `enam` hint; detect R2.
    - Set secrets: random pepper and random initial PIN, delivered privately and never committed.
    - Run remote migrations and deploy.
    - Smoke test the live URL (catalog, 304, headers, media, WebSocket, login, one edit round trip that is then reverted).
    - Push to `main` for the GitHub Pages hand-off.
    - Update `AGENTS.md` (architecture, commands, deploy, secrets, limits).

## Acceptance criteria
- An admin edit on one phone appears on a visitor's open page within about 1 s, without reload. The same edit from two devices on different products both succeed; on the same product, the later one gets a clear 409 message and nothing is lost silently.
- No secret, PIN hash or lead data in the bundle or in any public response. Admin endpoints return 401 without the cookie and 403 for foreign Origins. Login throttling works.
- Catalog requests: a 304 on revalidation; a warm `?v=` request comes from the edge cache. CPU stays well under 10 ms on public routes.
- Every error path shows a specific pt-BR message. No unhandled promise rejections or console errors in E2E.
- All checks above green; the deployed smoke test passes; the final diff has been reviewed.
