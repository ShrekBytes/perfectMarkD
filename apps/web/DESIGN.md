# PerfectMarkD — DESIGN.md (Light Table world)

*Rewritten 2026 by the impeccable redesign pass. This file is ground truth: when
code and this file disagree, either the code is wrong or this file is stale —
fix one of them, never neither.*

## Overview

**Creative North Star: "The Light Table"**

The screen is a print-production bench: cool graphite instruments arranged
around one lit sheet of paper. The paper carries printer's corner crop marks,
like a press sheet pulled for inspection. Every instrument — the top bar, the
panes, the Inspector — is matte graphite and stays out of the way; the sheet is
the only warm, bright object on screen.

This is an instrument world, not an ornament world. There is no accent hue in
the chrome: selection and active state are **graphite inversions** (dark fill,
light ink), not tints, and focus is a solid dark 2px ring. Color belongs to the
document — presets, user accents, and callouts carry whatever hue the document
chooses; the chrome carries none. The one exception is `--danger`, reserved for
destructive actions and failure text.

**Key Characteristics:**

- Cool neutral gray scale (blue-cast, no cream); white paper as the only
  high-value element on screen.
- Zero accent hue: graphite inversion for selection/active, dark 2px focus
  ring, `--danger` as the only chrome color.
- 2px radii everywhere — controls, panels, pills. Instrument-grade corners.
- IBM Plex Sans for UI, IBM Plex Mono for code, identifiers, and data readouts
  (the wordmark's "Mark" is mono — the brand's typographic signature).
- Crop marks on every preview page (four 12px L-marks, `--ink-faint`, 6px off
  the page edge) — pure CSS on `.pm-page-frame` / `.pm-page-host`.
- One motion curve (ease-out) and one duration (150ms); never on layout.
- Light and dark share one token set; filled controls invert in dark mode.

## Colors

A cool graphite workspace with no accent hue. The paper is the color.

### Chrome (light / dark)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | `#e9eaec` | `#17181a` | the bench — Paper Canvas backdrop |
| `--surface` | `#f4f5f6` | `#222427` | top bar, panes, dialogs, drawer |
| `--surface-hover` | `#e4e6e8` | `#2e3134` | hover fill on quiet controls |
| `--page` | `#ffffff` | `#ffffff` | the paper. Never themed. |
| `--field` | `#ffffff` | `#17181a` | typed-into surfaces (flips with theme) |
| `--ink` | `#1c1e21` | `#e8eaec` | body text, headings |
| `--ink-soft` | `#565a60` | `#a6abb1` | secondary text, labels |
| `--ink-faint` | `#646a71` | `#8d9298` | tertiary text, crop marks (AA on all surfaces incl. the canvas bench) |
| `--hairline` | `#dcdee1` | `#34373a` | every structural divider |
| `--hairline-strong` | `#c8cbcf` | `#474b4f` | rules that must hold their own |
| `--accent` | `#1c1e21` | `#e8eaec` | "accent" = graphite: focus rings, caret, links |
| `--accent-strong` | `#1c1e21` | `#e8eaec` | filled-control fill (inverts in dark) |
| `--accent-deep` | `#04060a` | `#f8f9fa` | filled-control hover/active |
| `--accent-soft` | `8% ink` | `12% ink` | selection wash, subtle tints |
| `--accent-ink` | `#ffffff` | `#17181a` | text on filled controls |
| `--danger` | `#c4321f` | `#f07a6a` | destructive actions, failure text only |

### Named Rules

**The Graphite Inversion Rule.** Selection and active state are a dark fill
with light ink (inverted in dark mode), never a tint. Selected Library row,
active Inspector tab, checked plan CTA, selected duration: all read as "this
one is inked."

**The Paper Is Fixed Rule.** `--page` is `#ffffff` in both themes. It is the
exported sheet, not a theme choice.

**The Color Belongs to the Document Rule.** Chrome has no hue. Document
accents (`accentColor`, `blockquoteBorderColor`, frame color, callout color)
are the document's own content and may be any color — the default preset is
graphite, presets like Academic and Rose keep theirs, and the GFM callout
design is accent-driven so it follows the document's choice.

**The Field Flips Rule.** Anything typed into sits on `--field`, which flips
with the theme; `--page` never flips.

## Typography

**Display/Body Font:** IBM Plex Sans (self-hosted, 400/500/600)
**Editor/Mono Font:** IBM Plex Mono (self-hosted, 400/500) — code, markdown
source, identifiers, hex readouts, counts, and the wordmark's "Mark".

**Character:** a workhorse grotesque with real editorial lineage, set small and
tightly. Plex Mono marks anything machine-made: data, code, measurements — and
the one branded typographic moment, "Perfect**Mark**D".

### Hierarchy

- **Headline** (600, 24px): the pricing page's `h1` only.
- **Subhead** (600, 18px): auth page `h1`, empty-state glyphs.
- **Section head** (600, 16px): upgrade step panels, plan column names.
- **Wordmark** (600, 14px): "PerfectMarkD", "Mark" in Plex Mono.
- **Title** (600, 14px): dialog and panel headings, list row names.
- **Body** (400–500, 14px): buttons, menu items, inputs, banner copy.
- **Label** (500, 12px): field labels, tabs, chips, metadata. The workhorse.
- **Group head** (500, 11px, sentence case): Inspector subgroups — a named run
  of fields inside a section, one step below the section head in both weight
  and case.
- **Micro** (600, 11px, uppercase, `0.025em`): Inspector section headings.
- **Hint** (400, 11px): field helper text and colophons — quiet guidance, one
  step below Label in weight.
- **Footnote** (400, 10px): two instances only, attached to their controls.
- **Editor code** (400, 13.5px, 1.7): Plex Mono, caret and selection graphite.

**Named Rules:** One Face Rule (Plex Sans chrome, Plex Mono data, document
font inside the page only) · Tabular Numerals Rule (any in-place-updating
number is `tabular-nums`) · Tiny-Text Earns-It Rule (nothing below 11px except
the two attached footnotes).

## Layout

- **Top bar:** 48px, hairline bottom, and a three-group rhythm — 8px inside a
  group, 12px between groups. Identity (wordmark · rule · document name, the
  name free to shrink), state (autosave · proof gauge, one tight cluster), and
  actions (Library / theme · quota / Export / account, the quiet view controls
  one step away from the primary action). The wordmark anchors the bar at 14px
  and never out-shouts the document beside it.
- **Panes:** editor 38% (min 280px), canvas flex (min 320px), Inspector 320px
  (min 260px). Dividers: 16px drag targets, ARIA splitters, keyboard resize,
  Enter/double-click reset. Resizing is a **coupled negotiation**: the canvas
  gives first (to its 320px minimum), then the neighbor pane yields to its own
  floor — so a pane's ceiling is `container − 320 − neighbor min`, and
  `setPaneWidth` writes the neighbor's yielded width with it. State and DOM
  then agree, and `aria-valuemax` is never a value the keyboard cannot reach.
  Exactly at 860px nothing is left to give: the splitter says so
  (`aria-disabled`, neutral cursor, an explanatory title) instead of silently
  refusing its arrow keys.
- **Canvas rhythm:** 24px page gap, 24/32px padding, "Page N of M" labels,
  fit-to-width until the user takes over. The page stack's bottom padding
  clears the floating zoom pill (3.5rem, 4.5rem under coarse pointers) so the
  last page's label can always scroll out from under it.
- **Spacing scale:** 2/4/6/8/10/12/16/20/24/32/40px.
- **Chrome heights:** 28 / 32 / 36 / 40 / 48px. Nothing else.

### The responsive ladder

Two authored breakpoints, both tokens of the system rather than incidental
properties of flexbox. The first is **content-driven**: it is the three panes'
own minimum width, which is exactly where the composition breaks.

| Width | Layout |
|---|---|
| **≥ 860px** — *wide* | Three panes as columns. `860 = 280 + 320 + 260`. Dividers, collapse chevrons, fullscreen-canvas mode, autosave **and** gauge in the bar, the full Library / theme / quota / Export / account cluster, and the document name as an inline-edit field. |
| **< 860px** — *compact* | One pane at a time behind the **Pane Switcher** (Editor · Paper · Inspector), full width. Every pane stays mounted; the inactive ones are hidden. The name becomes a readout that opens the **Rename dialog**, and the gauge moves to the Inspector header. `SHELL_WIDE_MIN` in `shell/pane-layout.ts`. |
| **< 480px** (`roomy`) | The wordmark yields the bar to the document name and the Export action. The switcher row carries the autosave readout. |

**Named rules:**

- **The 860 Rule.** The three-pane row never renders below the sum of its own
  minimums. Losing a pane is a layout decision, never a clipping accident.
- **The One-Pane Rule.** In compact, panes are views, not columns. The switcher
  names all three in text, and the primary action — Export — never moves into
  the overflow menu.
- **The Mounted Rule.** A hidden pane is hidden, never unmounted: the preview
  keeps rendering while the user writes in another view.
- **Compact spends its bar on the document.** The proof gauge and the
  standalone quota chip are wide-layout chrome; the page count lives in the
  Paper view's labels and the Library rows, and the Server Export allowance in
  the Export menu. The gauge's compact surrogate is the Inspector header
  readout — the one place a phone user goes to change the paper — and it is
  rendered *only* in compact, so the same facts never appear twice on screen.
- **Compact never edits in a sliver.** Where a wide-layout inline control cannot
  hold its content at phone widths, it stops being an inline control: the
  document name becomes a tap-to-rename readout over a full-width field in the
  shared Dialog. Same commit semantics, honest room to type.

### Touch targets

**The 44 Rule.** Under coarse pointers (`hover: none` — the same gate as the
persistent-affordance variant) every chrome control offers a **44×44px** hit
floor, the `--touch-target` token beside the breakpoints in `global.css`.
Controls opt in with the `touch-target` class; the hit area is the visible
control (min-height/min-width growth, never invisible overlays), so the
authored 28/32px instrument sizes stay desktop/fine-pointer values and are
pixel-identical there. Bars that hold 28px instruments — the editor toolbar,
the Inspector tablist, the banner strips, the compact bar — carry
min-heights, not fixed heights, so they grow with their contents; the editor
toolbar also wraps (`flex-wrap`), which is what keeps Undo/Redo reachable at
the 280px editor minimum instead of clipping. The pane dividers widen under
the gate with compensating negative margins (`touch-divider`), preserving
their net-zero footprint in the 860 arithmetic.

The rule crosses the overlay boundary: menus and menu items (the compact
overflow, the account dropdown, the Export dropdown), the shared Dialog and its
close button, the Library drawer, every dialog body (history, upgrade status,
the upgrade flow, the rename dialog, the print hint), the payment and auth
fields, the copy buttons, and the quota chip. An overlay is where a phone user
goes to *act*, so it is not exempt. `e2e/shell-compact.spec.ts` sweeps the
visible controls at 320px and fails on any box under the floor.

The Inspector's 24px field micro-controls stay exempt — 12px text on a 24–27px
input is the field pattern, not an instrument, and the panel is a column of
rows rather than a bar of targets. The exemption is about size only, never
about the accessibility floor: nothing sits under 24px (WCAG 2.5.8), so coarse
pointers lift the 14px checkbox with `hover-none:min-h-6 hover-none:min-w-6`.

## Elevation & Depth

Depth declared once per surface — a hairline **or** a shadow, never both as
decoration. The paper is the exception (it is a physical object): a 1px contact
shadow plus a wide ambient one, slightly deepened from the old world
(`0 1px 2px rgb(0 0 0/0.10), 0 12px 32px rgb(0 0 0/0.16)`) so the sheet reads
as lit *on* the bench. Shadows: `shadow-sm` raised controls, `shadow-lg`
floating layers, `shadow-xl` modals.

**Motion:** one curve, one duration — `cubic-bezier(0,0,0.2,1)` at 150ms, on
color/opacity only, never layout. Reduced motion collapses everything.

## Shapes

Sharp, small, and uniform: **2px** on every control, panel, menu, pill, and
thumbnail (`--radius-control` / `--radius-pane` are both 2px). There are no
circles in the chrome — the avatar, zoom pill, and divider chevrons are all
2px squares. Borders are 1px hairlines; the only 2px border is the dashed
drop-overlay outline. No chamfers, no asymmetry.

## Components

### Buttons

- **Primary:** graphite fill (`--accent-strong`), Accent Ink text, 32px (28px
  compact / 36px form), 2px radius, `shadow-sm`. Hover: `--accent-deep`.
- **Ghost:** 1px hairline, Ink Soft text; hover fills `--surface-hover`.
- **Quiet:** transparent, Ink Soft; top-bar default.
- **Icon button:** 28/32px square, 2px radius (44px hit floor under coarse
  pointers — see Touch targets).
- **Disabled:** `opacity-50`–`60`, no color change.
- **Focus:** solid 2px `--accent` outline at 2px offset, on every interactive
  element, uniformly, non-negotiably.

### Selection & Active States

Selected Library row: `--canvas` fill (the bench color inside a `--surface`
panel — reads as "pressed through to the bench") plus an inset 1px
`--hairline-strong` ring — in dark mode the fill alone is a ~4% luminance
step, and the hairline is what keeps "this one is open" legible. Active
Inspector tab: `--canvas` fill, hairline border, Ink Full text at 600. Selected preset tile /
duration / payment method: `--ink` border on `--canvas` fill. Plan CTAs:
filled primary for paid, hairline ghost for free. Verified order badge:
`--ink` border, semibold.

### Inputs / Fields

**The Inspector is a column of instruments, not a form stretched across a
narrow pane.** Every row shares one control axis: a 112px right-aligned label
column, an 8px gutter, then the control — so a label sits 8px from its value
at every pane width from the 260px floor up, and the values read as a single
column instead of hopping between two edges. The axis belongs to
`controls.tsx` (`LABEL_COLUMN` / `CONTROL_AXIS`); keep them paired.

- Fields: 12px text on `--field`, 1px hairline, 2px radius; focus draws the
  2px accent ring. Number fields are 64px — a measurement's width, not the
  row's — and carry no spinner chrome (stepping a page size by 1mm is not a
  real interaction; keyboard arrows still step). Selects and text inputs fill
  the column, because the chosen option is the longest text in the row.
- Toggle rows: the box sits on the control axis and the *whole row* is the
  label, so the hit target is the full row and there is exactly one name for
  the checkbox. A field's label lives left of the axis; a toggle's lives right
  of it.
- Rows wrap within their control column, never the pane: at the 260px floor a
  wrapped lock or button stays on the axis.
- The inline doc-name field swaps to `focus:border-accent` + `--field`, and in
  the compact rename dialog the field is a full-width 36px form field.
  Full-width form fields: 36px, `--canvas` fill. Monospace for IDs, wallets,
  hex. Errors: 12px `--danger` below the field, `role="alert"`.

### Banner Strip

One notice pattern, shell-level, urgency-ordered (conflict → plan-ended →
welcome). Now **neutral**: `--surface` fill, hairline bottom — urgency comes
from the role attribute and the buttons, not a tint. Slots: wrapping copy,
28px filled primary, 28px ghost (danger ghost where copy warns of loss), 28px
icon dismiss. Conflict strip has no dismiss.

### Crop Marks (signature)

Every preview page carries printer's corner registration marks: four 12px
L-marks in `--ink-faint`, held 6px off the page edge. Two live on
`.pm-page-frame` (`::before` top-left, `::after` bottom-right), two on
`.pm-page-host` (top-right, bottom-left). Pure CSS via `clip-path` polygons —
no DOM, no images — and they scale with zoom because they ride the zoomed
frame. Do not remove them; they are the world's one authored moment.

The auth surface (`/login`, `/register`) is the one chrome surface users meet
outside the editor, so it borrows the same marks as a **proof sheet**: the
`.pm-reg-marks` / `.pm-reg-host` pair draws all four corners on a panel (the
host is a DOM span inside the card — two pseudo-elements alone give two), and
the sheet sits centered on the bench the way a canvas page does. Elevation
stays declared once — the hairline — never a border+shadow stack.

### Preset Thumbnail

Unchanged: a CSS sketch from the document's own `DocStyle` — its colors, never
the chrome palette. The drawing is authored once at 84×112 and scaled to its
footprint: 60×80 in the Inspector's preset gallery, whose `auto-fill` grid
decides its own column count from the pane's width (4 across at the default,
3 at the 260px floor) so no preset is ever stranded alone on a row.

### Gate Lock

Unchanged: 24px, 11px Ink Faint, lock glyph + "Pro"; gated controls render
disabled-but-visible; clicking opens the pricing modal, never a signup wall.

### Zoom Pill

Bottom-center canvas control (− / % readout / + / fit). At rest it recedes so
it never sits at full weight on the sheet it overlaps: transparent-border,
`surface/60` fill, no shadow. Hover or keyboard focus restores the raised
state (`surface/95`, hairline, `shadow-lg`). The recede is background weight,
not container opacity — the readout text holds AA in every state.

### Pane Switcher (compact)

The compact workspace's view control: three text segments at 32px in a 40px
row, the active one on `--canvas` with a hairline (the Inspector tablist's own
treatment, one step up in size; the inactive segments carry a transparent
border so selecting one shifts nothing). Every view is named in text — the
desktop collapse chevrons are hover-revealed and therefore invisible on touch.

### Overflow Menu (compact)

Below 860px the top bar's secondary cluster folds into a 32px `⋯` trigger:
Library, the theme switch, and the account entries — the last shared with the
desktop account dropdown so the two can never drift. Export stays out of it and
remains the bar's only filled control.

**Menus are 224px wide (`w-56`), never shrink-to-fit, and clamp to
`calc(100vw − 1rem)`.** The compact overflow is anchored to the *viewport*
(`fixed right-2`, below the bar plus the safe-area inset) rather than to its
trigger, because the trigger sits ~44px from the bar's right edge and a
224px trigger-anchored dropdown hangs half its labels off a 320px screen. The
Export dropdown keeps trigger anchoring (it is a wide-layout control too) but
takes the same fixed width: an auto-width menu inherits the split button's box
and squeezes "Server Export" into a wrapped, cramped item.

### Rename (compact)

The document name in the compact bar is a tap-to-rename readout, not a 111px
edit field: same borderless instrument styling and 44px floor, `aria-haspopup`,
accessible name "Rename document: {name}", tail truncated with an ellipsis.
Renaming itself happens in the shared Dialog — a full-width field, prefilled
and selected, with Cancel and Done — because the width a phone bar can spare a
name is not the width a name needs. Commit semantics are the inline field's:
trim, ignore empty and unchanged drafts, Enter commits, Escape abandons.

## Do's and Don'ts

### Do:

- **Do** keep the paper the brightest thing on screen.
- **Do** keep chrome colorless — graphite, hairlines, and `--danger` only.
- **Do** use graphite inversions for selection; the dark 2px focus ring on
  every interactive element.
- **Do** set `tabular-nums` on updating numbers; Plex Mono on machine data.
- **Do** keep the crop marks on every preview page, in both themes.
- **Do** pick heights from 28/32/36/40/48 and spacing from the scale.
- **Do** write error copy that names the problem and the recovery.
- **Do** keep the three-pane row at or above 860px — the panes' own minimums —
  and one named pane per view below it.
- **Do** keep a hidden pane mounted, so the preview never restarts.

### Don't:

- **Don't** introduce an accent hue into chrome (tints, glows, colored fills).
  Document content may carry color; the instruments may not.
- **Don't** round anything past 2px, and don't reintroduce circles.
- **Don't** use gradients, card grids, dashboard tiles, or shadow+border
  stacks.
- **Don't** theme `--page`; don't reuse the paper as a field surface.
- **Don't** set text below 10px or add sizes to the 10/11/12/14/15/16/18/24
  ramp.
- **Don't** add a second motion curve or duration.
- **Don't** use Unicode glyphs or emoji as icons — authored SVGs only
  (24px viewBox, 1.75 stroke, currentColor).
- **Don't** hide the primary action or a pane behind hover or clipping below
  860px; the switcher names every view and Export never leaves the bar.
