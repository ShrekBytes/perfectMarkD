# engine-port — packages/core

Port the Advanced PDF Export plugin's engine to a framework-free TypeScript package shared by the web preview, the client print path, and the server's Playwright renderer.

Source: `/home/samy/Documents/GitHub/advanced-pdf-export/src/` (GPL-3.0; whole project becomes AGPL-3.0 — GPLv3 code may be carried in, see ADR-0001).

## What ports nearly verbatim

- `paginator.ts` — the pagination engine (page-height buckets; splitters for inline text, lists, tables, code-by-line). Only the Obsidian DOM globals (`createDiv`, `createEl`, `createSpan`, `activeDocument`, `activeWindow`) need shims.
- `buildPageLayouts` + `extractOutlineEntries` + `injectPDFOutline` (pdf-lib) — framework-free already.
- `settings.ts` — presets, page sizes, defaults, validation.

## What changes

- `css-builder.ts` — keep typography/color/table/callout/frame generation; **drop all MathJax CSS extraction** (KaTeX ships static CSS+fonts) and **drop Prism `TOKEN_GROUP_CLASSES`** (Shiki applies themes at markdown-render time). Custom page sizes keep `PAGE_SIZES` + mm→px.
- `markdown.ts` — replaced by a markdown-it pipeline: GFM tables/tasklists/strikethrough, footnotes, **GFM Alerts** (`> [!NOTE]` etc.), frontmatter parse + strip option, KaTeX (`$…$`/`$$…$$`), Shiki highlighting (theme names: the old catalog all exists in Shiki — github-light/dark, one-light/one-dark, monokai, dracula, tokyo-night, solarized-light, catppuccin-*), mermaid code blocks rendered to SVG, heading slug IDs + anchor rewrite, RTL detection kept. No `==mark==`, no `[[wikilinks]]`.
- `export-modal.ts`'s `buildExportDocument` — the print-HTML assembly moves into core as a pure function: `(paginated layouts, settings, asset resolver) → full HTML string`.

## Interfaces to design (not port)

- `AssetResolver`: `(ref: string) => string | undefined` — turns markdown image refs into URLs (data:, blob:, https:). Replaces Obsidian's `resolveImageUrl`.
- One entry point per consumer: `renderPipeline(md, settings, assets) → { pages, layouts, docCSS, exportHTML }`.

## Testing

The paginator is the moat — regression-test it hard: golden tests over sample documents (tables/lists/code/math across page boundaries) asserting page counts and structural snapshots, run in real Chromium via Playwright (DOM measurement needs real layout; jsdom lies about heights).
