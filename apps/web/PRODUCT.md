# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — Markdown writers who need polished PDFs.** People who already write in Markdown (notes, reports, résumés, coursework, documentation) and want a clean, presentable PDF without fighting a word processor's layout. They do the whole job in the browser: write or paste Markdown, tune the page, export. No account, no install, no Obsidian.

**Secondary — users of the Advanced PDF Export Obsidian plugin.** Familiar with the plugin's output and terminology; they want the same print-perfect result independent of any note-taking platform. The web app is the platform-independent successor.

## Product Purpose

Turns Markdown into perfectly laid-out, print-ready PDFs in the browser. It exists so that well-structured Markdown becomes a well-structured document — correctly paginated, with tables split properly, code highlighting preserved across page breaks, math, diagrams, page numbers, and frames — without a layout tool or a platform dependency.

Success means a writer can go from Markdown to a PDF they are proud to send, in one sitting, and trust that what they saw on screen is exactly what prints.

## Positioning

**What you see is exactly the PDF you get.** The preview, the free Client Export (the browser print pipeline), and the paid Server Export are pixel-identical by construction: one rendering engine drives both the on-screen Paper Canvas and the hidden export HTML that Chromium prints (ADR-0003). A neighboring markdown-to-PDF tool cannot truthfully copy this without adopting the same single-engine architecture.

## Operating Context

- The editor and preview sit side by side: Markdown source on the left, paginated paper on the right, reflowing as the user types.
- Free export goes through the browser's own print dialog ("Save as PDF"); paid Server Export is a one-click server-rendered PDF with a PDF outline.
- Free users' documents live entirely in the browser (IndexedDB); nothing is uploaded. Server Export payloads are processed in memory and deleted immediately.
- Paid plans are bought with manual crypto payment (USDT-TRC20, USDT-BEP20, Litecoin): the user sends funds and submits the transaction for manual verification. Nothing auto-renews.
- The app is desktop-first; tablet is usable, phone is degraded-but-functional.
- The product is AGPL-3.0 and can be self-hosted by anyone.

## Capabilities and Constraints

**Confirmed tiers and gating** (editable prices live in admin settings):

| | Free | Pro — 3 USDT/mo | Premium — 7 USDT/mo |
|---|---|---|---|
| Account | none | required | required |
| Client Export (print dialog) | ✓ | ✓ | ✓ |
| Server Export | never | 300/mo | 1000/mo |
| Pages per server export | — | 300 | 1000 |
| Custom page size, custom CSS, fonts, banner/background images | — | ✓ | ✓ |
| Priority render queue | — | — | ✓ |
| Export History (30 days) | — | — | ✓ |

- All core styling is free: presets, typography, colors, code themes, header/footer text, page numbers, page frame, mermaid, math, outline. No watermarks on any tier.
- Durations: 1 / 3 / 6 / 12 months; 12 months costs 10× (two months free).
- Gated controls in the UI show a lock that opens the pricing modal — never a signup wall.
- Client-side gates are bypassable by design (AGPL): everything of real value (Server Export) is enforced server-side.
- Terminology is fixed by the glossary in `CONTEXT.md` (Document, Page Break, Preset, Outline, Client Export, Server Export, Quota, Order, Verification). Use those terms; respect the listed "avoid" words.
- v1 non-goals: cloud document sync, public API, mobile-optimized editor, email infrastructure, i18n, collaboration, Obsidian-specific syntax.

## Brand Commitments

- **Name:** PerfectMarkD — always spelled as one word with that capitalization; the wordmark styles "Mark" in IBM Plex Mono (the typographic brand mark; the Light Table redesign replaced the accent-violet treatment).
- **Voice:** plain, confident, and concrete. It explains without overselling, and never invents proof it does not have.
- **Visual identity (Light Table):** cool graphite monochrome chrome, 2px radii, IBM Plex Sans/Mono, corner crop marks on preview pages. No accent hue in chrome — color belongs to the document. `apps/web/DESIGN.md` is the binding visual system.
- **Design stance (from `PLAN.md` §2):** Excalidraw's low-chrome simplicity with modern polish — the chrome recedes and the editor and paper are the product. This is a strategic stance recorded here; the concrete visual system belongs in DESIGN.md.

## Evidence on Hand

- `PLAN.md` — the product plan: tiers, billing flow, privacy posture, roadmap, risks.
- `CONTEXT.md` — the domain glossary and canonical terminology.
- `docs/adr/` — architecture decisions (AGPL-3.0, print-pipeline Client Export, single-engine server export, monorepo stack, manual crypto billing).
- `apps/web/src/documents/sample.md` — the polished multi-page onboarding sample (headings, callouts, table, highlighted code, math, diagrams).
- **Absences future work must not fabricate:** no customer testimonials, no logos or press, no usage benchmarks, no named users, and no image logo asset (the brand mark is a styled text wordmark plus the accent color).

## Product Principles

1. **The preview is the contract.** Never let the rendered preview and the exported PDF diverge. Any feature that cannot hold this is not shippable.
2. **Free means genuinely useful.** The full editing and styling experience is free and unmetered; monetization is server capacity, never withheld quality or watermarks.
3. **No account to start.** A first-time visitor reaches a working, good-looking document in seconds. Accounts are only asked for when a paid capability requires them.
4. **Privacy by default.** Free users' content never leaves the browser; server-processed content is ephemeral. No third-party requests, no tracking beyond anonymous aggregates.
5. **Terminology is precision.** The domain glossary exists because vague words ("theme", "template", "invoice") cause real product mistakes. Use the canonical terms.

## Accessibility & Inclusion

Target **WCAG 2.2 AA** across the editor shell: color contrast, full keyboard operation, visible focus, and correct semantics. The print output is a separate concern (ink on paper), but the app that produces it must be operable without a mouse.
