# QA evidence (2026-11-19)

- `<page>-<width>.jpg`: full-page screenshots of every route at 360, 390, 768, 1280 and 1440 px (regenerate with `QA_SCREENS=1 npx playwright test e2e/qa-screens.spec.ts --project=desktop-chromium`). The Sacola shots include two seeded items; the admin shots show the PIN gate.
- `final-*.png` / `final-overview.jpg`: the live site (https://bipo01.github.io/eka-semijoias/) at 390 px — Home, Catálogo, Produto, Sacola and the admin product list.
- `lighthouse/*.report.html`: Lighthouse 12 mobile reports of the live site.

| Page (mobile) | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Home | 98 | 100 | 100 | 100 | 2.0 s | 0 | 40 ms |
| Catálogo | 97 | 98 | 100 | 100 | 2.4 s | 0 | 50 ms |
| Produto | 95 | 98 | 100 | 100 | 2.7 s | 0.001 | 40 ms |
| Revendedoras | 95 | 100 | 100 | 100 | 2.8 s | 0 | 30 ms |

Automated checks: `npm test -- --run` (94 unit tests), `npm run e2e` (93 Playwright tests on Pixel 7 + desktop Chromium: banned-words/voice check on every public route, axe WCAG 2.1 AA with no serious/critical violations on every public and admin route, one h1 and no horizontal overflow, bag → WhatsApp message, URL filters + back navigation, reseller form validation and lead storage, admin PIN/edit/360 px). The same e2e suite passed against the live URL.
