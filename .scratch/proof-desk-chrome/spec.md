# proof-desk-chrome — The shell joins the Proofing Desk

Status: ready-for-agent

Spun from the 2026-09 design critique's verdict: "lean in further" — the Paper
Canvas already carries "The Proofing Desk" world; the top bar, the banner
strips, and the Library must visibly belong to that world while the chrome
stays quiet. Confirmed shape brief: three moves (strip pattern, Library rows,
top-bar gauge) plus the page-count data layer they rest on.

## Problem Statement

The Paper Canvas tells a writer "this is a proofing desk": warm-gray desk,
white sheets, "Page N of M" under each one. The chrome around it tells a
different story. Three near-identical 40px accent-tinted strips behave and
look like they were built by three different people: one has a filled primary
plus a danger-tinted ghost, one has a filled primary plus a bordered text
button, one has an off-ladder-sized primary plus an icon close — and
collapsing the editor pane hides the third one entirely. The Library lists
Documents as bare filenames with a timestamp, while the Inspector a few
hundred pixels away shows styled miniature sheets — a writer with a 12-page
report and a 1-page note sees two identical rows. And the top bar, the strip
of chrome the Document itself lives in, carries no print vocabulary at all:
its left cluster is wordmark, divider, file name, save state — pure file
identity, nothing about paper, pages, or proof.

## Solution

The whole shell reads as one instrument on the Proofing Desk, speaking in the
data the system already owns:

1. **One banner strip pattern.** All three notices (stale-document conflict,
   plan-ended, sample welcome) are instances of a single strip component with
   slots: wrapping copy, a filled primary action, a secondary action, and an
   icon dismiss. All mount at shell level under the top bar, all rest at 40px
   and grow when their copy wraps, and dismissal is always the same idiom.
2. **The Library shows sheets.** Every Document row gains a leading
   miniature-sheet thumbnail drawn from the Document's own settings snapshot
   (the preset-thumbnail doctrine: a CSS sketch, never an engine run), with
   the page's aspect following the Document's paper size and orientation —
   and a true page count on its meta line: "edited 2h ago · 12 pages".
3. **The top bar states the document's paper facts.** A quiet readout beside
   the Document name — "A4 · 12 pages" — updates live as the writer types.
4. **Page counts become real data.** The count the Paper Canvas already
   computes on every successful render is persisted on the Document record,
   rides the existing debounced autosave, and cross-tab broadcasts for free.

No new colors, sizes, fonts, motion, or chrome loudness — the moves make the
chrome *specific*, not louder.

## User Stories

1. As a writer, I want all three notice strips to share one visual grammar, so
   that an alert anywhere in the app reads as the same kind of instrument, and
   I never have to relearn which button does what.
2. As a writer with a stale-document conflict, I want the stale strip to keep
   its two clearly-weighted actions ("Keep mine" as the filled primary,
   "Load changes" in danger styling), so that I understand which choice keeps
   my work and which discards it.
3. As a writer facing a conflict notice, I want the strip to offer no dismiss
   control, so that I cannot accidentally make a version conflict go away
   without resolving it.
4. As a writer whose plan has ended, I want the plan-ended strip to offer a
   consistent dismiss icon with an accessible label, so that clearing a
   read-and-understood notice works the same way as every other dismissible
   strip in the app.
5. As a first-run visitor, I want the sample-document welcome strip to appear
   at shell level, so that it stays visible even if I collapse the editor
   pane while deciding what to do with the sample.
6. As a first-run visitor, I want the welcome strip's "Start blank" action to
   stay the filled primary it is today, so that the most common next step
   stays the visually strongest one.
7. As a writer on a narrow window, I want strip copy to wrap rather than
   truncate, so that the full consequences of each choice stay readable at any
   width.
8. As a writer who ever sees two notices at once (e.g. plan-ended while the
   sample is open), I want the strips to stack cleanly under the top bar in a
   stable order — conflict and plan notices first, welcome last — so that the
   most urgent information is always topmost.
9. As a keyboard user, I want every strip control reachable and operable by
   Tab and Enter/Space with the standard visible focus outline, so that I can
   resolve notices without a mouse.
10. As a screen-reader user, I want each strip to keep its semantic role
    (alert for the conflict and plan notices, status for the welcome strip),
    so that my assistive technology announces urgency correctly.
11. As a writer, I want the Library to show a miniature sheet for each
    Document, so that I can pick a Document by its look, not just its
    filename.
12. As a writer with Documents in different styles, I want each thumbnail to
    draw from the Document's own settings (its fonts, colors, page
    background), so that a dark-styled Document reads as a dark sheet on the
    light desk — the thumbnail is a fact about the Document, not about the
    app's theme.
13. As a writer with A3, Letter, Legal, A5, and landscape Documents, I want
    each thumbnail's aspect ratio to follow the Document's paper size and
    orientation, so that the shape of the sheet itself is legible at a glance
    in the row.
14. As a writer, I want a true page count on each Library row, so that I know
    whether a Document is a one-pager or a forty-page report before opening
    it.
15. As a writer, I want the page count to be set in tabular numerals, so that
    a drawer full of counts aligns into a readable column.
16. As a writer with Documents created before this feature, I want a row
    without a known count to show no count rather than an estimate, so that
    the meta line never lies; the count appears the next time I open that
    Document and the Paper Canvas renders it.
17. As a writer, I want the top bar to state my document's paper facts beside
    its name — "A4 · 12 pages" — so that the bar where the Document lives
    speaks print, not just file identity.
18. As a writer, I want that gauge to update live as I type, so that I always
    know the size of the thing I am producing without leaving the editor.
19. As a writer on a landscape or custom-size Document, I want the gauge to
    say so ("A4 landscape", "Custom · 3 pages"), so that the readout matches
    what will print.
20. As a writer, I want the gauge to agree exactly with the "Page N of M"
    labels on the Paper Canvas, so that no two instruments ever report
    different facts about the same Document.
21. As a writer with no Document open, I want no gauge at all, so that the
    bar never shows a readout with nothing to read about.
22. As a dark-mode user, I want the chrome to invert around the sheets while
    thumbnails keep the Document's own colors and the paper stays the paper,
    so that dark mode stays a fact about the desk, never about the Document.
23. As a multi-tab writer, I want a page count written by a render in one tab
    to appear in the other tab's Library, so that both windows agree on the
    size of my Documents.
24. As a writer of a very large Document, I want the page count to be
    recorded even when the large-document guard defers mounting the preview,
    so that the Library still knows the true size without me clicking
    "Render anyway".
25. As a writer of an empty Document, I want whatever count the engine
    honestly reports (an empty document renders one page), so that the
    readout is never fabricated.
26. As a writer renaming a Document in the Library, I want the thumbnail to
    stay put while the name becomes an input, so that renaming feels like a
    small edit to a row, not a mode switch.
27. As a writer hovering a Library row, I want the row's action icons to
    appear on hover exactly as they do today, so that this feature changes
    what I see about the Document, not how I act on it.
28. As a returning user, I want no migration moment, no spinner, and no
    settings change when this feature first runs, so that the upgrade is felt
    only as richer rows and a new readout.
29. As a self-hoster on the AGPL build, I want the feature to run entirely
    client-side with no server or account involvement, so that free-tier
    privacy posture is untouched.
30. As a writer who never opens the Library, I want the page-count
    persistence to be invisible (no extra saves, no save-state churn beyond
    what content edits already cause), so that the feature costs nothing
    until I look at it.

## Implementation Decisions

- **New strip component with slots.** One banner-strip component, three
  instances (conflict, plan-ended, welcome). Slots: wrapping copy, primary
  action (28px filled, the standard primary), secondary action (28px ghost;
  the conflict strip's "Load changes" keeps its danger styling), and an icon
  dismiss. An instance fills the slots it needs.
- **One dismiss idiom.** Dismissal is always the 28px icon close button with
  an accessible label. The plan-ended strip's text "Dismiss" button becomes
  the icon; a text secondary slot is reserved for real actions only. The
  conflict strip keeps no dismiss. The welcome strip keeps its existing
  icon dismiss.
- **Copy, roles, and semantics frozen.** All three strips keep their exact
  copy, `role` (alert / alert / status), testids, and action semantics —
  including the conflict strip's weighting ("Keep mine" primary, "Load
  changes" danger). This is a visual-grammar unification, not a copy pass.
- **Strip mounting moves to shell level.** All three strips mount directly
  under the top bar in a fixed stacking order (conflict, plan-ended,
  welcome), pushing the pane row down. The welcome strip leaves the editor
  pane, fixing the defect where collapsing the editor hides it.
- **Strip heights normalize.** All strips rest at 40px (`min-h-10`) and grow
  when copy wraps; the conflict strip's existing wrap behavior becomes the
  pattern for all three. All strip buttons are 28px, drawn from the chrome
  height ladder.
- **Library row anatomy.** Each row gains a leading miniature-sheet thumbnail
  at drawer-row scale (~28×40px at the default aspect), followed by the
  existing name + timestamp block; the meta line gains the page count
  ("edited 2h ago · 12 pages") in tabular numerals at the label size, Ink
  Faint. Row hover behavior, action icons, rename flow, and the drawer's
  header/create/import chrome are untouched.
- **Thumbnail doctrine.** The existing preset thumbnail component is
  parametrized: the CSS-sketch miniature page (heading bar, body lines, quote
  block, code strip, accent mark) is drawn from the Document record's own
  settings snapshot, never from chrome tokens, at a configurable size. The
  aspect ratio derives from the record's page size and orientation. It is a
  sketch, not an engine run — no pagination ever happens to draw a row.
- **Schema: page counts on the record.** `DocumentRecord` (and therefore the
  Library's summary rows) gains `pageCount: number | null`. Additive; no
  database version bump (keyPath unchanged; old records simply read as
  `null`).
- **Count source: live renders only.** The Paper Canvas reports the layout
  result's total page count to the document store on every successful
  render, including when the large-document guard defers mounting (the
  paginate step has already produced the count). If the guard proves to skip
  pagination entirely, the count lands on the acknowledged "Render anyway"
  run instead — acceptable, not a blocker. Persistence rides the existing
  debounced autosave flush; there is no separate write path and no new
  conflict semantics. The existing `doc-saved` cross-tab broadcast carries
  the full record, so peer Libraries update for free.
- **No counting in the drawer.** Opening the Library never triggers engine
  runs. A row with `pageCount: null` shows no count (absence, not an
  estimate — the quota-chip doctrine).
- **Top-bar proofing gauge.** Beside the Document name (after the save-state
  indicator): the paper size label and live count in Ink Faint at 12px,
  tabular numerals, e.g. "A4 · 12 pages". Landscape appends when set;
  custom sizes read "Custom". It is a readout, not a control — no border, no
  chip, no hover state — and it disappears when no Document is active. It
  reads the same store value the Paper Canvas reports, so gauge and "Page N
  of M" labels cannot disagree.
- **First-open state.** Before the first render lands, the gauge shows the
  paper size alone; the count joins it once the canvas reports. The gauge
  never shows a count the canvas has not produced.
- **Design constraints inherited wholesale.** All heights from the ladder
  (28/40), all type from the ramp (12px label), one 150ms ease-out
  transition on colors only, the standard focus outline everywhere, accent
  usage unchanged (thumbnail colors are Document data, not chrome accent).
- **Design-system doc updated.** The banner-strip, library-row, and
  top-bar component entries in the committed design-system doc are rewritten
  to match the shipped pattern (strip slots, row anatomy with thumbnail and
  count, the gauge), so the doc stays the truth.
- **Build order (tracer-bullet).** (1) Data layer: schema field → store write
  path from the canvas → broadcast; (2) strip component + three instances +
  shell mounting; (3) top-bar gauge; (4) Library thumbnail + meta line; (5)
  design-system doc entries; (6) mechanical design-detector pass over the
  changed files plus test updates.

## Testing Decisions

- **Zero new seams.** The feature is observable end-to-end through the four
  harnesses that already exist; the spec forbids adding a dedicated
  component-level harness for the strip pattern — its three instances, driven
  through the shell and their existing suites, are its tests.
- **A good test asserts external behavior only**: visible text and roles in
  the rendered DOM, testids as stable anchors, and observable store state —
  never component internals, slot mechanics, or styling classes.
- **Primary seam — the shell suite** (`renderReadyShell` helper, mermaid
  stub): the gauge text and its live update on edit; strip stacking order and
  resting layout; the welcome strip remaining visible with the editor pane
  collapsed; Library rows showing thumbnail sketch and count meta once opened.
  New testids only where a user-visible element has no stable hook yet: the
  gauge and the row meta line.
- **Canvas seam** (`mountCanvas` / `flushRender` in the Paper Canvas suite):
  a successful render writes the layout's total count into the document
  store; the large-document guard path still records the count (that suite
  already owns the guard tests and their explicit long timeouts).
- **Store suite**: count persisted through the debounced flush; carried on the
  `doc-saved` broadcast (peer-tab visibility of counts); `null` preserved for
  legacy records; duplicate/import/create paths defaulting cleanly.
- **Component suites** (conflict, plan-ended, welcome, Library panel): keep
  their existing external assertions (copy, roles, links, dismissal effects,
  action callbacks) against the unified pattern; the plan-ended suite swaps
  its text-dismiss assertion for the icon-dismiss role lookup.
- **Prior art**: the shell suite's whole-app mounting pattern, the canvas
  suite's pipeline-spy + page-label assertions, the plan-ended suite's
  store-raise → render → assert → dismiss pattern, and the store suite's
  broadcast/persistence coverage.

## Out of Scope

- Any change to strip copy, action labels, or action semantics — including
  the conflict strip's danger weighting and the welcome strip's "Start blank"
  flow.
- The Editor pane, Inspector, export flows, quota chip, account menu, focus
  and escape layering — untouched.
- The Library drawer's header, create/import bar, row action icons, rename
  and delete flows — untouched beyond the row's leading thumbnail and meta
  line.
- Any change to the large-document guard itself (it keeps deferring; only the
  count now escapes it).
- New accent usage, new type sizes, new motion curves, or any second hue —
  the moves live entirely inside the committed design system.
- Lazy or eager recounting of Documents when the Library opens (explicitly
  rejected in favor of render-time persistence).
- Fuller previews (real page renders, multi-page thumbnails) in the Library.
- Design-system doc changes beyond the component entries named above.
- Marketing/pricing surfaces — this is workspace chrome only.

## Further Notes

- Terminology follows the domain glossary: Document, Library, Paper Canvas,
  Page, Preset. The thumbnail shows a Document's own Preset-derived style
  snapshot; the count counts Pages.
- The critique inputs this spec answers, verbatim: three near-identical 40px
  accent strips shipping three different button grammars (→ one strip
  pattern with slots); Library rows carrying no page count or thumbnail
  while a preset-thumbnail component already exists (→ rows gain both,
  reusing that component's doctrine); nothing in the chrome saying
  print/page/proof (→ the gauge).
- The three shape-brief decisions, confirmed by the user: counts persist from
  live renders (legacy rows show nothing until next open); the top bar gets
  one quiet gauge ("A4 · 12 pages", size + count only, not a full proof
  slug); the welcome strip moves to shell level, full width.
- Design-detector provenance: this feature was shaped with the design-skill
  flow; after implementation, run the mechanical design detector once over
  the changed files (the shape brief's step 6) — not during.
- Detector page-level findings, dispositioned during the polish pass:
  - `flat-type-hierarchy` (h3 11px / body 12px / h2 14px): false positive.
    The 11px step is the DESIGN.md Micro style — 600 weight, uppercase,
    tracked — deliberately distinct from 12px Label by weight and case, not
    size alone. Documented hierarchy, not a defect.
  - `dark-glow` (zero-offset `#ffba00` glow): false positive. The only amber
    in the system is `.mpdf-doc mark { background: #ffe066 }`
    (`packages/core/src/css-builder.ts`) — the document's `==highlight==`
    fill, a solid paper fact per the document-data doctrine, not a chrome
    shadow. No zero-offset amber glow exists in any shipped source.
