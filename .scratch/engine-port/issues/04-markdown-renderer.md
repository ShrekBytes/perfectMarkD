# 04 — Markdown renderer pipeline (markdown-it + KaTeX + Shiki + mermaid)

Status: ready-for-agent
Blocked by: engine-port/01, engine-port/03

New `packages/core/src/render.ts` replacing the plugin's `markdown.ts`. markdown-it with: linkify, GFM tables/strikethrough, tasklists, footnotes, markdown-it-front-matter (parse + expose; strip per setting), GFM Alerts (container plugin producing `markdown-alert markdown-alert-note` structures), attrs off, typographer on. Math: KaTeX auto-render for `$…$`/`$$…$$` with display mode; bundle KaTeX CSS+fonts. Code: Shiki async highlighting with theme from settings (fall back `github-light`); mermaid fenced blocks rendered to SVG (client provides the mermaid instance — core accepts an optional `renderMermaid` hook to stay env-agnostic). Post-processing ported from `postProcessRenderedHTML`: heading slug IDs (dedup), anchor rewrite, copy-button strip, style/script cleanup (keep SVG-embedded styles). RTL detection ported as-is. Async API returning clean HTML string + frontmatter object.

**Accepts**: sample markdown (headings, table, task list, footnotes, alert, math, code, mermaid, RTL text) renders correct clean HTML; unit tests per feature.
