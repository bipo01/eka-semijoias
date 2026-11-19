# Implementation prompt — ÉKA Semijoias website

> Paste everything below the line into a fresh Claude Code session opened in `~/dev/eka-semijoias` (repo `github.com/bipo01/eka-semijoias`). It is self-contained.

---

You are a senior UI/UX designer and a top-tier frontend engineer working as one person. Build and publish **the real ÉKA Semijoias website** (frontend-only, pre-production), the site of a Brazilian semi-fine jewelry ("semijoias") brand owned by **Érika**. It is the actual site, not a demo: it just isn't on a production domain yet and uses stand-in photos until Érika sends real ones. She will open the link on her phone; on first sight it must read as a premium jewelry brand: warm, editorial, calm, flawless on mobile. Sales happen over **WhatsApp**, and she manages the catalog from her phone (**localStorage**, no backend). Write all UI copy in **Brazilian Portuguese**; write code, comments and commits in English.

## 0. Ground truth already in this repository (read before coding)
- `docs/PLAN.md` — the full plan (design tokens, IA, page specs, data model, storage, admin, quality, phases). **It is the spec.** This prompt summarizes it and adds execution rules; when they differ, PLAN.md wins on product and design details, and this prompt wins on process.
- `docs/mockups/*.png` + `docs/mockups/README.md` — the chosen visual direction (adopted vs rejected). The build must be pixel-clean code, never pasted mockup images.
- `docs/research/audit.md` — what was wrong with the reference site (Áthama). Don't repeat those mistakes. Never use Áthama's name, photos or copy.
- `docs/research/benchmarks.md` — patterns from Vivara, Monte Carlo, Pandora, Mejuri, Rommanel, Francisca.
- `assets/brand/` + `assets/brand/README.md` — the logo set (SVGs, metallic PNGs, favicons and app icons). Header logo: `assets/brand/svg/eka-lockup-copper.svg`.
- `assets/images/` + `assets/images/README.md` — generated stand-in product and lifestyle photos (JPEG q92 sources). Convert them to WebP at build-prep time (see §6).
- `tools/brand/` — the scripts used to make the brand assets (do not run as part of the build).

## 1. Non-negotiables
1. Stack: **Vite + React 18 + TypeScript (strict) + Tailwind CSS v4** (tokens as CSS variables in `@theme`) + **React Router with HashRouter** + Zustand (persist via our own storage module) + `lucide-react` + `zod` + `@fontsource/cormorant-garamond` and `@fontsource/jost`. Tests: Vitest + Testing Library; Playwright (+ `@axe-core/playwright`) for e2e, screenshots and accessibility. Do not add a UI kit, a CSS-in-JS lib, or a backend.
2. Mobile-first. Verify at **360, 390, 768, 1280, 1440 px**. Chrome Android and Safari iOS behaviors (safe areas, `100dvh`, 16 px inputs).
3. Every business fact Érika hasn't confirmed lives in **one file**, `src/config/business.ts`, with `pending: true` markers. The UI hides claims that are `null` and writes the rest generically (never labeled as pending in public). Admin → Configurações shows them in a neutral checklist "Complete as informações da loja". Starting values:
   ```ts
   whatsapp: null                 // PENDING — while null, links use https://wa.me/?text=… (WhatsApp opens the contact picker, so ordering still works end to end); no visible notice in the public UI
   instagram: 'ekasemijoias'      // PENDING — handle not confirmed
   city: null                     // PENDING — hide city mentions when null
   showroom: null                 // PENDING — hide showroom blocks when null
   warrantyMonths: 6              // PENDING — shown as "Garantia de 6 meses"
   hypoallergenic: null           // PENDING — hide "antialérgicas" claim when null
   shipsNationwide: true          // PENDING
   installments: null             // PENDING — hide "parcelamento" when null
   resellerProgram: { enabled: true, consignment: null, commissionTiers: [] } // PENDING — hide tiers table when empty
   ```
4. Money is integer **centavos** everywhere; format with `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
5. No silent failures: storage writes return a typed result; quota errors show a clear pt-BR message and keep the user's edits.
6. No emoji in the UI. No bright WhatsApp green: WhatsApp actions use the copper button with the WhatsApp glyph.
7. No browser `alert/confirm/prompt`; use in-app modals and toasts.
8. Accessibility is part of done: semantic HTML, labels, focus management in sheets/drawers, visible focus, alt text, AA contrast (token table below), `prefers-reduced-motion`.
9. **This is the real ÉKA website, not a demo.** It is pre-production only because it runs on GitHub Pages and uses stand-in photos until Érika sends hers. Therefore:
   - Public UI copy never mentions demo/demonstração, prévia/preview, exemplo, placeholder, "imagens ilustrativas", "não é segurança", AI, or anything that reveals the site is unfinished or was generated.
   - The brand speaks in its own voice: first person plural ("a gente", "nós", "nossas peças") or impersonal, and "você" for the customer. **Never refer to Érika in the third person in the UI** (no "Fale com a Érika", "confirme com a Érika", "Área da Érika"). The only place her name may appear is the Sobre page, written in her own first person ("Eu sou a Érika…").
   - No explanatory helper lines that sound like an outsider describing the business (e.g. no "Você confirma pagamento e entrega direto com a Érika"). A CTA like "Enviar pedido pelo WhatsApp" speaks for itself.
   - Unconfirmed facts are hidden or written generically. They are never labeled "pendente" in the public UI. Stand-in photos and seed texts are tracked only in data/config (`placeholder: true`, `pending`). The admin's settings tab has a neutral checklist "Complete as informações da loja".
   - Seed testimonials and the seed Sobre text read like real content (no "exemplo" tag). They are listed in the final report as items to replace with real ones before going live.
   - Add an automated check (Playwright) that renders every public route and fails if the visible text contains any of: `demonstra`, `demo`, `prévia`, `preview`, `exemplo`, `placeholder`, `ilustrativ`, `não é segur` (all routes), and `com a Érika`, `da Érika`, `fale com a Érika` (all routes except `/#/sobre`, where Érika speaks in first person).

## 2. Design tokens (exact)
```css
--c-ivory:#FBF8F5;      /* page bg */
--c-white:#FFFFFF;      /* cards, sheets, inputs */
--c-champagne:#F3E6DC;  /* soft surfaces, bands, product photo backdrop */
--c-line:#E7DAD0;       /* hairlines, input borders (non-text) */
--c-rose:#B48C78;       /* decorative accent only — NEVER text on light (2.85:1); OK on espresso (5.39:1) */
--c-rose-light:#E6BEA4; /* accent text/icons on espresso (9.50:1) */
--c-copper:#8A5A45;     /* primary buttons, links, selected chips — 5.47 on ivory, 4.73 on champagne; white on it 5.79 */
--c-copper-dark:#7E4F3B;/* hover/pressed — white on it 6.84 */
--c-ink:#2B1D18;        /* text (espresso), footer bg — 15.37 on ivory */
--c-ink-muted:#6F574D;  /* secondary text, struck price, placeholders — 6.31 ivory, 5.45 champagne */
--c-success:#3F6B4E; --c-danger:#9A3B2E;
```
These were measured from the logo (metal ramp `#976552 → #B48C78 → #E6BEA4`) and contrast-checked. Typography: **Cormorant Garamond** 500/600 + 500 italic for display (at most one italic accent word per headline), **Jost** 400/500 for UI/body. Scale with `clamp()`: display-xl 40→64, display-l 32→48, display-m 26→34, title 20→22, body 16/1.6, small 14, micro 12 (uppercase, 0.08 em tracking). Spacing 4/8 rhythm; mobile gutter 20 px; desktop container 1200 px. Radius: cards/images 12, buttons/chips pill, sheets 20 (top), inputs 10. Shadow only for sheets/sticky bar: `0 1px 2px rgb(43 29 24/.06), 0 4px 16px rgb(43 29 24/.06)`. Motion 160/240 ms `cubic-bezier(.2,.7,.2,1)`; reduced-motion disables transforms. Touch targets ≥ 44 px. Focus ring 2 px copper + 2 px ivory offset. Icons: Lucide at 1.5 stroke; WhatsApp and Instagram as inline SVGs.

## 3. Pages (full specs in PLAN.md §2.3; summary)
- **Header** sticky 56 px: menu · centered copper lockup (28 px tall) · search · bag with count. Desktop: logo left, nav (Catálogo, Coleções, Revendedoras, Como cuidar, Sobre), search/favorites/bag. Champagne announcement bar (admin-editable). Mobile menu drawer with categories ("a partir de R$ X" computed), Seja revendedora (highlighted), Como cuidar, Garantia, Sobre, Contato.
- **Footer** espresso: metallic/white emblem, promise line, links, WhatsApp, Instagram, city (if set), "© ÉKA Semijoias". No "imagens ilustrativas" or "prévia" notes.
- **WhatsApp FAB** 52 px copper, safe-area aware; hidden on Produto (the sticky bar has it), on Admin, and while sheets are open.
- **Home** (`/#/`): hero (on-skin photo; headline "Brilho que acompanha *você*", subline "Semijoias com banho de qualidade e acabamento impecável", "Ver catálogo" + link "Seja revendedora") → trust strip (from business.ts) → Categorias rail (4:5 tiles, next tile peeks) → Mais amadas (featured; 2-col / 4-col) → Coleção editorial block → Novidades carousel → reseller band → Como cuidar teaser → Depoimentos (seed testimonials written like real ones, no label; replace before go-live) → Instagram strip (static) → FAQ accordion → footer.
- **Catálogo** (`/#/catalogo`, `/#/catalogo/:categoria`): title + count, accent-insensitive search (debounced), category chips, "Filtrar"/"Ordenar" bottom sheets (acabamento, preço, disponível, promoção; sort Destaques/Novidades/Menor/Maior preço), removable active-filter chips, 24 + "Carregar mais" with "Mostrando X de Y", empty state with WhatsApp help. **All filter state in the URL query**; back restores state and scroll.
- **Product card**: strict 4:5 image (`aspect-ratio`, `object-fit: cover`, explicit width/height), second image on hover (desktop only), name (2 lines), finish swatch dots, price / promo (struck old price in ink-muted, new price in copper), one tag max (Novo / Mais vendido / Esgotado), quick-add bag button (adds the default variant) with toast "Adicionado à sacola · Ver sacola".
- **Produto** (`/#/produto/:slug`): scroll-snap gallery with dots and a peek of the next image; fullscreen viewer with pinch-zoom; name (serif); price/promo; "Acabamento" swatches with labels (switch images/ref); size selector when present; quantity stepper in the body; description; accordions (Detalhes da peça as label:value rows, Cuidados, Garantia); mini trust strip; "Ficou com alguma dúvida? Fale com a gente" WhatsApp block; "Complete o look"; "Ref." small print. **Sticky bottom bar (one row, ≤ 64 px + safe area):** price · "Adicionar à sacola" (copper) · WhatsApp icon button "Pedir agora".
- **Sacola** (bottom sheet from anywhere + `/#/sacola`): items with thumb, name, finish/size, stepper, remove (undo toast); "Observação", "Seu nome", "Cidade" (remembered); subtotal; copper button "Enviar pedido pelo WhatsApp" (no helper line under it). Message format (exact; build with `encodeURIComponent`, `https://wa.me/${whatsapp}?text=`, or `https://wa.me/?text=` while the number is pending):
  ```
  Olá! Gostaria de fazer este pedido:

  1) Brinco Gota Cristal — Rosé — 1 un. — R$ 129,90
  2) Anel Solitário Delicado — Dourado — aro 16 — 2 un. — R$ 279,80

  Total: R$ 409,70
  Nome: Ana · Cidade: Campo Grande/MS
  Obs.: é para presente
  ```
  Omit empty lines (no name → no "Nome" line). Over ~1,800 chars → compact format. Don't auto-clear the bag; after sending, offer "Pedido enviado? Limpar sacola".
- **Revendedoras** (`/#/revendedoras`): hero (sample-case photo) "Renda extra com semijoias que encantam"; "Como funciona" 4-step vertical timeline (Cadastro → Conversa e aprovação → Receba seu mostruário → Venda e ganhe); benefits (Sem investimento inicial {pending}, Comissão atrativa, Suporte e materiais); commission table only if `commissionTiers` is non-empty; FAQ; **Pré-cadastro** form: Nome*, WhatsApp* (mask), Cidade/UF*, Instagram, "Já revende?" (Sim/Não segmented), "Como conheceu a ÉKA?", consent checkbox*. Submit → zod validation with inline pt-BR errors → save the lead to localStorage → open WhatsApp with an intro message → success state. **Never ask for CPF, birth date or address.**
- **Como cuidar**, **Garantia e trocas** (coberto / não coberto), **Sobre** (seed story in Érika's own first person, values, showroom if set), **Contato**, **Favoritos**, **Coleção** (`/#/colecao/:slug`), **404**.
- **Admin** (`/#/admin`, lazy-loaded chunk): PIN gate (default `2580`, SHA-256 stored, session flag in sessionStorage; title "Painel ÉKA", subtitle "Digite seu PIN para entrar"; no disclaimers on screen); tabs Produtos · Categorias · Coleções · Revendedoras · Configurações · Backup; storage meter (warn at 70 %/90 %); product list (thumb, name, category, price, availability switch, featured star, drag handle + up/down buttons as the accessible fallback, search); full-screen product form (photos with reorder/main/alt, name + auto slug, category, collections, price + promo with validation, finishes/variants with own photos, sizes and SKU, description, details, available, featured, tags; Save / Save & new / Duplicate / Delete with modal + undo); categories/collections CRUD + order (moving products on delete); leads list (WhatsApp, delete, CSV export); settings (announcement, contact fields, warranty, PIN, "Complete as informações da loja" checklist); backup (export JSON with images, import with zod validation + summary + confirm + migration, "Restaurar catálogo inicial" with export offered first).

## 4. Data and storage (exact; details in PLAN.md §4)
Implement the `Product / Variant / ProductImage / Category / Collection / ResellerLead / Settings / CatalogState` types from PLAN.md §4.1 with zod schemas. Keys: `eka:catalog:v1`, `eka:cart:v1`, `eka:favorites:v1`, `eka:customer:v1`. `storage.ts`: versioned load (`schemaVersion`, a migrations map), seed on first run, corrupt payload saved to `eka:catalog:corrupt:<ts>` before falling back to seed, `QuotaExceededError` detection across browsers (name or code 22/1014) → `{ ok:false, reason:'quota' }`, storage-unavailable → admin banner "Este navegador não permite salvar alterações (talvez esteja em modo anônimo)", `storage` event cross-tab sync. Image upload pipeline: `createImageBitmap` → canvas max 1200 px → WebP 0.8 (JPEG fallback) → step down until ≤ 180 KB → data URL + a 480 px thumb; show per-image size and remaining budget; HEIC decode failure → "Formato não suportado — envie em JPG ou PNG".

**Seed catalog:** 6 categories (Brincos, Colares, Anéis, Pulseiras, Conjuntos, Tornozeleiras — the last can be empty to exercise the empty state), 2 collections ("Coleção Rosé" featured on Home, "Para presentear"), **every product image in `assets/images/README.md`** plus enough extra products (reusing photos with different finishes, clearly in the same style) to reach **24 products**, prices R$ 49,90–289,90, 4–6 featured, 3 on promo, 2 unavailable, realistic pt-BR names and descriptions, details filled (material "Latão com banho de ouro 18k" / "ródio" etc., marked `pending` until Érika confirms the plating spec). Variants: Rosé / Dourado / Prateado where it makes sense. A variant without its own photo shows the product's main photo plus a small caption "Foto no acabamento Rosé".

## 5. Folder structure
Use PLAN.md §3 (src/config, styles, lib, data, store, components/{ui,layout,product,home}, pages, admin). Keep components small and typed. No dead code.

## 6. Images
- Run a one-off script (`scripts/prepare-images.mjs`, using `sharp` as a devDependency) that converts `assets/images/source/*.jpg` → `public/images/{products,lifestyle}/<name>-{480,960}.webp` (4:5 crop for products, center-weighted; quality 78), plus `assets/brand` → `public/brand/` (SVGs as-is; the metallic emblem → WebP 600 px), and icons → `public/`. Commit the outputs (the site must not need the script at deploy time).
- Hero: `fetchpriority="high"`, preload, explicit dimensions, ≤ 140 KB. Everything below the fold `loading="lazy" decoding="async"`, `srcset` 480/960 + `sizes`.
- Every product image has meaningful alt text: "{nome} em {acabamento}".
- Available sources (all stand-ins, see `assets/images/README.md`): 12 product still-lifes `p01`–`p12` (one shared art direction), hero `l01-hero-pescoco.jpg` (the same p01 earrings and p05 necklace on skin), `l02-mostruario-revendedora.jpg` (Revendedoras hero), `l03-editorial-colecao-rose.jpg` (Coleção Rosé block, text on the left half) and `l04-mao-aneis.jpg` (rings and bracelet on a hand). Reach 24 seed products by reusing these photos for other finishes or related pieces. **Never invent a photo that doesn't match the product's name.** If a product needs a new photo and Claude in Chrome with ChatGPT is available, generate it with the prompt below, upload `p01` as the reference, and record it in the README. Otherwise reuse photos.
  > "The attached photo is the approved catalog photography style for a jewelry brand. Generate a new product photo that matches it EXACTLY: same vertical portrait format, same seamless warm champagne paper backdrop (#F3E6DC-ish) with subtle linen texture, same soft diffused daylight from the upper left, same gentle contact shadow, same scale (piece fills about 55–65% of the frame, centered), same slight top-down angle, same rose-gold plating color and clear zirconia rendering, photorealistic, no props, no hands, no text, no logo. Product: {name} — {precise description, size in mm/cm, arrangement}."

## 7. Performance and quality targets
Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90. LCP ≤ 2.5 s, CLS ≤ 0.05, initial JS ≤ 160 KB gzip (admin code-split). No axe serious/critical violations. Skeletons with fixed ratios; route-level error boundary; image error fallback (champagne tile + monogram); empty states for search/catalog/favorites/bag/leads.

## 8. Process
1. Read `docs/PLAN.md`, the mockups and the READMEs. Check `git status`. Update `AGENTS.md` (it exists; add the real scripts, structure and deploy facts as they become true). `CLAUDE.md` already imports it.
2. Work in the phases below. After each phase: `npm run typecheck && npm run lint && npm test`, take Playwright screenshots at 390 and 1440, **compare them side by side with the matching mockup**, fix what's off, then commit (`feat: …`, small focused commits) and push to `main`.
3. Use the frontend-craft / visual-fidelity mindset: measure (spacing, sizes, contrast) instead of eyeballing, and fix at the root (tokens/components) rather than one-off overrides.
4. Before finishing: an adversarial review of the storage/admin code (quota, corrupt data, import of a malicious/malformed JSON, XSS through product text — render as text, never `dangerouslySetInnerHTML`), and a full regression run.

| # | Phase | Acceptance |
|---|---|---|
| 1 | Scaffold, tokens, fonts, base styles, scripts (`dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `e2e`), image prep, **GitHub Pages workflow (deploy the shell early)** | Build passes; the live URL shows the shell |
| 2 | Layout shell: header, menu drawer, footer, announcement bar, FAB, routes, 404 | Keyboard and screen-reader navigable; matches the header/footer in the mockups |
| 3 | Home | Matches `home-mobile.png` and `home-desktop.png` (with the corrections in mockups/README) |
| 4 | Catálogo + Produto | URL-driven filters; back restores state; PDP matches `catalog-product-mobile.png` with the one-row sticky bar |
| 5 | Sacola + WhatsApp | Unit tests for totals and message (snapshot, compact mode, missing fields); matches `bag-resellers-mobile.png` screen 1 |
| 6 | Revendedoras, Como cuidar, Garantia, Sobre, Contato, Favoritos, Coleção | Form validation and lead storage tested; matches screens 2–3 of `bag-resellers-mobile.png` |
| 7 | Admin + storage | CRUD, reorder, images, backup round-trip, reset, simulated quota error test, migration test; matches `admin-mobile.png`; usable at 360 px |
| 8 | Imagery + copy polish | No broken images; all alts; pt-BR copy proofread in the brand voice; the banned-words check (§1.9) passes on every public route |
| 9 | QA | Playwright screenshots of every route at 360/390/768/1280/1440 saved to `docs/qa/`; axe clean; Lighthouse report saved; fixes applied |
| 10 | Deploy + verify | Actions green; the live URL renders Home, Catálogo, Produto, Sacola, Revendedoras and Admin on mobile emulation; report the URL |

## 9. Publishing (GitHub Pages via Actions)
- `vite.config.ts`: `base: '/eka-semijoias/'`.
- `.github/workflows/deploy.yml`: on push to `main` + `workflow_dispatch`; permissions `pages: write`, `id-token: write`, `contents: read`; concurrency group `pages`; jobs: build (checkout, setup-node 22 with npm cache, `npm ci`, `npm run typecheck`, `npm test -- --run`, `npm run build`, `actions/configure-pages`, `actions/upload-pages-artifact` with `path: dist`) → deploy (`actions/deploy-pages`).
- Enable Pages with the Actions source: `gh api -X POST repos/bipo01/eka-semijoias/pages -f build_type=workflow` (if it already exists: `gh api -X PUT repos/bipo01/eka-semijoias/pages -f build_type=workflow`).
- Watch the run with `gh run watch`, then verify `https://bipo01.github.io/eka-semijoias/` returns 200 and renders (Playwright against the live URL at 390 px, and check that the assets load under the `/eka-semijoias/` base).
- The user has standing authorization to push to `main` and deploy to Pages. Don't buy domains or publish packages.

## 10. Final report (to the user, in Portuguese)
Live URL; what was built; screenshots (390 px Home, Catálogo, Produto, Sacola, Admin); checks run and results (tests, axe, Lighthouse scores); what still uses stand-ins (business.ts pending items, stand-in photos, seed testimonials and Sobre text); known limitations, stated to the user only, never in the UI (localStorage is per device and browser, the PIN only prevents casual access until a real backend with authentication exists, about 5 MB of photo budget, WhatsApp number pending, so messages open the contact picker); and the next steps once Érika answers the open questions.
