# 01: The Custom Stylesheet, end to end

**What to build:** A paying user opens the Stylesheet tab in the Inspector, types CSS into the box, and the Paper Canvas restyles as they type; the same CSS appears in a Client Export print and in a Server Export PDF. The preset gallery gains a **Custom stylesheet** tile that turns the layer on and off, and the inert "Custom (Pro)" section in the Style tab is gone. CSS that tries to control the page box is ignored rather than obeyed in the print only.

**Spec:** `.scratch/ai-transforms/spec.md` (the engine, interface, and reference decisions).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The Document's style state carries the stylesheet text and whether the layer is on; both persist with the Document, survive reload, and travel between tabs, and Documents saved before this change load with the fields filled from the defaults.
- [ ] The stylesheet is appended by the engine's CSS builder after the generated rules, so pagination measurement, the Paper Canvas, Client Export, and Server Export all render with it — one stylesheet, four consumers, no per-surface special cases.
- [ ] `@page` at-rules are stripped, `</style>` sequences are neutralized, and the box says plainly that page size and margins are Page-tab settings and that `@page` rules are ignored.
- [ ] The gallery tile behaves in all four states: off with CSS present turns the layer on and leaves the chosen Preset lit; on turns it off and keeps the CSS; off with an empty box moves the Inspector to the Stylesheet tab; a user whose plan excludes the Custom Stylesheet sees a lock that opens the pricing modal. Emptying the box turns the layer off automatically.
- [ ] The Stylesheet tab edits the stylesheet as text — selection, undo, paste, its own scroll — and shows the layer's on/off state; a user without the feature sees the locked body instead.
- [ ] Tests: the builder's append, strip, and escape behaviour; that all four consumers see identical CSS; the tile's four states; the tab's gated and ungated bodies; and a real-Chromium Server Export of a Document with a Custom Stylesheet whose page geometry is unchanged.

**Notes:** This ticket absorbs the custom-stylesheet half of the billing workstream's gated-feature-UI ticket, whose custom-fonts half is untouched; that ticket should be marked superseded rather than implemented twice.
