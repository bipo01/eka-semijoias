You are a senior international UI/UX designer and a top-tier frontend engineer working as one person. Your job in THIS session is **research, design direction and planning only — do not implement the site yet.** The final deliverable of this session is a self-contained implementation prompt that I will paste into a fresh session, which will then build and publish the site.

Think deeply. Plan in **workstreams** and **phases**. Use Claude in Chrome for everything that needs a browser (I'm logged in to ChatGPT, Instagram and GitHub there).

## 1. Context

- Client: **Érika**, owner of **ÉKA Semijoias** (semi-fine jewelry / "semijoias", Brazil). She wants a website to sell her pieces. I'm showing her a **frontend-only preview** — it has to look stunning on first sight, mainly on a phone.
- She also wants **catalog management** (add/edit/remove products). For this preview, persist everything in **localStorage** — simple, no backend.
- Brand assets already on disk (project root: `~/dev/eka-semijoias/`):
  - `docs/reference/logo-eka-square.jpg`, `docs/reference/logo-eka-wide.jpg` — her logo: rose-gold/copper metallic on white; serif caps "ÉKA" with a crystal-studded floral/leaf ornament between É and K, a small pendant charm hanging inside the A, "Semijoias" in a flowing script below, all inside a thin double circle frame with small triple-dot ornaments at the four cardinal points.
  - `docs/reference/athama-linktree.jpg`, `docs/reference/athama-instagram.jpg` — the reference she likes.
- Reference she wants the site based on: **Áthama Semijoias Consignadas** — Instagram **@athamasemijoias** (https://www.instagram.com/athamasemijoias/), bio link to a Linktree (`linktr.ee/athamasemijoia…` — open it from the Instagram bio, the screenshot truncates it). The Linktree has: "Formulário de Cadastro para novas Revendedoras", "Catálogo on-line", "Fale conosco". Instagram highlights: Clientes, Revendedoras, Como Cuidar, Loja Virtual. Business model includes consignment resellers ("Conquiste sua liberdade financeira sem investimento! Seja uma revendedora"), and a showroom in Paranaíba-MS.
- Érika said we may improve on it — and we must: the reference has weak and ugly parts. Use it as a **feature/content baseline**, never as a visual template. Never copy Áthama's name, photos, copy or branding.
- The palette must come from **her logo** (rose gold / copper, warm whites, champagne, a deep contrast tone for text). Derive exact hex values from the logo files and verify WCAG AA contrast for text/buttons.

## 2. What to do in this session

### Phase 0 — Research & audit (Claude in Chrome)
1. Open the Áthama Instagram profile: bio, highlights (open each one: Clientes, Revendedoras, Como Cuidar, Loja Virtual), recent posts — note product categories, pricing style, how they sell (WhatsApp? DM?), reseller pitch, care instructions, tone.
2. Open the Linktree and **every link** in it, especially the online catalog / "Loja Virtual" site: crawl every page (home, categories, product page, cart/checkout, reseller form, contact). Screenshot key screens at mobile (~390px) and desktop widths; save to `docs/research/`.
3. Write `docs/research/audit.md`: full feature inventory (what exists, keep / improve / drop), and a concrete list of what's bad or ugly (visual, UX, performance, trust, mobile, accessibility) with the fix for each in our version.
4. Briefly study 3–5 premium jewelry e-commerce benchmarks (e.g. Vivara, Monte Carlo, Pandora, Mejuri, a top Brazilian semijoias brand) and extract patterns worth adopting (product photography framing, filtering, quick-add, WhatsApp ordering, trust signals). Patterns only — no copying.

### Phase 1 — Logo in 4K, adapted for the web (ChatGPT via Claude in Chrome)
1. Open https://chatgpt.com, start a new chat, upload both logo files.
2. Ask for a **faithful high-resolution recreation (4K, 3840px on the long side or the maximum ChatGPT allows)** — same letterforms, ornament, crystals, frame, rose-gold finish. Do not redesign it.
3. Also generate web adaptations: (a) full circular emblem on transparent background; (b) horizontal lockup "ÉKA Semijoias" without the circle, for the header; (c) "ÉK"/ornament monogram for favicon/app icon/avatar; (d) single-color versions (rose gold, deep tone, white for dark backgrounds).
4. Download everything into `assets/brand/`. If ChatGPT's output is below 4K, record the real resolution and plan the fix (AI upscale or SVG tracing for the flat versions) — never claim 4K if it isn't. Compare each output against the original and reject anything that drifts (wrong letters, extra ornaments, garbled "Semijoias").

### Phase 2 — Layout & design direction via generated page mockups (ChatGPT)
1. In ChatGPT, generate high-fidelity mockups using the brand assets and palette: **Home (mobile)**, **Home (desktop)**, **Catalog listing**, **Product detail**, and optionally **Catalog admin**. Direction: luxury-but-warm, editorial, lots of whitespace, refined serif display + clean sans body, rose-gold accents used sparingly, real jewelry-photography feel.
2. Iterate 2–3 rounds; pick a direction; save finals to `docs/mockups/` with a short note on what you adopted and what you rejected and why. Mockups guide layout — the build must be pixel-clean code, not image pasting.
3. Plan product imagery for the preview: generated jewelry product photos (ChatGPT) and/or Unsplash, clearly placeholder, consistent background and lighting.

### Phase 3 — The plan
Decide and document (no code beyond tiny illustrative snippets):

**Workstreams:**
1. **Brand & design system** — color tokens (with hex + contrast results), typography (pairing + scale; script font only as rare accent), spacing, radii, shadows, iconography, motion (subtle, `prefers-reduced-motion` respected), photo art direction.
2. **Information architecture & content (pt-BR)** — sitemap and sections. Baseline from the audit, improved. Expected at least: Home (hero, featured collections, best sellers, "Seja uma revendedora", care tips, Instagram strip, testimonials, FAQ, footer with contact/WhatsApp/Instagram), Catálogo (search, category filters, sort, price), Produto (gallery, variants, price in BRL, "Pedir pelo WhatsApp"), Sacola (cart → one pre-filled WhatsApp message with all items), Revendedoras (pitch + pre-registration form, front-end only), Como cuidar das semijoias, Sobre/Contato. Mark anything Érika must confirm (city, WhatsApp number, prices, whether she works with consignment resellers) as explicit placeholders.
3. **Frontend architecture** — default to Vite + React + TypeScript, Tailwind or CSS variables for tokens, HashRouter (GitHub Pages), no backend. Justify any deviation. Folder structure, component inventory, state approach, performance budget (LCP, image formats/sizes, lazy loading, font loading).
4. **Catalog management (localStorage)** — data model (product: id, name, slug, category, price, promo price, materials/plating, description, images, variants, stock/"disponível", featured, createdAt), versioned storage key with schema migration, seed data on first load, admin at `/#/admin` behind a simple PIN (state clearly it is a demo gate, not security), CRUD for products and categories, image upload with client-side resize/compression to WebP/JPEG and a size budget (localStorage ≈5 MB — plan for quota errors with a clear message, never silent failure), reorder/feature products, JSON export/import backup, "reset to demo data". Admin must be mobile-usable since Érika manages from her phone.
5. **Quality** — responsive at 360, 390, 768, 1280, 1440px; accessibility (keyboard, focus, alt text, contrast, semantic HTML); Lighthouse targets; empty/loading/error states; cross-browser (Chrome Android + Safari iOS).
6. **Repository & publishing** — in THIS session, create a **public GitHub repo** (`gh repo create eka-semijoias --public`), `git init` in `~/dev/eka-semijoias`, and commit/push the research, brand assets, mockups and plan. The implementation prompt must have the next session build the site and publish it to **GitHub Pages** via a GitHub Actions workflow, and return the live URL.

**Phases for implementation** (each with deliverables, acceptance criteria and a visual checkpoint against the mockups): scaffold + tokens → layout shell (header/footer/nav) → Home → Catálogo + Produto → Sacola/WhatsApp → Revendedoras + Como cuidar + Contato → Admin/localStorage → imagery & content polish → QA pass at all breakpoints → deploy to Pages + final screenshots.

## 3. Deliverables of this session
1. `docs/research/` (audit + screenshots), `assets/brand/` (logo set), `docs/mockups/` (chosen mockups + notes) — all pushed to the new public GitHub repo.
2. `docs/PLAN.md` — the full plan above.
3. `docs/IMPLEMENTATION_PROMPT.md` — **a single self-contained prompt in English** for the next session: context, decisions, exact asset paths, design tokens, page-by-page specs, data model, phases, acceptance criteria, validation steps, and publishing steps. It must not depend on this conversation. Also print it at the end of your reply so I can copy it.
4. A short list of questions I should ask Érika (WhatsApp number, real product photos, prices, reseller program, city/showroom, Instagram handle) — the preview must work with placeholders meanwhile.

## 4. Rules
- No implementation of the site in this session.
- Don't trigger browser dialogs; if ChatGPT, Instagram or GitHub needs login or hits a limit, stop and tell me exactly what's needed.
- Be honest about anything you couldn't open, generate or verify.
- The bar: Érika should open the preview on her phone and feel it's a premium jewelry brand — clearly better than the reference.
