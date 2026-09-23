# 01: The Custom Stylesheet, end to end

**What to build:** A paying user opens the Stylesheet tab in the Inspector, types CSS into the box, and the Paper Canvas restyles as they type; the same CSS appears in a Client Export print and in a Server Export PDF. The preset gallery gains a **Custom stylesheet** tile that turns the layer on and off, and the inert "Custom (Pro)" section in the Style tab is gone. CSS that tries to control the page box is ignored rather than obeyed in the print only.

**Spec:** `.scratch/ai-transforms/spec.md` (the engine, interface, and reference decisions).

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] The Document's style state carries the stylesheet text and whether the layer is on; both persist with the Document, survive reload, and travel between tabs, and Documents saved before this change load with the fields filled from the defaults.
- [x] The stylesheet is appended by the engine's CSS builder after the generated rules, so pagination measurement, the Paper Canvas, Client Export, and Server Export all render with it — one stylesheet, four consumers, no per-surface special cases.
- [x] `@page` at-rules are stripped, `</style>` sequences are neutralized, and the box says plainly that page size and margins are Page-tab settings and that `@page` rules are ignored.
- [x] The gallery tile behaves in all four states: off with CSS present turns the layer on and leaves the chosen Preset lit; on turns it off and keeps the CSS; off with an empty box moves the Inspector to the Stylesheet tab; a user whose plan excludes the Custom Stylesheet sees a lock that opens the pricing modal. Emptying the box turns the layer off automatically.
- [x] The Stylesheet tab edits the stylesheet as text — selection, undo, paste, its own scroll — and shows the layer's on/off state; a user without the feature sees the locked body instead.
- [x] Tests: the builder's append, strip, and escape behaviour; that all four consumers see identical CSS; the tile's four states; the tab's gated and ungated bodies; and a real-Chromium Server Export of a Document with a Custom Stylesheet whose page geometry is unchanged.

**Notes:** This ticket absorbs the custom-stylesheet half of the billing workstream's gated-feature-UI ticket, whose custom-fonts half is untouched; that ticket should be marked superseded rather than implemented twice. (Already recorded on `.scratch/billing/issues/05-custom-css-fonts.md` — nothing to do.)

## Comments

- Implemented (ai-transforms/01). Engine: `customStylesheet` + `customStylesheetEnabled` settings fields (schema v2; `validate()` fills them for pre-v2 Documents and turns the layer off when the CSS is empty), `stripPageAtRules()` (scanner: string/comment-aware, token-exact, handles nested margin-box braces and malformed rules), and the layer appended after the generated rules inside `buildDocCSS` — the one seam the pagination sandbox, Paper Canvas, Client Export, and Server Export already share. Web: fourth Inspector tab (visible label "Stylesheet", accessible name "Custom stylesheet") with the monospace box, the "Apply to pages" switch, and the `@page` note; the gallery tile with the four states and the empty-box → Stylesheet-tab move; the inert "Custom (Pro)" rows deleted (section retitled "Custom fonts"); `IncludedNote` removed as now-unused. CONTEXT.md's Inspector entry updated to four tabs; DESIGN.md's Gate Lock section names the tile's glyph-badge variant.
- Tests: settings repair/invariants, builder append/strip/escape, export-HTML carries the rules with the settings' `@page` left as the only one, pipeline parity (`docCSS === buildDocCSS(...)`), tile four states, tab gated/ungated bodies, store round-trip + legacy repair, and the real-Chromium Server Export asserting the stylesheet reaches print while page geometry stays A4. Verified in Chromium (entitled flow via a throwaway Pro account, then removed): tile states, live restyle as CSS is typed, auto-off on empty, reload persistence.
- **Status flipped `ready-for-human` → `resolved`** (2026-09-24): the label means "requires human implementation"; the implementation above shipped (`6e2e663`) and was verified in a browser, and the full unit suite is green. Nothing here is still waiting on a human.
