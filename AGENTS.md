# ÉKA Semijoias — project guide

The real website of **ÉKA Semijoias** (frontend-only, pre-production: GitHub Pages + stand-in photos) (Brazilian semi-fine jewelry, owner Érika). Sales close over WhatsApp; the catalog is managed by Érika from her phone and persisted in localStorage. No backend.

## Status
- Planning done (2026-11-19): `docs/PLAN.md` (the spec), `docs/IMPLEMENTATION_PROMPT.md` (build brief), `docs/mockups/` (chosen direction), `docs/research/` (reference audit + benchmarks), `docs/PERGUNTAS_ERIKA.md` (open business questions).
- The site is not implemented yet. When it is, update this file with the real scripts and structure.

## Ground rules
- UI copy in Brazilian Portuguese; code, comments and commits in English.
- Voice: this is the real site, not a demo. No "demonstração/prévia/exemplo/placeholder/ilustrativa/não é segurança" in the UI. The brand speaks as itself ("a gente", "nós"); never mention Érika in the third person (her name only on Sobre, in first person). See `docs/PLAN.md` §2.1b.
- Stack (planned): Vite + React + TypeScript + Tailwind v4 (CSS-variable tokens) + HashRouter, deployed to GitHub Pages via Actions (`base: '/eka-semijoias/'`).
- Unconfirmed business facts (WhatsApp, Instagram, city, warranty, plating, shipping, payment, reseller terms) live only in `src/config/business.ts`, marked pending. Never hard-code them elsewhere, never present them as confirmed.
- Design tokens: the exact hex values and contrast results are in `docs/PLAN.md` §1.1. Rose gold `#B48C78` is never used for text on light backgrounds.
- Brand files: `assets/brand/` (read its README; the header uses `svg/eka-lockup-copper.svg`). Stand-in photos: `assets/images/` (AI-generated; tracked with `placeholder: true` in data only, never labeled in the UI).
- Never use the reference brand's (Áthama) name, photos or copy.
- Money is integer centavos; format with `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Storage writes must surface quota/unavailable errors; never fail silently.

## Tools
- `tools/brand/`: palette extraction, recolor, tracing and SVG rendering scripts used to build the logo set (Python with Pillow/NumPy, potrace, Playwright). Not part of the site build.
- `tools/research-capture.js`: the Playwright script that captured the reference screenshots.
