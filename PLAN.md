# PerfectMarkD — Project Plan

A platform-independent web app that turns markdown into perfectly laid-out PDFs. Born from the [Advanced PDF Export](https://github.com/ShrekBytes/advanced-pdf-export) Obsidian plugin; the tested engine is ported, the platform is new.

Glossary: [CONTEXT.md](CONTEXT.md) · Decisions: [docs/adr/](docs/adr/) · Tickets: [.scratch/](.scratch/)

## 1. Product

Drop-in editor, no signup, straight to work — excalidraw's simplicity applied to document layout. One rendering engine drives three paths:

```
                 ┌─────────────────────────────────────────────┐
markdown ──▶ packages/core (markdown-it → KaTeX → Shiki → mermaid │
                 │   → paginator → page layout → export HTML)    │
                 └──────────────┬──────────────┬─────────────────┘
                                │              │
              preview (Paper Canvas)      hidden export HTML
                                   ┌──────────┴───────────┐
                                   │ Client Export:       │ Server Export (paid):
                                   │ window.print() on    │ Playwright Chromium loads
                                   │ hidden iframe        │ /export route → Page.pdf()
                                   │ (free, no account)   │ → pdf-lib bookmarks
                                   └──────────────────────┘
```

Preview, client print, and server PDF are pixel-identical by construction (ADR-0003). This is the product's core promise: **what you see is exactly the PDF you get** — paginated tables, split code blocks with highlighting preserved, page numbers, frames, backgrounds.

### Tiers

| | Free | Pro — 3 USDT/mo | Premium — 7 USDT/mo |
|---|---|---|---|
| Account | none | required | required |
| Client Export (print dialog) | ✓ | ✓ | ✓ |
| Server Export (one-click PDF) | never | 300/mo | 1000/mo |
| Pages per server export | — | 300 | 1000 |
| Custom page size | — | ✓ | ✓ |
| Custom stylesheet | — | ✓ | ✓ |
| Header/footer banner images | — | ✓ | ✓ |
| Background image | — | ✓ | ✓ |
| Custom fonts (load/upload) | — | ✓ | ✓ |
| Priority render queue | — | — | ✓ |
| Export History (30 days) | — | — | ✓ |

- All core styling is free: presets, typography, colors, code themes, header/footer *text*, page numbers, page frame, mermaid, math, outline. No watermarks anywhere.
- Durations: 1 / 3 / 6 / 12 months; 12 months costs 10× (two months free). Prices editable in admin settings.
- No public API on any plan (non-goal).

### Billing (ADR-0005)

Manual crypto: **USDT-TRC20, USDT-BEP20, Litecoin**, static wallet addresses. Flow: pick plan + duration → create account → Order created with Reference Code + exact amount + wallet addresses → user sends crypto → submits txid/network/amount in-app → Order sits pending → Admin verifies on-chain in `/admin` → Entitlement granted (1/3/6/12 months or custom expiry). Nothing auto-renews.

### Privacy posture

Server Export payloads are processed in memory and deleted immediately after rendering — never written to disk, never logged. The single exception is Premium Export History: PDFs kept 30 days, encrypted at rest, auto-purged. Client Exports never touch the server. No cookies beyond the login session. Analytics: self-hosted Umami, served at `/analytics` on the app's own origin, anonymous counts only — page views plus four clicks (Client Export, Server Export, upgrade-modal open, plan select). No address is ever stored: Umami hashes it into a session id, and the only location ever derived is an approximate country. No personal data. No third-party requests from the editor, the preview, exports, or fonts (self-hosted); AI Actions are the deliberate exception — paid, disclosed at the point of use, switchable off (ADR-0009). Transport is the other exception: the deployment is published through a Cloudflare Tunnel, so requests — and the export payloads among them — traverse Cloudflare's edge, which terminates TLS (ADR-0010). That is infrastructure in the path, not an analytics or tracking service, and the Privacy page states it rather than leaving it implied.

## 2. Design language

**Excalidraw's low-chrome simplicity with modern polish.** The chrome recedes; editor and paper are the product. This section is the strategic stance; the concrete visual system — "The Light Table" — is **binding in [`apps/web/DESIGN.md`](apps/web/DESIGN.md)**, which is ground truth whenever the two disagree.

- **Layout** — three collapsible panes: CodeMirror editor (~38%, min 280px) · Paper Canvas (cool graphite backdrop, centered white pages with ambient shadows; min 320px) · Inspector (320px settings panel, min 260px). All collapse; one click gives a fullscreen canvas.
- **Inspector tabs**: **Page** (size, orientation, margins, frame, background image), **Style** (preset gallery as visual thumbnails — small rendered page previews, not a dropdown — plus typography, colors, code theme), **Header/Footer** (text, alignment, page numbers, banner image). Paid controls show a lock that opens the pricing modal — never a signup wall.
- **Chrome**: top bar = wordmark, editable doc name, Library, theme switch, quota chip (paid), `Export ▾` split button (main click = Client Export print flow; dropdown = Server Export). Floating zoom pill on the canvas. No card grids, no decorative clutter.
- **Visual identity**: graphite monochrome chrome with no accent hue (color belongs to the document), IBM Plex Sans/Mono, 2px radii, 150ms ease-out motion, and corner crop marks on every preview page. See `apps/web/DESIGN.md` for the full token set and rules.
- **Dark mode**: chrome darkens; pages stay white paper (unless the document's preset is Dark).
- **Onboarding**: first visit loads a polished multi-page sample document (headings, table, highlighted code, math, mermaid, page numbers) so the preview wows in two seconds; "Start blank" / "Import .md" actions; sample dismissible forever.
- Desktop-first. Tablet usable, phone degraded-but-functional.

## 3. Architecture & stack

**Monorepo (pnpm):**

| Package | Contents |
|---|---|
| `packages/core` | Framework-free engine ported from the plugin: settings/presets, css-builder, markdown rendering (markdown-it + KaTeX + Shiki + mermaid), paginator, page layout builder, outline extraction/injection, export HTML builder |
| `apps/web` | React + Vite SPA (no Next.js — no SEO surface, static hosting): CodeMirror 6, Tailwind, Zustand, IndexedDB doc library; `/` editor, `/pricing`, `/export` (hidden route the server loads) |
| `apps/server` | Node + Hono + Drizzle + SQLite: auth, Orders, Entitlements, quotas, Export History, export worker |

**Key decisions** (see `docs/adr/`): whole repo AGPL-3.0 (ADR-0001) · Client Export via print pipeline (ADR-0002) · server renders the app's own `/export` route in Playwright (ADR-0003) · stack (ADR-0004) · manual crypto billing (ADR-0005).

- **Library swaps from the plugin**: markdown-it replaces Obsidian's renderer; **KaTeX replaces MathJax** (synchronous, print-perfect, kills the MathJax-CSS-extraction code); **Shiki replaces Prism + CODE_THEMES** (VS Code-grade theme catalog — every old theme name has a Shiki equivalent); mermaid stays; RTL detection ports as-is.
- **Flavor**: GFM (tables, task lists, strikethrough, footnotes), GFM Alerts (`> [!NOTE]`), YAML frontmatter (stripped by default, toggle), `$…$`/`$$…$$` math, images. No Obsidianisms — no `==mark==`, no `[[wikilinks]]`.
- **Export worker** runs inside the API process (concurrency ~2, SQLite-backed queue table for visibility, Premium jobs jump the queue). Extractable to its own container later if scale demands.
- **Infra**: the Admin's own machine, Docker Compose — `caddy` (static files, reverse proxy), `api`, `umami` (its image is compiled in CI and pulled, [ADR-0012](docs/adr/0012-build-the-umami-image-in-ci.md)) — published at the real domain through a **Cloudflare Tunnel** (outbound only: no port forwarding, no static IP, no inbound rules; TLS terminates at Cloudflare's edge, so Caddy stays on plain HTTP). Nightly SQLite dump + history backup to object storage. Budget: ~€1/mo storage + domain — no server rent until the stack moves to a VPS, which is deferred (ADR-0010).
- **Persistence**: free users' documents live in IndexedDB (blobs for images) — local-only. Server Export POSTs document + assets (≤ 50 MB payload) ephemerally. No cloud doc sync in v1.

## 4. Roadmap

| Phase | Scope | Ship |
|---|---|---|
| **1 — Engine + free app** (~3–4 wks) | Monorepo, `packages/core` port with regression tests, editor app: 3-pane UI, library, Inspector (locks inert), Client Export print flow, sample onboarding, /pricing page | Public free launch — no accounts exist yet |
| **2 — Paid tier** (~2–3 wks) | Server + auth, Server Export pipeline, quotas, upgrade flow + Order submission, admin panel (payments/users/settings/audit), gated-feature unlocks (custom page size, CSS, fonts, banner/background images), Export History | Payments go live |
| **3 — Polish & launch ops** (~1–2 wks) | Umami analytics, docs page, backups + restore runbook, perf guards (large-doc warning, lazy Shiki, mermaid caching), deploy on own machine behind a Cloudflare Tunnel, launch checklist | Full launch |

Workstreams & tickets live in `.scratch/`: [`account-page`](.scratch/account-page/spec.md) · [`ai-transforms`](.scratch/ai-transforms/spec.md) · [`billing`](.scratch/billing/spec.md) · [`docs-page`](.scratch/docs-page/spec.md) · [`launch`](.scratch/launch/spec.md) · [`launch-chrome`](.scratch/launch-chrome/spec.md). **Execution order comes from each ticket's `Blocked by:` line** — work the frontier: any ticket whose blockers are resolved, lowest number first.

## 5. Risks & mitigations

- **Print-dialog confusion (free tier)** — users may not find "Save as PDF". Mitigation: one-time hint before the dialog opens; label the button "Export (print dialog)".
- **Firefox/Safari `@page` quirks** — page size honored best in Chrome/Edge. Mitigation: detect and show "Best results in Chrome" notice on Client Export.
- **Huge documents in browser** — pagination of 500+ pages can freeze a tab. Mitigation: soft warning >100 pages, render in chunks; server path has hard page caps.
- **Manual verification fraud** — Mitigation: amount + Reference Code match, txid spot-check on explorer, Reject-with-reason flow.
- **Client-side gate bypass (AGPL client)** — devtools can unlock client-only gates. Accepted: everything of value (Server Export) is server-enforced (ADR-0005).
- **Self-hosting cannibalization** — accepted deliberately (ADR-0001); the moat is the hosted convenience + price.
- **Crypto price volatility** — prices are denominated in USDT; LTC amount computed from a USDT rate captured at Order creation.

## 6. Non-goals (v1)

Cloud doc sync · public API · mobile-optimized editor · email infrastructure (password resets are manual until Resend is added) · i18n · collaboration · Obsidian-specific syntax · changes to the existing Obsidian plugin (it stays as-is; the web app links to it).

## 7. Your action items

1. Register the domain (`perfectmarkd.com` / `.app` / `.io` — check availability).
2. Create the three receiving wallets (USDT-TRC20, USDT-BEP20, LTC) and store keys safely; addresses go into admin settings at Phase 2.
3. Decide the GitHub org/repo name (whole repo is public from Phase 1 — AGPL-3.0).
4. Set up the Cloudflare Tunnel and DNS for the domain, and point it at the Compose stack on your machine (ADR-0010).
