# ÉKA Semijoias — website plan

Status: research and design direction done (2026-11-19). Implementation happens in a fresh session driven by `docs/IMPLEMENTATION_PROMPT.md`.
Inputs: `docs/research/audit.md` (reference audit), `docs/research/benchmarks.md` (premium jewelry patterns), `docs/mockups/` (chosen direction), `assets/brand/` (logo set).

**Goal.** The real ÉKA website (frontend-only, pre-production: GitHub Pages + stand-in photos) that Érika opens on her phone and immediately reads as a premium jewelry brand, clearly better than the Áthama reference. Every sale ends in **one well-formed WhatsApp message**. The catalog is editable by Érika from her phone (localStorage).

**Non-goals for this version.** Online payment, accounts, a backend, real shipping quotes, virtual try-on, SEO beyond the basics.

---

## Workstream 1 — Brand and design system

### 1.1 Color tokens (measured from the logo, contrast verified)
The metal ramp was measured from `docs/reference/logo-eka-*.jpg` (both files agree within 1 RGB unit): shadow `#976552` → mid `#B48C78` → highlight `#E6BEA4`; paper `#FAFBFA`. The UI uses a *warmer* paper so the page feels like ivory card stock, not screen white.

| Token | Hex | Role | WCAG check (ratio) |
|---|---|---|---|
| `--c-ivory` | `#FBF8F5` | page background | — |
| `--c-white` | `#FFFFFF` | cards, sheets, inputs | — |
| `--c-champagne` | `#F3E6DC` | soft surfaces, bands, product photo backdrop | — |
| `--c-line` | `#E7DAD0` | hairlines, dividers, input borders (decorative) | — (non-text) |
| `--c-rose` | `#B48C78` | **decorative accent only**: ornaments, stars, active underline, swatch "Rosé", focus ring on dark | 2.85 on ivory → **never text on light**; 5.39 on espresso (OK) |
| `--c-rose-light` | `#E6BEA4` | accent text and icons on espresso (footer) | 9.50 on espresso, AA |
| `--c-copper` | `#8A5A45` | primary buttons, links, selected chips, prices on promo | 5.47 ivory · 5.79 white · 4.73 champagne, AA; white text on it 5.79, AA |
| `--c-copper-dark` | `#7E4F3B` | hover/pressed of copper | white on it 6.84 |
| `--c-ink` | `#2B1D18` | body and heading text (espresso), footer background | 15.37 ivory · 13.29 champagne |
| `--c-ink-muted` | `#6F574D` | secondary text, captions, struck-through price, placeholders | 6.31 ivory · 5.45 champagne · 6.67 white |
| `--c-on-dark` | `#FBF8F5` | text on espresso | 15.37 |
| `--c-success` | `#3F6B4E` | saved / confirmed states | 5.80 ivory |
| `--c-danger` | `#9A3B2E` | errors, destructive actions | 6.53 ivory |

Rules: one accent per view. Rose gold is jewelry, not paint: hairlines, a 1 px ornament, the active state. Primary actions are copper. WhatsApp is **never bright green** in the UI. The WhatsApp glyph is shown in the current text color; the only green allowed is inside the official icon if Érika insists.

### 1.2 Typography
- **Display:** *Cormorant Garamond* 500/600 + 500 italic (one italic accent word per headline at most). It echoes the logo's high-contrast serif caps.
- **Body/UI:** *Jost* 400/500 (geometric, clean, excellent numerals for prices).
- **Script:** none in the UI. The logo's "Semijoias" script is the only script on the page. Exception: Érika's signature on Sobre, if desired, as an SVG of the word "Érika" (not a web font).
- Load with `@fontsource` (self-hosted, latin subset, `font-display: swap`). Preload the two display weights used above the fold. No Google Fonts CDN (privacy, extra DNS hops).
- Scale (mobile → ≥1024 px, `clamp()`): display-xl 40→64 / 1.05, display-l 32→48 / 1.1, display-m 26→34 / 1.15, title 20→22 / 1.3, body 16 / 1.6, small 14 / 1.5, micro 12 / 1.4 with 0.08 em tracking, uppercase (eyebrows, tags). Prices: Jost 500, `font-variant-numeric: tabular-nums`, formatted with `Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})`.
- Minimum 16 px on inputs (prevents iOS zoom). Line length 60–72 characters max.

### 1.3 Space, radius, elevation, motion
- 4 px base, 8 px rhythm: `4 8 12 16 24 32 48 64 96`. Mobile page gutter 20 px; desktop container max 1200 px, gutter 32 px.
- Radius: cards and images 12 px, buttons and chips 999 px (pill), sheets 20 px top corners, inputs 10 px.
- Elevation: almost flat. `--shadow-1: 0 1px 2px rgb(43 29 24 / .06), 0 4px 16px rgb(43 29 24 / .06)` for sheets and the sticky bar only.
- Motion: 160 ms (state), 240 ms (sheets, accordions), `cubic-bezier(.2,.7,.2,1)`. Image fade-in on load, card hover lift 2 px on desktop only. `@media (prefers-reduced-motion: reduce)` removes transforms and parallax and keeps opacity changes ≤ 120 ms.
- Touch targets ≥ 44×44 px. Focus ring: `2px solid var(--c-copper)` + 2 px ivory offset (rose on dark).

### 1.4 Iconography
A thin line icon set (1.5 px stroke, rounded caps), e.g. **Lucide** via `lucide-react` with tree-shaken imports. WhatsApp and Instagram glyphs are inline SVGs (Lucide has no brand icons). No emoji anywhere in the UI.

### 1.5 Logo usage (files in `assets/brand/`, see `assets/brand/README.md`)
- Header: `svg/eka-lockup-copper.svg` (flat, crisp at any size). Height 28 px mobile, 36 px desktop.
- Hero/footer/Sobre: metallic `eka-emblem-rosegold-transparent.png` (served as WebP 2x ≤ 600 px) on light; `svg/eka-emblem-white.svg` or the metallic transparent PNG on espresso.
- Favicon/app icons: `svg/favicon.svg`, `icons/*`, solid-ornament monogram (legible at 16 px).
- Clear space = the height of the "É" accent around every lockup. Never recolor the metallic PNGs, never place the metallic logo on photos without an ivory scrim.

### 1.6 Photography art direction (preview)
- **Product (cards, PDP image 1):** still-life, single piece, warm champagne paper/linen backdrop `≈#F3E6DC`, soft daylight from the upper left, gentle contact shadow, the piece filling ~60 % of a 4:5 frame, no props except an occasional fold of silk. Every product shot must share this setup; consistency is what reads as premium.
- **On skin (PDP image 2, hero, editorial):** ear, neck, collarbone, hand; warm natural light; close crops, no faces needed; diverse skin tones.
- **Preview sources:** AI-generated still-lifes (ChatGPT, prompt in IMPLEMENTATION_PROMPT §Imagery) as the default, plus the generated mockup-style hero. Every stand-in image is marked in the data only (`placeholder: true`). **Nothing in the UI calls them illustrative.** Real photos from Érika replace them through the admin.

---

## Workstream 2 — Information architecture and content (pt-BR)

### 2.1 Sitemap (HashRouter)
| Route | Page | Notes |
|---|---|---|
| `/#/` | Home | |
| `/#/catalogo` | Catálogo | `?categoria=brincos&acabamento=rose&ordem=menor-preco&q=gota&preco=0-150` (state in the URL, shareable) |
| `/#/catalogo/:categoria` | Category landing (same component, preset filter) | |
| `/#/produto/:slug` | Produto | |
| `/#/colecao/:slug` | Collection (curated list) | e.g. "rose", "presentes" |
| `/#/sacola` | Sacola | also a slide-over sheet from any page |
| `/#/favoritos` | Favoritos | localStorage |
| `/#/revendedoras` | Seja revendedora | pitch + pre-registration |
| `/#/como-cuidar` | Como cuidar das semijoias | |
| `/#/garantia` | Garantia e trocas | covered / not covered |
| `/#/sobre` | Sobre a ÉKA | Érika's story + showroom |
| `/#/contato` | Contato | WhatsApp, Instagram, showroom map link |
| `/#/admin` | Catalog admin | PIN gate |
| `*` | 404 "Peça não encontrada" | links back to Catálogo |

### 2.1b Voice and copy rules (apply to every visible string)
- This is the real ÉKA site, not a demo. Never write demo/demonstração, prévia/preview, exemplo, placeholder, "imagens ilustrativas", "não é segurança", or anything that reveals it is unfinished or was generated.
- The brand speaks as itself: "a gente", "nós", "nossas peças", "você" for the customer. **Never mention Érika in the third person** ("Fale com a Érika", "combine com a Érika", "Área da Érika"). Her name appears only on Sobre, in her own first person.
- No helper lines that sound like an outsider explaining the business ("Você confirma pagamento e entrega…").
- Unconfirmed facts are hidden or generic, never labeled as pending in public.

### 2.2 Global elements
- **Header (sticky, 56 px mobile):** menu (drawer) · centered lockup · search · bag (count badge). Desktop: logo left, nav center (Catálogo, Coleções, Revendedoras, Como cuidar, Sobre), search/favorites/bag right. A champagne announcement bar (editable in admin) holds one line.
- **Menu drawer (mobile):** categories with "a partir de R$ …", Coleções, Seja revendedora (highlighted), Como cuidar, Garantia, Sobre, Contato, Instagram/WhatsApp links.
- **Footer (espresso):** emblem, short promise, link columns, WhatsApp, Instagram, showroom city (if set), © ÉKA Semijoias.
- **WhatsApp FAB:** 52 px round, copper, bottom-right with safe-area inset. Hidden on `/admin`, while a sheet is open, and on Produto, where the sticky bar already contains the action.

### 2.3 Page specs (mobile first; desktop adapts)
**Home**
1. Hero: full-bleed 4:5 on-skin photo (mobile) / split 45/55 (desktop); headline "Brilho que acompanha *você*"; subline "Semijoias com banho de qualidade e acabamento impecável"; primary "Ver catálogo", secondary link "Seja revendedora".
2. Trust strip (3 items mobile, 4 desktop): Garantia de {6} meses · Pedido pelo WhatsApp · Envio para todo o Brasil {confirm} · Antialérgicas {confirm}.
3. Categorias: horizontal scroll of 4:5 tiles with the next tile peeking; label + "a partir de R$ X" computed from data.
4. Mais amadas: 2-col grid (4-col desktop) of `featured` products, "Ver todas".
5. Editorial collection block: full-width image, serif title, "Explorar coleção" (the featured collection, admin-selected).
6. Novidades: horizontal carousel of the newest 8 (by `createdAt`).
7. Reseller band (champagne): "Seja uma revendedora ÉKA", 2 lines, "Quero revender".
8. Como cuidar teaser: 3 tips + link.
9. Depoimentos: swipeable cards, 5 stars, first name + city (seed content written like real testimonials, no label; replace before go-live).
10. Instagram strip: 6 squares linking to the profile (static images; no embed or API).
11. FAQ (5 questions, accordion), then the footer.

**Catálogo:** title + count; search (debounced 150 ms, accent-insensitive: "anel" matches "Anéis"); category chips (horizontal scroll); "Filtrar" + "Ordenar" buttons opening bottom sheets. Filters: acabamento (Rosé, Dourado, Prateado, Ródio negro), faixa de preço (presets + min/max), only available, only on sale. Sort: Destaques (default, manual order), Novidades, Menor preço, Maior preço. Active filters as removable chips + "Limpar tudo". Grid of 24 + "Carregar mais", "Mostrando 24 de 86". Empty state: "Nenhuma peça encontrada" + clear filters + WhatsApp "Procurando algo específico? Fale com a gente". Back navigation restores filters (URL) and scroll position.

**Product card:** 4:5 image (second image on hover, desktop only), name (2 lines max), swatch dots for available finishes, price; promo shows the old price struck in `--c-ink-muted` and the new price in `--c-copper`; one tag max (Novo / Mais vendido / Esgotado); quick-add bag button (adds the default variant, toast "Adicionado à sacola · Ver sacola"); unavailable products show "Esgotado" and "Avise-me" (WhatsApp).

**Produto:** swipeable gallery (scroll-snap, dots, tap to open a fullscreen viewer with pinch-zoom); name; price/promo; finish selector (swatches with labels; changes the gallery and Ref.); size selector when the variant has sizes (rings 12–22, bracelets P/M/G); quantity; description; accordions: Detalhes da peça (material, banho, pedras, medidas, fecho, peso), Cuidados, Garantia; mini trust strip; "Ficou com alguma dúvida? Fale com a gente" WhatsApp block; "Complete o look" (same `collection` or category complement); "Ref. EKA-BR-001" small. **Sticky bottom bar:** price + "Adicionar à sacola" (primary) + WhatsApp icon button "Pedir agora" (a single-item message).

**Sacola** (sheet + page): line items (thumb, name, finish, size, stepper, remove with undo toast), subtotal, a note field, optional "Seu nome" and "Cidade" (persisted for next time), primary "Enviar pedido pelo WhatsApp". Message format:
```
Olá! Gostaria de fazer este pedido:

1) Brinco Gota Cristal — Rosé — 1 un. — R$ 129,90
2) Anel Solitário — Dourado — aro 16 — 2 un. — R$ 279,80

Total: R$ 409,70
Nome: Ana · Cidade: Campo Grande/MS
Obs.: é para presente
```
Built with `encodeURIComponent`, sent to `https://wa.me/<number>?text=…`; while the number is pending, `https://wa.me/?text=…` (WhatsApp asks which contact to send to, so ordering works end to end). The cart is **not** cleared automatically. After the WhatsApp tab opens, show "Pedido enviado? Limpar sacola". Guard: a message over ~1,800 characters triggers a compact format (no blank lines, abbreviated variants).

**Revendedoras:** hero (sample-case photo) "Renda extra com semijoias que vendem sozinhas" {copy draft}; how it works in 4 steps (Cadastro → Conversa e aprovação → Recebe o mostruário → Vende e recebe sua comissão); benefits (cards); commission table **{placeholder until Érika defines it; hidden when empty}**; FAQ (Preciso investir? Como funciona o consignado? Quanto ganho? Para onde vocês enviam?); a short form: nome*, WhatsApp* (mask `(99) 99999-9999`), cidade/UF*, Instagram, "Já revende?" (sim/não), "Como conheceu a ÉKA?", consent checkbox* ("Autorizo a ÉKA a entrar em contato pelo WhatsApp"). Submit = validate → save the lead in localStorage (visible in admin) → open WhatsApp with a pre-filled introduction. **Never ask for CPF, address or birth date.**

**Como cuidar:** 8 illustrated steps (own words): perfume and cream before the jewelry; take it off for showers, pool, sea and exercise; avoid chemicals; store separately in a pouch; clean with a dry flannel; avoid humidity; don't sleep with it; check clasps. Plus "Por que o banho escurece?" and a link to Garantia.

**Garantia e trocas:** period {6 meses — confirm}, what's covered (plating defects under normal use) vs not covered (stones that fall out, broken pieces, misuse, contact with chemicals), how to request (WhatsApp with order photo), exchanges policy {placeholder}.

**Sobre:** Érika's story {placeholder text}, values (curadoria, acabamento, atendimento próximo), showroom {city/address placeholder} with a map link, signature.

**Contato:** WhatsApp button, Instagram, opening hours {placeholder}, showroom, a simple "Mensagem rápida" that opens WhatsApp.

### 2.4 Content placeholders Érika must confirm (single source: `src/config/business.ts`)
WhatsApp number · Instagram handle · city/state and showroom address (or "atendimento online") · warranty period and terms · whether pieces are hypoallergenic/nickel-free · plating spec (e.g. "banho de ouro 18k, X milésimos") · shipping (todo o Brasil? Correios? retirada?) · payment methods (Pix, cartão, parcelamento) · reseller program (consignment? kit size? commission tiers? regions) · real product list, prices, photos · her story for Sobre · testimonials she can authorize. Until confirmed, each placeholder renders normally but is listed in `/#/admin → Configurações` with a "pendente" badge.

---

## Workstream 3 — Frontend architecture

- **Stack:** Vite + React 18 + TypeScript (strict). **Tailwind CSS v4** with tokens declared as CSS variables in `@theme`, so the same tokens feed Tailwind utilities and raw CSS. React Router (HashRouter: GitHub Pages has no SPA fallback). No UI kit; small hand-built primitives. Zustand (or a tiny context store) for cart, favorites and catalog, persisted through a single storage module. `lucide-react` icons. Vitest + Testing Library for logic, Playwright for e2e and screenshots.
  *Why not Next/Astro:* static hosting on Pages, no SSR needs, and the admin is fully client-side. A Vite SPA is the smallest complete solution.
- **Folder structure**
```
src/
  main.tsx, App.tsx, routes.tsx
  config/business.ts        # WhatsApp, Instagram, city, warranty, flags — all placeholders here
  styles/tokens.css, base.css
  lib/ format.ts (BRL), whatsapp.ts (message builders), slug.ts, search.ts (normalize), image.ts (resize/compress)
  data/ schema.ts (types + zod), seed.ts, storage.ts (versioned repo + migrations), useCatalog.ts
  store/ cart.ts, favorites.ts, ui.ts
  components/ ui/ (Button, IconButton, Chip, Sheet, Accordion, Input, Select, Toast, Badge, Price, Swatch, Stepper, Skeleton)
              layout/ (Header, MenuDrawer, Footer, AnnouncementBar, WhatsAppFab, Container, Section)
              product/ (ProductCard, ProductGrid, Gallery, Lightbox, VariantPicker, StickyBuyBar, CompleteTheLook)
              home/ (Hero, TrustStrip, CategoryRail, Editorial, ResellerBand, CareTeaser, Testimonials, InstagramStrip, Faq)
  pages/ Home, Catalog, Product, Collection, Bag, Favorites, Resellers, Care, Warranty, About, Contact, NotFound
  admin/ AdminGate, AdminLayout, ProductsList, ProductForm, ImageUploader, CategoriesManager, LeadsList, Settings, Backup
public/ brand/ (logo svgs/pngs), icons/, images/ (seed photos, WebP), 404.html? (not needed with HashRouter)
```
- **Performance budget** (Lighthouse mobile, simulated throttling): LCP ≤ 2.5 s, CLS ≤ 0.05, TBT ≤ 200 ms, initial JS ≤ 160 KB gzip (the admin is code-split: `React.lazy`), fonts ≤ 4 files / 120 KB, hero image ≤ 140 KB (AVIF/WebP, `fetchpriority="high"`, explicit width/height, preloaded), card thumbnails ≤ 45 KB each at 2x (WebP 480×600), lazy-loaded with `loading="lazy" decoding="async"`, plus `srcset` 240/480/960.
- **Images in seed data** live in `public/images/products/` as WebP at 480 and 960 widths. User-uploaded images (admin) are stored as data URLs in localStorage after client-side resize (see 4.4).

## Workstream 4 — Catalog management (localStorage)

### 4.1 Data model (`src/data/schema.ts`)
```ts
type Finish = 'rose' | 'dourado' | 'prateado' | 'rodio-negro';
interface ProductImage { id: string; src: string; alt: string; placeholder?: boolean } // src: /images/... or data:image/webp;base64
interface Variant { id: string; finish: Finish; sku?: string; sizes?: string[]; imageIds: string[]; available: boolean }
interface Product {
  id: string; slug: string; name: string; categoryId: string; collectionIds: string[];
  price: number;            // centavos (integer) — never floats for money
  promoPrice?: number;      // centavos, < price
  description: string;
  details: { material?: string; plating?: string; stones?: string; dimensions?: string; clasp?: string; weight?: string };
  images: ProductImage[]; variants: Variant[];
  available: boolean;       // master switch ("Disponível")
  featured: boolean; tags: ('novo'|'mais-vendido')[];
  order: number;            // manual sort ("Destaques")
  createdAt: string; updatedAt: string; // ISO
}
interface Category { id: string; slug: string; name: string; order: number; imageId?: string }
interface Collection { id: string; slug: string; name: string; description?: string; heroImage?: string; featuredOnHome: boolean }
interface ResellerLead { id: string; name: string; whatsapp: string; city: string; uf: string; instagram?: string; alreadySells: boolean; source?: string; createdAt: string }
interface Settings { announcement: string; whatsapp: string; instagram: string; city: string; warrantyMonths: number; pinHash: string }
interface CatalogState { schemaVersion: number; products: Product[]; categories: Category[]; collections: Collection[]; leads: ResellerLead[]; settings: Settings }
```
### 4.2 Storage
- One key per concern: `eka:catalog:v1` (CatalogState), `eka:cart:v1`, `eka:favorites:v1`, `eka:customer:v1` (name and city for the WhatsApp message). Every write goes through `storage.ts`: `JSON.stringify` → `try { localStorage.setItem }` catch `QuotaExceededError` (all browser variants: name or code 22/1014) → a typed `StorageResult` (`ok` | `quota` | `unavailable`). **Never a silent failure:** the admin shows a blocking toast "Espaço do navegador cheio (≈ X MB usados). Exporte um backup e remova fotos antigas." and the edit stays in the form (not lost).
- `schemaVersion` + `migrations: Record<number, (old) => new>` run on load, and on error fall back to seed **after** saving the broken payload to `eka:catalog:corrupt:<ts>` (recoverable via export).
- Storage meter in the admin (bytes used ≈ sum of key lengths × 2 / 5 MB budget), with warnings at 70 % and 90 %.
- Seed on first load (no key) → writes seed with `schemaVersion: 1`. Private mode / storage disabled → read-only, with an admin banner "Este navegador não permite salvar alterações (talvez esteja em modo anônimo)".
- Cross-tab: listen to the `storage` event and reload state, so a second tab never overwrites newer data (last-write warning in the admin if `updatedAt` changed underneath).

### 4.3 Admin (`/#/admin`)
- **Gate:** 4–6-digit PIN (default `2580`, changeable in Settings, stored as a SHA-256 hash). Gate copy: "Painel ÉKA" / "Digite seu PIN para entrar", with no disclaimers on screen. (Internal note, never shown: a client-side PIN only prevents casual access; real authentication needs a backend.) The session flag lives in `sessionStorage`.
- **Mobile-first layout:** top bar with sections (Produtos · Categorias · Coleções · Revendedoras · Configurações · Backup). Product list = cards with thumb, name, price, available toggle, featured star, drag handle (pointer events + up/down buttons as the accessible fallback), search and filter by category.
- **Product form (full-screen sheet on mobile):** name (auto slug, editable, unique), category, collections, price and promo (BRL mask; validation promo < price), description, details, finishes/variants (add finish → its photos, sizes, SKU, available), photos (upload, reorder, set main, alt text required with a suggested default "{nome} — {acabamento}"), available, featured, tags. Save / Save and new / Duplicate / Delete (confirm via an in-app modal, never `window.confirm`; then an undo toast).
- **Categories and collections:** CRUD + order. Deleting a category with products asks where to move them.
- **Leads:** list of reseller pre-registrations, "Chamar no WhatsApp", delete, export CSV.
- **Settings:** announcement bar text, WhatsApp, Instagram, city, warranty months, PIN; a neutral checklist "Complete as informações da loja" for the unconfirmed facts.
- **Backup:** Export JSON (`eka-catalogo-AAAA-MM-DD.json`, includes images); Import JSON (validate with zod, show a diff summary "32 produtos, 6 categorias", confirm, migrate); **Restaurar catálogo inicial** (confirm modal, export offered first).

### 4.4 Image upload pipeline
`<input type="file" accept="image/*" capture="environment" multiple>` → `createImageBitmap` (honors EXIF orientation) → draw on a canvas at max 1200 px on the long side → `canvas.toBlob('image/webp', 0.8)` (fallback `image/jpeg`, 0.82, on Safari versions without WebP encoding) → if > 180 KB, step quality down (0.7, 0.6) and then size (1000, 800) → data URL. Also generate a 480 px thumbnail for cards. Show the per-image size and the remaining budget. Budget: ~180 KB + ~40 KB per image ⇒ ~20 products × 1–2 photos fit in ~5 MB; the UI says so plainly. HEIC that fails to decode → clear message "Formato não suportado — envie em JPG ou PNG".

## Workstream 5 — Quality
- **Breakpoints verified:** 360, 390, 768, 1280, 1440 px (Playwright screenshots of every page at each width, plus manual review). Containers: mobile 1 column; ≥ 768 2–3 columns; ≥ 1024 desktop nav.
- **Accessibility:** semantic landmarks, one `h1` per page, skip link, labeled controls, `aria-live` region for toasts and cart count, sheets/drawers with focus trap and Esc, return focus on close, `aria-expanded` on accordions, alt text required in the admin, contrast per §1.1, `prefers-reduced-motion`, zoom to 200 % without loss. Target: Lighthouse a11y ≥ 95 and no axe violations of serious/critical severity (`@axe-core/playwright`).
- **Lighthouse targets (mobile):** Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90.
- **States:** skeleton cards while images load (fixed aspect ratio, no layout shift), empty catalog/search/favorites/bag, error boundary per route ("Algo deu errado — recarregar"), offline-friendly (everything is static), image error fallback (champagne tile with monogram).
- **Cross-browser:** Chrome Android and Safari iOS (WebKit via Playwright `iPhone 13` + Chromium `Pixel 7`). Check `100dvh`, safe-area insets, sticky bar above the home indicator, the iOS input zoom rule, and `wa.me` opening the app.
- **Link check:** every outbound link (WhatsApp, Instagram, map) comes from `business.ts`, and a test asserts they are well-formed.

## Workstream 6 — Repository and publishing
- Repo: `github.com/bipo01/eka-semijoias` (public), created in this planning session, holding research, brand, mockups and plan.
- The implementation session builds in the same repo, on `main` (the user has standing authorization to push to `main` and deploy).
- GitHub Pages via Actions: `.github/workflows/deploy.yml` (checkout → setup-node 22 → `npm ci` → `npm run build` → `actions/upload-pages-artifact` (dist) → `actions/deploy-pages`). Vite `base: '/eka-semijoias/'`. Enable Pages with source "GitHub Actions" (`gh api -X POST repos/bipo01/eka-semijoias/pages -f build_type=workflow`, or PUT if it exists).
- Live URL: `https://bipo01.github.io/eka-semijoias/`.

---

## Implementation phases (each ends with a visual checkpoint against `docs/mockups/`)

| # | Phase | Deliverables | Acceptance |
|---|---|---|---|
| 1 | Scaffold + tokens | Vite/React/TS/Tailwind, tokens.css, fonts, lint/typecheck/test scripts, the Pages workflow (deploy early) | `npm run build` passes; a tokens demo page renders; the Pages URL serves the shell |
| 2 | Layout shell | Header, menu drawer, footer, announcement bar, FAB, routes with placeholders, 404 | Keyboard-navigable; header matches the mockup at 390 and 1440 |
| 3 | Home | All Home sections with seed data | Side-by-side screenshot vs `mockups/home-mobile.png` / `home-desktop.png`; no CLS |
| 4 | Catálogo + Produto | Grid, filters/sort sheets, URL state, load more, PDP with gallery, variants, sticky bar, accordions | Filter combinations tested; back restores state; PDP matches the mockup |
| 5 | Sacola/WhatsApp | Cart store, sheet, page, message builder + unit tests | Message snapshot tests; totals in centavos exact; opens `wa.me` |
| 6 | Revendedoras + Como cuidar + Garantia + Sobre + Contato | Pages, lead form + validation | Form errors announced; lead saved and visible in the admin |
| 7 | Admin/localStorage | Gate, CRUD, image pipeline, reorder, backup/import/reset, quota handling | Quota error simulated in a test shows the message; import of an exported file round-trips |
| 8 | Imagery + content polish | Final seed photos (WebP sets), copy review in pt-BR, placeholders flagged | No broken image; every image has alt; copy has no typos |
| 9 | QA pass | Playwright screenshots 360/390/768/1280/1440, axe, Lighthouse | Targets in §5 met or deviations explained |
| 10 | Deploy | Push to `main`, Actions green, live URL checked on mobile emulation | Live URL returns 200 and renders Home, Catálogo, Produto, Admin |
