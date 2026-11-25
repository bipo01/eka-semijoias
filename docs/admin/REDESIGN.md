# Painel ÉKA — redesign (2026-11-25)

Owner feedback: the panel looked diffuse and mixed together, with no colors or lines separating content; the 11-pill tab strip was confusing; there was no home (it opened on Pedidos); Revendedoras was plain and confusing. Wanted: maximum ease, short texts, little scrolling (tabs), beautiful and on-brand.

Process: screenshots of every admin route (QA capture) went to ChatGPT, which wrote the direction ("quiet luxury meets operational clarity") and drew the mockups; every photo in the panel was generated there too.

- Mockups: `docs/mockups/admin-inicio-chatgpt.jpg`, `docs/mockups/admin-revendedoras-chatgpt.jpg`.
- Photos: `assets/images/source/admin/*.jpg` (ChatGPT originals) → `node scripts/admin-images.mjs` → `public/images/admin/*.webp`.

## Navigation
- Phone/tablet (< 1024 px): bottom bar Início · Pedidos · Revenda · Produtos · Mais (`src/admin/nav.ts`, `BOTTOM_BAR`). "Mais" (`/admin/mais`) lists every area in groups, plus Ver o site, Instalar o Painel, Sair.
- Desktop: espresso sidebar (248 px) with the same groups: Vendas (Pedidos, Clientes, Revendedoras, Relatório) · Catálogo (Produtos, Estoque, Categorias) · Loja online (Site, Mensagens) · Ajustes (Configurações, Backup).
- `/admin` opens Início. Each page keeps one `h1` with its name (Início's is visually hidden).

## Visual language (`src/admin/ui.tsx`)
- Cards: 16 px radius, 1 px `line` border, soft shadow (`CARD`). Related fields share one card with inner dividers.
- Pills with meaning (`Pill`): amber = waiting (em negociação, repasse avisado), blue-grey = confirmed / informative, green = paid / active, red = late / owed / cancelled, champagne = neutral. Tints live in `tokens.css` (`*-tint`, `warning`, `info`, `espresso`, `cocoa`).
- Sub-views use tabs (`Tabs`: segmented, or `variant="underline"` for five tabs on a phone). Pills stay for filters.
- Display font (Cormorant 600) for titles and hero numbers; Jost for data. `price` uses lining figures.
- Empty states: picture, title, one sentence, one action (`Empty`).

## Início (`src/admin/sections/HomePage.tsx`)
Greeting and date → month sales hero (photo per ratio: 2:1 phone, 3:1 wide) → Hoje na loja → Precisa de você (repasse avisado, acerto atrasado/próximo, comprovantes, pedidos em negociação, fichas novas, repasse a receber, peças esgotadas, dados da loja; most urgent first; "Tudo em dia" when empty) → Ações rápidas (`/admin/pedidos?novo=1`, `/admin/produtos/nova`, `/admin/estoque?entrada=1`, `/admin/revendedoras?nova=1`) → Revendas → Sua vitrine.

## Revendedoras
Network summary (ativas, em maletas, vendido no ciclo, a receber) → tabs Revendedoras · Fichas · Programa → cards (avatar, status, na maleta / vendido, pieces progress, due pill, repasse notes). A reseller opens with tabs Resumo · Maleta · Vendas · Acertos · Dados; Resumo spells out the commission: total sold − commission **of the reseller** = what ÉKA receives. Opens on Acertos while a repasse waits. Links: `?aba=fichas|programa`, `?r=<id>`, `?nova=1`.

## Detail pages, never layers (2026-11-25, second pass)
- Every detail is a route rendered inside the panel (`src/admin/DetailPage.tsx`): the sidebar/bottom bar stay, the header turns into "← <parent>" + the title. Routes: `/admin/produtos/<id>`, `/admin/pedidos/<número>`, `/admin/clientes/<id>`, `/admin/revendedoras/<id>`, `/admin/estoque/<peça>`, `/admin/mensagens/<tipo>`, `/admin/site/<seção>`. Old query links (`?pedido=`, `?cliente=`, `?r=`, `?secao=`) redirect to them, so phone notices keep working.
- The list stays mounted (hidden) behind its detail, so filters and search survive; `useListPlace` brings the scroll back.
- Forms with unsaved edits (piece, site section) ask before leaving through the sidebar or "Voltar" (`useBlocker`).
- Actions stay sheets (Novo pedido, Cobrar, Maleta, Acerto, Nova cliente…): they are steps, not places.
- Sub-tabs never move the page: Revendedoras keeps the network summary and "Nova revendedora" on every tab, a skeleton holds the summary's place while loading, and `scrollbar-gutter: stable` keeps every page at the same x whether it scrolls or not.

## Loader
`src/components/ui/Loader.tsx` (CSS in `base.css`, `.eka-loader-*`), designed in ChatGPT as inline SVG: **brilho** (a gem draws itself, a sparkle orbits; default), **colar** (a pendant swings; people: resellers, customers, the reseller panel), **pérolas** (three pearls breathe; compact spots). Always above a short "Carregando …" text; fades in after 180 ms so quick loads never flash; reduced motion = a gentle pulse. Used for every loading state of the panel, the reseller panel and the store's catalog gate.
