# Backend planning prompt (ÉKA Semijoias)

You are a principal backend engineer who also owns the frontend integration. **This step is thinking and planning only: write no application code yet.** The deliverable is `docs/backend/PLAN.md`, followed by a self-contained `docs/backend/IMPLEMENTATION_PROMPT.md` that a fresh session can execute without this conversation.

## Context
- Repository: the ÉKA Semijoias site (see `AGENTS.md`). Vite 8 + React 18 + TypeScript strict + Tailwind v4, hash router, zod schemas in `src/data/schema.ts`, Zustand stores in `src/store/`, catalog admin in `src/admin/` (lazy chunk at `/#/admin`).
- Today the catalog lives in each browser's localStorage. What visitors see is the deployed seed (`src/data/seed.ts`); admin edits stay in the browser where they were made. Reseller leads are stored in the same localStorage document. The admin "PIN" is a SHA-256 hash stored next to the catalog (the default hash ships in the public bundle).
- `docs/pendencias.md` lists Pix, stock control and a sales report. All three need this backend, but **none of them is in scope now**. The data model and API must leave clean room for them (orders, stock movements, atomic transactions).

## Goal
A Cloudflare-hosted backend that replaces localStorage as the source of truth, publishes admin edits to every visitor, and pushes changes live over WebSocket. Owner's bar: "secure and fast; no bugs, errors or bottlenecks".

## Hard constraints
- Cloudflare only: Workers, D1, Durable Objects (WebSocket hibernation), R2 for media when the account has it enabled. It must work on the **Workers Free plan** (10 ms CPU per request, 100k requests/day, SQLite-backed Durable Objects only).
- Frontend and backend deployed together and talking to each other; the public UI keeps its current look and copy rules (pt-BR, brand voice, copper actions, native `<dialog>` sheets).
- No silent failures: every write reports success or a specific error; never fake success.
- Secrets never in the repo or the public bundle.

## Think through, decide and document
1. **Topology.** Same-origin Worker serving the built SPA (static assets) + `/api/*` + `/media/*` + the WebSocket, vs. a separate API origin. Effect on cookies, CORS, CSP, latency, and what happens to the GitHub Pages deployment.
2. **Data model (D1).** Tables, keys, constraints, indexes, JSON vs. columns, catalog versioning, the materialized public snapshot, and how future orders/stock tables attach. Migrations and first-run seeding.
3. **Consistency and concurrency.** How admin writes are validated (reuse the zod schemas and `checkIntegrity`), made atomic in D1, protected from lost updates (two tabs or phones), and made idempotent under retries. How the public snapshot stays in sync with writes.
4. **Read performance.** The cold path from Brazil (D1 has no South America location), edge caching, ETag/304, versioned immutable URLs, client-side cache and preload, payload size, and CPU per request.
5. **Real time.** Durable Object hub with hibernation: connect, hello and version handshake, broadcast on write, admin-only channels, heartbeat, reconnection with backoff, missed-update recovery, Origin checks, abuse limits.
6. **Media.** Upload path from the existing client photo pipeline, content addressing, type sniffing, size caps, storage in R2 or a D1 fallback when R2 is not enabled, cache headers, and serving.
7. **Security.** Admin authentication that does not rely on a short public hash: server-side PIN with pepper, rate limiting and lockout, session cookies (`__Host-`, HttpOnly, Secure, SameSite=Strict), CSRF, PIN change revoking sessions, bootstrap without a public default PIN. Public endpoints (lead form) with validation, size caps, honeypot and rate limits. Security headers and CSP for the SPA. PII (leads) never in public responses. Logging without PII.
8. **Error semantics.** Status codes, error body shape, user-facing pt-BR messages, retryable vs. terminal errors, D1 transient errors.
9. **Frontend integration.** Store changes (async saves, loading and offline states, gating so a product page never flashes "not found"), diffing admin edits into granular changes, photo upload before save, lead submission without blocking the WhatsApp popup, admin login/session flow, backup import/export, legacy localStorage data.
10. **Testing.** Unit tests for pure modules, integration tests against a real local `workerd` (D1 + Durable Object + WebSocket), updated frontend tests, Playwright E2E against the same-origin dev server, and smoke tests against the deployed URL.
11. **Deployment.** Exact steps: login, D1 creation with a location hint, R2 detection, secrets, migrations, build, deploy, smoke test, GitHub Pages hand-off, CI, rollback.
12. **Risks and limits.** What the Free plan caps mean for this store, and what would trigger moving to the paid plan.

## Rules
- Decide; don't survey. Every decision gets a one-line rationale.
- Mark anything that needs the owner (Cloudflare login, R2 billing) as an explicit external step.
- Ground claims in the current repository code and current Cloudflare docs; flag anything unverified.
