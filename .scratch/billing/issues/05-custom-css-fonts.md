# 05 — Gated feature UI: custom fonts

Status: ready-for-human
Blocked by: billing/04, editor-app/05

Build the paid feature that has no Phase-1 UI (page size/banner/background UIs exist from Phase 1, only unlock here). **Custom fonts**: upload `.ttf/.otf/.woff/.woff2` (≤ 10 MB each) → FontFace API load (client print works instantly, no server); asset stored like images; selectable in font pickers; Server Export embeds fonts as data: URIs in the payload (counted against the 50 MB cap). Gated UI.

**Accepts**: uploaded font renders in preview, Client Export, and Server Export.

## Comments

- The custom-stylesheet half this ticket used to carry is **superseded** by `.scratch/ai-transforms/issues/01-custom-stylesheet.md` (see `.scratch/ai-transforms/spec.md`): the engine field, the Stylesheet Inspector tab, the preset-gallery tile, and the `@page` guardrail are specified and ticketed there, with the styling reference in that workstream's ticket 02. Implementing it here would duplicate that work and produce two different boxes, so it was removed from this ticket's scope; the custom-fonts work above is untouched and is this ticket's own work.
- Implemented in commit `82c7c1d` (2026-09-22; review fixes in the follow-up commit). Shape: `apps/web/src/fonts/` owns the feature — `ingest.ts` (extension/size validation, family naming), `loader.ts` (FontFace registration, `ensureCustomFontsLoaded` before any pagination, export data-URI faces, `/export`-page payload registration), `store.ts` (the user-level library store). Fonts persist in a new `fonts` object store (DB v3), user-level rather than document-coupled: every upload is offered in every document's pickers, and nothing is ever uploaded to a server. Settings ride the pre-existing `fontFamily: '__custom__'` + `customFontName` sentinel pair the engine's `resolveFont` already spoke; core gains `customFontFamilies` and `buildFontFaceCSS`, and `buildExportHTML` takes a `fontFaceCSS` option (Client Export embeds data-URI `@font-face`s; Server Export adds a validated `fonts` array — core `FontFaceSource[]` — to the payload, bounded by the 50 MB body cap, so both export paths embed identical rules). Locked rows are unchanged; a persisted custom choice renders disabled through re-locks and font deletions, never a blank select. Verified in a real browser: upload → pickers → preview re-render (IBM Plex Mono), Server Export completing through the UI, and the real-Chromium e2e asserts the payload font is embedded in the PDF (`IBMPlexMono` BaseFont).
