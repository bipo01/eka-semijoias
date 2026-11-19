# ÉKA Semijoias — project guide

The real website of **ÉKA Semijoias** (frontend-only, pre-production: GitHub Pages + stand-in photos) (Brazilian semi-fine jewelry, owner Érika). Sales close over WhatsApp; the catalog is managed by Érika from her phone and persisted in localStorage. No backend.

Live: https://bipo01.github.io/eka-semijoias/ (deployed from `main` by `.github/workflows/deploy.yml`).

## Status
- Built 2026-11-19 from `docs/PLAN.md` (the spec) and `docs/IMPLEMENTATION_PROMPT.md` (build brief). Mockups: `docs/mockups/`. Open business questions: `docs/PERGUNTAS_ERIKA.md`. QA screenshots: `docs/qa/`.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (`http://localhost:5173/eka-semijoias/`) |
| `npm run build` / `npm run preview` | Production build to `dist/` / serve it |
| `npm run typecheck` | `tsc -b --noEmit` (strict) |
| `npm run lint` | ESLint (bans `dangerouslySetInnerHTML` and `alert/confirm/prompt`) |
| `npm test -- --run` | Vitest unit tests (jsdom) |
| `npm run e2e` | Playwright on Chromium (Pixel 7, desktop) and WebKit/Safari (iPhone 13, desktop Safari); builds and serves `dist/`. `E2E_BASE_URL=<url>` targets a running server or the live site. `--project=mobile-webkit` for a quick Safari pass. |
| `QA_SCREENS=1 npx playwright test e2e/qa-screens.spec.ts --project=desktop-chromium` | Full-page screenshots of every route at 360/390/768/1280/1440 into `docs/qa/` |
| `npm run images` | One-off: regenerate `public/images` and `public/brand` from `assets/` (outputs are committed; CI does not run it) |

CI (`deploy.yml`): `npm ci` → typecheck → unit tests → build → deploy Pages. E2E is not in CI; run it locally before pushing UI changes.

## Structure
- `src/config/business.ts` — unconfirmed business facts (`null` hides the claim) + the admin checklist. Settings saved in the admin override contact fields and warranty (`src/hooks/useBusiness.ts`).
- `src/data/` — `schema.ts` (zod schemas/types), `seed.ts` (24-product initial catalog), `storage.ts` (typed `StorageResult`, quota detection, versioned load + `MIGRATIONS`, corrupt payload quarantine to `eka:catalog:corrupt:<ts>`), `catalog.ts` (selectors: prices, badges, variant galleries).
- Catalog persistence semantics (`storage.ts` `loadCatalog`): the seed is never written on first visit; a stored catalog with `customized !== true` (only leads were saved) is replaced by the current deployed seed on load (leads kept), so new deploys reach returning visitors. Admin commits and imports set `customized: true`. Every write is validated (`validateCatalog`) before it is stored. Data from a newer schema (`outdated`) or unreadable data that could not be quarantined (`corrupt-unsaved`) put the store in read-only mode.
- **What visitors see is the deployed seed.** Admin edits live only in the browser where they were made (no backend). To publish them for everyone: export a backup in the admin and turn it into `src/data/seed.ts` (or move to a backend).
- `src/store/` — Zustand stores: `catalog` (commit only mutates state after a successful, validated write; cross-tab `storage` sync), `cart`, `favorites`, `customer`, `ui` (toasts, panels, open-dialog count).
- `src/lib/` — `format` (BRL), `whatsapp` (order message + `wa.me` links), `catalogQuery` (URL-driven filters), `lead` (reseller form schema/mask), `search`, `slug`, `assets` (public asset/srcset helpers), `image` (upload pipeline), `csv`.
- `src/components/{ui,layout,product,home,bag}`, `src/pages/*`.
- `src/admin/` (lazy route chunk at `/#/admin`): `PinGate` (SHA-256 PIN, default 2580, session in sessionStorage), `AdminShell` (tabs, storage banners), `products/` (list, full-screen form with photo manager and variants editor, `productDraft.ts` validation), `sections/` (categories, collections, leads + CSV, settings + checklist, backup), `lib/` (persist/save helpers, session, contact formatting, downloads, reorder).
- localStorage keys: `eka:catalog:v1`, `eka:cart:v1`, `eka:favorites:v1`, `eka:customer:v1`; admin session flag in sessionStorage.

## Ground rules
- UI copy in Brazilian Portuguese; code, comments and commits in English.
- Voice: this is the real site, not a demo. No "demonstração/prévia/exemplo/placeholder/ilustrativa/não é segurança/pendente" in the public UI. The brand speaks as itself ("a gente", "nós"); never mention Érika in the third person (her name only on Sobre, in first person). `e2e/public.spec.ts` enforces this on every public route.
- Stack: Vite 8 + React 18 + TypeScript strict + Tailwind v4 (tokens as CSS variables in `src/styles/tokens.css`, mapped with `@theme inline`; custom utilities via `@utility` so responsive variants work) + `createHashRouter` (Pages has no SPA fallback), `base: '/eka-semijoias/'`.
- Unconfirmed business facts live only in `src/config/business.ts`. Never hard-code them elsewhere, never present them as confirmed.
- Design tokens: exact hex values and contrast results in `docs/PLAN.md` §1.1. Rose gold `#B48C78` is never text on light backgrounds; copper `#8A5A45` is the primary/action color. WhatsApp actions use copper, never WhatsApp green.
- Sheets/drawers/modals use the native `<dialog>` wrapper `src/components/ui/Sheet.tsx` (focus trap, Esc, focus return). Toasts portal into the topmost open dialog because modal dialogs make the rest of the page inert.
- Images: seed images are asset stems (`images/products/<name>` → `-480.webp`/`-960.webp`; wide lifestyle shots also `-1440`); uploads are data URLs with a 480 px `thumb`. Stand-ins are tracked with `placeholder: true` in data only.
- Never use the reference brand's (Áthama) name, photos or copy.
- Money is integer centavos; format with `formatBRL` (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`).
- Storage writes must surface quota/unavailable errors; never fail silently.
- Seed content to replace before go-live: testimonials (`src/content/home.ts`), the Sobre story (`src/pages/About.tsx`), stand-in photos.

## Tools
- `scripts/prepare-images.mjs` (sharp): asset conversion (see Commands). `scripts/shots.mjs` + `scripts/tile.mjs`: ad-hoc screenshot/tiling helpers for visual review.
- `tools/brand/`: palette extraction, recolor, tracing and SVG rendering scripts used to build the logo set (Python with Pillow/NumPy, potrace, Playwright). Not part of the site build.
- `tools/research-capture.js`: the Playwright script that captured the reference screenshots.
