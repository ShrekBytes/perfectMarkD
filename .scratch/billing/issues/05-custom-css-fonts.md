# 05 — Gated feature UI: custom fonts

Status: claimed
Blocked by: billing/04, editor-app/05

Build the paid feature that has no Phase-1 UI (page size/banner/background UIs exist from Phase 1, only unlock here). **Custom fonts**: upload `.ttf/.otf/.woff/.woff2` (≤ 10 MB each) → FontFace API load (client print works instantly, no server); asset stored like images; selectable in font pickers; Server Export embeds fonts as data: URIs in the payload (counted against the 50 MB cap). Gated UI.

**Accepts**: uploaded font renders in preview, Client Export, and Server Export.

## Comments

- The custom-stylesheet half this ticket used to carry is **superseded** by `.scratch/ai-transforms/issues/01-custom-stylesheet.md` (see `.scratch/ai-transforms/spec.md`): the engine field, the Stylesheet Inspector tab, the preset-gallery tile, and the `@page` guardrail are specified and ticketed there, with the styling reference in that workstream's ticket 02. Implementing it here would duplicate that work and produce two different boxes, so it was removed from this ticket's scope; the custom-fonts work above is untouched and is this ticket's own work.
