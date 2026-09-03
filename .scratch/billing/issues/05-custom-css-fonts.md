# 05 — Gated feature UIs: custom stylesheet + custom fonts

Status: ready-for-agent
Blocked by: billing/04, editor-app/05

Build the two paid features that have no Phase-1 UI (page size/banner/background UIs exist from Phase 1, only unlock here). **Custom stylesheet**: Style tab section — textarea with the user CSS appended to `docCSS` (sanitized for `</style>`, per engine's `escapeCSSForStyle`), live re-render, per-document, a "Custom CSS" preset-slot so it survives preset switches. **Custom fonts**: upload `.ttf/.otf/.woff/.woff2` (≤ 10 MB each) → FontFace API load (client print works instantly, no server); asset stored like images; selectable in font pickers; Server Export embeds fonts as data: URIs in the payload (counted against the 50 MB cap). Gated UI both.

**Accepts**: custom CSS visibly restyles output and survives preset switch; uploaded font renders in preview, Client Export, and Server Export.
