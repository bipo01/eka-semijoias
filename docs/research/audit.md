# Reference audit — Áthama Semijoias Consignadas

Audited 2026-11-19 with Claude in Chrome (logged-in Instagram) and headless Chrome via Playwright for true 390 px mobile captures.
The reference is a **feature and content baseline only**. ÉKA must not reuse Áthama's name, photos, copy or branding.

## 1. What was opened

| Surface | URL | Status |
|---|---|---|
| Instagram profile, bio, grid | instagram.com/athamasemijoias | Opened (logged in) |
| Highlights: Clientes, Revendedoras, Como Cuidar, Loja Virtual, **Garantia** (fifth highlight, not in the original screenshot) | instagram.com/stories/highlights/… | Opened; the first 3–10 frames of each were viewed |
| Linktree | linktr.ee/athamasemijoia | Opened. Links: reseller form, online catalog, WhatsApp ("Fale conosco", wa.me short link) |
| Online catalog | athama.semijoias.net | Opened: grid, filters, image modal, cart. It is a white-label SaaS catalog ("semijoias.net") |
| Reseller pre-registration | athama.semijoias.net/querorevender | Opened (read only; nothing submitted) |
| Old "Loja Virtual" shown in the highlight | athamasemijoias.com.br | **Dead**: the domain no longer resolves (DNS returns nothing; Chrome shows an error page) |
| Catalog checkout ("Enviar Carrinho") | — | **Not exercised**: it sends an order to a real business. Only the cart page was inspected |

Screenshots are in `docs/research/screens/` (`*-mobile.jpg` = 390×844 CSS px at DPR 3, Playwright; `*-desktop.jpg` = 1440×900, Playwright; `*-full.jpg` = full page where the page scrolls; `ig-*`, `catalog-cart-*` and `catalog-image-modal-*` = logged-in desktop Chrome). The catalog and reseller pages have no `-full` capture because their content scrolls inside a nested container (audit item 15).

## 2. Feature and content inventory

| # | Feature or content (reference) | Verdict for ÉKA | Our version |
|---|---|---|---|
| 1 | Bio: "Semijoias e presentes que encantam", showroom city, reseller call to action | **Keep, improve** | A hero promise and a showroom block with the city as a placeholder, plus a reseller CTA band on Home |
| 2 | Linktree with 3 links | **Replace** | The site itself becomes the bio link. `/#/links` is optional (a mobile link-in-bio page in the ÉKA style) |
| 3 | Catalog: search by code or description, category filter (Anel, Bracelete, Brinco, Choker, Colar, Conjunto, Corrente, Escapulário, Outros, Piercing, Pulseira, Tornozeleira), metal filter (Aço, Aço Dourado, Couro, Grafite, Moeda Antiga, Ouro, Prata, Prata 925) | **Keep, improve** | Search plus category chips, a metal/finish facet, a price facet and sort, all in a bottom-sheet filter drawer on mobile. A smaller, curated taxonomy (see PLAN §2) |
| 4 | Product card: photo, name, "Categoria: Brinco - Prata", **internal code** (BR4929S), copy-link icon, wishlist heart, price, green "Adicionar ao carrinho", "Provador Virtual" link | **Improve** | Image (4:5), name, finish swatches, price (+ promo). The code moves to the product page as small print ("Ref."), since resellers use it. Quick-add stays. Wishlist "Favoritos" in localStorage |
| 5 | Gold and silver versions listed as **separate products** (BR4928G / BR4929S side by side) | **Fix** | One product with **variants** (finish: Dourado / Prateado / Ródio negro…), each with its own photo and optional code |
| 6 | No product detail page (clicking opens a bare image modal) | **Add** | A full product page: gallery, variants, size, materials/plating, care, warranty, "Pedir pelo WhatsApp", related pieces |
| 7 | Cart → "Enviar Carrinho" (payment and pickup arranged with the seller) | **Keep the model, change the channel** | Sacola → one pre-filled WhatsApp message listing every item (name, finish, size, quantity, unit price, total) + optional name/city/notes |
| 8 | "Minhas Compras" (order history behind a login) | **Drop** | No accounts in the preview |
| 9 | "Provador Virtual" (try-on) | **Drop for now** | Out of scope; possible later idea |
| 10 | Floating WhatsApp button | **Keep, refine** | A smaller FAB that never covers the sticky CTA or cards; hidden on admin and while the bag is open |
| 11 | Reseller page: consignment kit, 25–40 % tiered commission, support, training, 6-month warranty | **Keep the structure, Érika's terms** | Pitch → how it works (4 steps) → benefits → FAQ → short pre-registration. **Commission tiers, kit and consignment are placeholders until Érika confirms** |
| 12 | Reseller form asks CPF, birth date, full address and CEP **up front** | **Fix (friction, LGPD)** | Ask only name, WhatsApp, city/UF, Instagram (optional), "já revende?" and consent. CPF and address come later, privately, over WhatsApp |
| 13 | Highlight "Como Cuidar": 6 numbered tips (avoid chemicals, perfume, water/pool/sea, store separately, clean with a dry flannel…) | **Keep, rewrite** | A "Como cuidar" page with an illustrated 6–8 step guide in our own words + a short care block on every product page |
| 14 | Highlight "Garantia": 6 months on plating, excluding stones and misuse | **Keep, confirm** | A warranty block (period = placeholder) on the product page, the FAQ and the footer trust bar |
| 15 | Highlight "Clientes": customer selfies wearing the pieces | **Keep** | A "Clientes ÉKA" UGC strip + testimonials (placeholder content, clearly marked) |
| 16 | Highlight "Revendedoras": WhatsApp screenshots of reseller feedback and sales | **Adapt** | Testimonial cards in clean type, never raw chat screenshots |
| 17 | Product range and pricing: earrings to necklaces, R$ 39,90–159,90 on page 1; 43 pages × 20 ≈ 860 SKUs; gold-plated 18k, silver-plated, stainless steel | **Benchmark** | Seed ~24 demo products, R$ 49–289. Real prices from Érika |
| 18 | Seasonal campaign posts (Natal, Amigo Secreto, Dia das Mães), birthday post ("5 anos") | **Adapt** | Home "Coleções" can hold a seasonal collection that Érika toggles in the admin (a featured category) |

## 3. What is bad or ugly, and the fix in ÉKA

### Visual and brand
1. **The brand falls apart off Instagram.** The logo is navy and gold, but the catalog uses a black Bootstrap navbar with **bright green** buttons and cart pill, and the reseller page uses a **saturated royal blue** background with Times-like default serif. → One design system from the ÉKA logo across every page (ivory, rose-gold/copper, espresso ink).
2. **The name is inconsistent**: "Áthama" vs "Athama" (catalog header and title). → Brand strings live in one config file; "ÉKA" always carries its accent.
3. **No logo in the catalog header** (plain text "Athama Semijoias"). → A horizontal ÉKA lockup in the header and the emblem in the footer and favicon.
4. **Emoji used as typography** on the reseller page (✨💎💰🚀🌟💙) and a stray highlight artifact on the title. → Thin-line icon set (1.5 px stroke) and a typographic hierarchy.
5. **Highlight covers are all identical** (same butterfly), so you can't tell them apart. → Not our website, but the plan recommends distinct, on-brand covers for Érika's Instagram (bonus deliverable, optional).
6. **Product photos are decent** (a consistent beige display bust on marble) but cropped square at small size with metadata noise underneath. → 4:5 cards, more air, name + price only.

### UX
7. **On mobile the first product starts ~550 px down**, after a 6-line instruction paragraph and 4 stacked controls. → Catalog header ≤ 1 line + search + a horizontally scrolling chip row; the first product row is visible above the fold at 390×844.
8. **Filters are two native selects plus a separate "Filtros" button.** → Category chips + one "Filtrar e ordenar" bottom sheet (finish, price, availability, sort), with the active filter count and "Limpar".
9. **Numbered pagination 1…43** on a phone. → "Carregar mais" (+24) with the count ("Mostrando 24 de 86") and scroll position kept on back navigation.
10. **Internal codes and "Categoria: Brinco - Prata" on every card.** → Hidden from cards; shown as "Ref." on the product page.
11. **No product page**: no description, material, size, plating, care or warranty at the point of decision. → A full product page (PLAN §2).
12. **Duplicate cards for each metal color.** → Variants.
13. **Cart is a desktop table** (Produto / Valor Unitário / Quantidade / Valor Total / Observações) that squeezes on mobile; vague copy ("O valor acima…" while the total sits above). → Stacked item cards, a quantity stepper, a clear total, a single primary CTA "Enviar pedido pelo WhatsApp".
14. **The WhatsApp FAB overlaps product cards and buttons** on mobile. → Safe-area-aware FAB, hidden when a sticky CTA bar is visible.
15. **Nested scroll container** (the page body does not scroll; a full-page capture equals the viewport). That breaks iOS status-bar tap-to-top, address-bar collapse and scroll restoration. → Natural document scrolling.
16. **Reseller form is long and invasive** (CPF, birth date, full address before any contact). → A short pre-registration + WhatsApp hand-off (see #12 above).
17. **A dead link is still promoted** ("Loja Virtual" highlight → athamasemijoias.com.br doesn't resolve). → All outbound links come from one config. The plan includes a link check in QA.

### Performance (measured, Playwright + system Chrome, 390×844)
18. **Catalog page 1: 51 requests, ~3.4 MB, ~3.3 MB of it images** for 20 products. The images are much larger than their display size. → Responsive WebP/AVIF thumbnails (`srcset`, ≤ 60 KB per card at 2x), lazy-loaded below the fold, with explicit `width`/`height` (no layout shift).
19. Load 3.2 s / LCP ≈ 1.3 s on a fast desktop connection, so mid-range Android on 4G will be noticeably worse. → Budget in PLAN §3: LCP < 2.5 s on throttled "Fast 4G / mid-tier mobile" in Lighthouse.

### Accessibility
20. Icon-only links with no accessible name (WhatsApp FAB, copy-link icon, heart); images without `alt`; filter selects labeled only by placeholder text; white on bright green buttons is borderline. → Every control gets an accessible name, every product image gets meaningful `alt` (name + finish), visible focus rings, AA contrast verified (PLAN §1).

### Trust
21. No visible warranty, materials, plating or shipping info at the point of purchase (warranty only lives in an Instagram highlight); no "sobre" story; no address/CNPJ; no policy for exchanges. → A trust bar (Garantia · Banho de qualidade · Antialérgico [if true] · Envio para todo o Brasil [if true]), a Sobre page and an FAQ. Every claim is a **placeholder until Érika confirms it**.

## 4. Tone and business takeaways
- Warm, close and feminine; the audience is women aged ~25–55 in a mid-size city. "Amiga" register in the reels, aspirational "liberdade financeira" for resellers.
- Selling happens over WhatsApp and DM. Payment and delivery are arranged by chat, so the site's job is **desire → a well-formed WhatsApp order**, not online checkout.
- The reseller program is half the business. It deserves its own first-class page and a Home band, not a footnote.
- ÉKA should feel calmer and more premium: fewer exclamation marks, no emoji in the UI, and copy that sells the piece (material, finish, how it sits) rather than the discount.
