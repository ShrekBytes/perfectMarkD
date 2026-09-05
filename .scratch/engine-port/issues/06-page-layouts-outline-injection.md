# 06 — Port page layout builder + outline/bookmark injection

Status: resolved
Blocked by: engine-port/02, engine-port/05

Port `buildPageLayouts` (header/footer zones, page-number template `{{current}}/{{total}}/{{title}}`, first-page suppression, display-number offset) and `extractOutlineEntries` + `injectPDFOutline` (pdf-lib bookmark tree, XYZ destinations, collapsed subtrees, UseOutlines) verbatim into `packages/core`. Rename `PDFExportSettings` references to `DocumentSettings` per ticket 02.

**Accepts**: `injectPDFOutline` unit test — build a 3-page dummy PDF, inject entries, assert outline objects with pdf-lib read-back.

## Comments

Implemented 2026-09-06 (this commit).

- Landed in `packages/core/src/paginator.ts` (appended; 1:1 with the source file, like ticket 05) and re-exported through `index.ts`. Ported sections: `PageLayout`/`OutlineEntry` interfaces, `resolvePageNumberFormat`, `buildPageLayouts`, `extractOutlineEntries`, `injectPDFOutline`. The alignment if-cascades, display-number arithmetic, sibling/child index scans, negative `/Count` collapsed subtrees, XYZ destinations (`null null 0` — inherit scroll and zoom), `PageMode UseOutlines`, and the page-index clamp are byte-for-byte the upstream logic.
- Sanctioned rename: `PDFExportSettings` → `DocumentSettings` (ticket 02). One additional rename: the public parameter `noteTitle` → `documentTitle` (plus "note title" → "document title" in two docstrings) — CONTEXT.md forbids "note" vocabulary and this is now this repo's public API; same class of rename ticket 02 sanctioned, recorded here as the exception to "verbatim".
- Comment wording only: "Electron's printToPDF" → "Chromium's print pipeline" (the port targets any browser print pipeline).
- `pdf-lib ^1.17.1` added as a runtime dependency of `@perfectmarkd/core`; tsup keeps it external (dist imports it, 40 KB total). No pdf-lib types leak into the public d.ts.
- Tests: 18 new in `paginator.test.ts` (54 in file, 259 in suite, all green). Acceptance test per ticket: 3-page dummy PDF via pdf-lib, inject 4 entries, read back with pdf-lib lookups — `PageMode /UseOutlines`, outlines root (`/Type /Outlines`, First/Last, `Count 2`), Parent/Prev/Next/First/Last wiring, negative `Count -2` (collapsed subtree), XYZ destinations with inherited scroll/zoom landing on the right pages, UTF-16 titles (`Ünï — 中文`). Plus: `buildPageLayouts` suite (default/custom/blank `pageNumberFormat`, `{{title}}` substituted last so a title containing `{{current}}` stays literal, first-page suppression, +1 display offset when page 1's footer is hidden, `pageNumberStart`, zone routing and the `' — '` same-slot merge, `hasHeader`/`hasFooter` flag matrix incl. border-only), `extractOutlineEntries` (document order across pages, bare heading page nodes and nested-in-fragment headings, empty-title skip), and edge cases (page clamp to last page, empty entries → identical bytes, leading H2 → root item).
- Behaviour note: the upstream safety bail-out "no root-level items (document starts with H2, never H1)" is unreachable for non-empty entry lists — the first entry can never have a parent, so a root always exists — carried over verbatim as defensive code. The test asserts the actual behaviour (a leading H2 becomes a root-level bookmark).
- Verified: workspace typecheck + eslint + prettier green; full suite 259/259 (16 files); core build green with pdf-lib external.
