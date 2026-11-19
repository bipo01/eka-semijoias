# ÉKA Semijoias — brand asset set

Source: Érika's logo (`docs/reference/logo-eka-square.jpg`, 992×1056, and `logo-eka-wide.jpg`, 1920×1080; both soft and slightly blurry).
Recreated with ChatGPT image generation on 2026-11-19, then color-corrected and vectorized locally (`tools/brand/`).

## Honest resolution note
- ChatGPT's maximum output here was **1254×1254 px** (emblem, monogram) and **2172×724 px** (horizontal lockup), not 4K.
- **Fix applied:** the flat versions were traced to SVG with potrace (`svg/`) and rendered to **3840 px PNGs** (`png/*-3840.png`). Those are true 4K, because they come from vectors.
- The **metallic** (rose-gold, shaded, crystals) versions are still raster at the native ChatGPT resolution. That is enough for the web (largest display ≈ 300 CSS px → 600 px at 2x). For print or 4K metallic artwork, the next step is an AI upscale (e.g. Real-ESRGAN 4x, then a manual check) or a designer redrawing the ornament in vector. **None of the files is claimed to be a 4K metallic master.**

## Fidelity review vs the original
| Element | Result |
|---|---|
| Letters É K A, acute accent | Faithful |
| Crystal leaf ornament between É and K | Faithful in the emblem. In the lockup and monogram it is slightly **larger, with bigger crystals** (accepted: reads better at small sizes) |
| Pendant charm in the A | Faithful (ball pendant under the crossbar) |
| "Semijoias" script | Spelled correctly, same style |
| Double circle frame + triple dots ×4 | Faithful; outer ring has a slight hand-drawn wobble, like the original |
| Color | ChatGPT drifted to a saturated orange copper (`#C4794D` median). **Corrected** with a luminance gradient map back to the original's dusty rose-gold ramp (`#976552 → #B48C78 → #E6BEA4`), see `tools/brand/brand.py recolor` |
| Flat traces | Crystals become small negative shapes (speckle) at large sizes. The solid monogram (`favicon.svg`, `eka-monogram-solid-currentcolor.svg`) fills them for ≤ 48 px use |

## Files
| File | Use |
|---|---|
| `eka-emblem-rosegold-white.png` | Metallic circular emblem on white (1254²): social, print proofs |
| `eka-emblem-rosegold-transparent.png` | Metallic emblem, transparent: footer, Sobre, splash (works on ivory and espresso) |
| `eka-lockup-rosegold-transparent.png` | Metallic horizontal lockup (2172×724), transparent: desktop hero accents, email/social |
| `eka-monogram-rosegold-ivory.png` | Metallic ÉK monogram on ivory: Instagram avatar, WhatsApp Business photo |
| `svg/eka-{emblem,lockup,monogram}-{rosegold,copper,espresso,white,currentcolor}.svg` | Flat single-color vectors. **Header = `eka-lockup-copper.svg`**; on dark = `-white` |
| `png/*-3840.png` | 4K renders of the flat SVGs |
| `svg/favicon.svg`, `icons/favicon-{32,180,192,512}.png`, `icons/apple-touch-icon.png`, `icons/icon-maskable-512.png` | Favicon, PWA and app icons (solid monogram) |
| `source/chatgpt-*.png` | Untouched ChatGPT outputs (kept for traceability) |

Colors used in the vectors: rosegold `#B48C78`, copper `#8A5A45`, espresso `#2B1D18`, white `#FFFFFF`.
