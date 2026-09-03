# 05 — Inspector panel (Page / Style / Header-Footer)

Status: ready-for-agent
Blocked by: editor-app/04, editor-app/09

Three tabs per PLAN.md §2, backed by the settings snapshot per document. **Page**: size (A4/A3/A5/Letter/Legal/custom W×H mm — custom locked), orientation, margins (4 inputs, mm), frame (enable, style, color, thickness, margin), background image (upload → asset, fit/scope/opacity — locked). **Style**: preset gallery as visual thumbnails (render tiny page previews per preset with CSS — no full engine run), typography (font family from bundled catalog, size, line height, paragraph spacing, heading scale), colors (accent/body/bold/heading/blockquote/code/table), code theme dropdown (Shiki catalog), code font + ligatures. **Header-Footer**: show/hide, first-page suppression, text + alignment, font size/color, borders, page numbers (show, position, format template with `{{current}}/{{total}}/{{title}}`, start), banner image upload (locked). Locked controls show 🔒 → pricing modal (ticket 09); in Phase 1 every gate is locked for everyone.

**Accepts**: every change re-renders the canvas (debounced); locks visible on the five gated controls; settings persist per document.
