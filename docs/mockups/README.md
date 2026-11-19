# Mockups — chosen direction

Generated with ChatGPT image generation on 2026-11-19 from the ÉKA logo files and the palette in `docs/PLAN.md` §1.1.
**They guide layout, hierarchy and mood. The build must be clean code, not pasted images.** Treat text sizes, spacing and image ratios here as approximate: the spec in PLAN.md wins wherever they disagree.

| Final | Screens | Rounds |
|---|---|---|
| `home-mobile.png` | Home top (header, hero, trust bar) · middle (categories, Mais amadas, Coleção Rosé, reseller band, FAB) · bottom (FAQ, testimonial, Instagram, footer) | 2 (`rounds/r1-home-mobile.png` → `r2`) |
| `home-desktop.png` | Home at 1440 px: announcement bar, nav, split hero, trust strip, categories, 4-col grid, reseller band | 1 |
| `catalog-product-mobile.png` | Catálogo grid with chips/Filtrar/Ordenar · Produto top (gallery, price, finish swatches, sticky actions) · Produto details (accordions, trust, Complete o look) | 1 |
| `bag-resellers-mobile.png` | Sacola sheet → WhatsApp · Revendedoras hero + "Como funciona" timeline · benefits + pre-registration form | 1 |
| `admin-mobile.png` | PIN gate · product list (storage meter, toggles, star, drag) · edit product sheet | 1 |

The screens after Home were generated with the approved Home as the style reference and accepted on the first pass. They match the language, so more rounds would have added cost without new information.

## Adopted
- Warm ivory canvas, champagne surfaces, copper primary buttons, espresso text and footer; rose gold only as an accent.
- High-contrast serif headings (→ Cormorant Garamond) + clean sans UI text (→ Jost); an italic accent word in the hero ("*você*").
- Slim header with the centered lockup on mobile, left-aligned on desktop; a hairline under the header.
- Hero: on-skin editorial photo, headline over a soft ivory gradient, primary "Ver catálogo" + underlined "Seja revendedora".
- A 3-item trust bar right under the hero (4 on desktop).
- Categories as 4:5 rounded tiles with a peek of the next tile, plus "a partir de R$".
- Product cards: still-life on champagne, name, finish swatch dots, price, promo with a struck price, quick-add bag button, one "Novo" tag.
- Editorial "Coleção Rosé" block; the champagne reseller band with the gift-box image.
- Product page: big gallery with a peek of the on-skin second image, dots, serif name, finish swatches with labels, accordions with label:value rows, trust strip, "Complete o look".
- Sacola as a bottom sheet with steppers, note/name/city and one copper WhatsApp CTA + the helper line "Você confirma pagamento e entrega direto com a Érika".
- Revendedoras: sample-case hero, a 4-step vertical timeline with a rose line, benefit cards, a short form with a Sim/Não segmented control and consent.
- Admin: PIN keypad with the honest demo note, storage meter, list rows with availability toggle, featured star and drag handle, full-screen edit sheet with photo strip, price + promo, finish chips, switches, sticky Excluir/Salvar.

## Rejected or corrected in the spec
- **Product page sticky area uses two stacked rows** (stepper + add, then WhatsApp) and eats about 150 px of a phone screen → one 64 px bar: price · "Adicionar à sacola" · WhatsApp icon button. The quantity stepper moves into the page body.
- **Image ratios drift** (some cards render ~4:3) → every card and tile is strictly 4:5 (`aspect-ratio: 4/5; object-fit: cover`).
- **Category "a partir de R$ 59" text is ~9 px** → minimum 12 px micro text.
- **"PROMOÇÃO" pill crowding the price** → promo is shown by the struck price only. The optional tag sits on the image corner.
- **Header lockup too large in round 1** (fixed in r2) → 28 px tall on mobile.
- **Claims that are not confirmed** ("Garantia de 6 meses", "Envio para todo o Brasil", "Peças antialérgicas", "Parcelamento em até 6x") → rendered from `business.ts` placeholders, hidden when not set.
- **Desktop mock shows the domain `ekasemijoias.com.br`** → not owned. The preview lives on GitHub Pages; buying a domain is Érika's decision.
- **Footer emblem drawn by the generator** → use the real `assets/brand` files.
- **Mockup photos (the model's face, products)** are illustrative → the preview uses the generated product set in `assets/images/` (same art direction) and on-skin crops without faces where possible.
