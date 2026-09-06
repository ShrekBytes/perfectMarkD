# 07 — Export HTML builder (the shared print document)

Status: resolved
Blocked by: engine-port/03, engine-port/05, engine-port/06

Port the export-path half of `export-modal.ts` (`buildExportDocument`'s page HTML assembly: background layer → header banner → header text → content → footer banner → footer text → frame, one `page-break-after` div per page, `@page` size, print CSS) into `packages/core` as a pure function `buildExportHTML(layouts, settings, assets) → string`. Asset refs resolve through the `AssetResolver`. This one function feeds both Client Export (hidden iframe) and Server Export (Playwright `/export` route) — ADR-0003's single-pipeline guarantee.

**Accepts**: golden snapshot test of the HTML for a 2-page sample with header/footer/frame/background enabled.

## Comments

Implemented (2026-09-06), TDD at the two pure seams (geometry, HTML assembly) plus a golden file; 324 workspace tests green (21 new); golden output verified line-by-line against the plugin's `buildExportDocument`.

- Layout: `packages/core/src/export-html.ts` (`buildExportHTML` + `buildHFInnerHTML`, both faithful ports; plugin-only machinery — MathJax waits, layout cache, Electron/Notice handling — dropped) and `resolvePageGeometry` in `css-builder.ts` (the `doRender` page-box math: orientation swap, mm→px margins, auto/explicit header+footer band heights, ≥1px clamped content box).
- **Seam for app/04 (Paper Canvas)**: `resolvePageGeometry(settings)` is exported so the preview paginates against the exact content box the export positions with — divergent derivations would shift content between preview and print. It also needs `buildDocCSS(s, isRTL)` with the same `isRTL` for both paths.
- **Seam for app/06 + srv/03 (math)**: `options.mathCSS` is the `<head>` slot the plugin filled with inlined MathJax CSS. Core has no DOM/filesystem access, so the host passes its bundled KaTeX stylesheet *text* (e.g. Vite `?raw` import of `@perfectmarkd/core/katex.css`) — same source the preview uses, keeping the single pipeline. Font URLs inside it are the host's to make resolvable from the export document.
- **isRTL caveat (from code review)**: the plugin derived RTL from raw markdown; the port's default derives it from layout page-node text (frontmatter/URL deltas can theoretically flip the 10 % heuristic). Hosts should pass `options.isRTL` = the value used for `buildDocCSS` during pagination so print CSS matches what was measured — the option exists for exactly this parity.
- Deliberate choices: empty layouts throw (the plugin's "Nothing to export" Notice stays app-side); asset refs are not URL-escaped, matching the plugin (resolver is a trusted host seam — same trust level as the markdown itself, which renders with `html: true`); title/mathCSS/isRTL extend the ticket's 3-arg signature as an options bag.
- Golden test: `export-html.golden.html` (2 pages, header/footer text + banners + borders, page numbers, frame, full-page background) compared byte-for-byte via `toMatchFileSnapshot`; structural assertions alongside document what it must keep showing. The file is in `.prettierignore` — prettier must not reformat a byte-compared artifact. 4th private `settings()` test helper added (4th copy across core tests); consolidating into a shared helper is a small future cleanup left out of this ticket's scope.
