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
| `--ink-faint` | `#6b7076` | `#8d9298` | tertiary text, crop marks (AA on all surfaces) |
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
- **Wordmark** (600, 15px): "PerfectMarkD", "Mark" in Plex Mono.
- **Title** (600, 14px): dialog and panel headings, list row names.
- **Body** (400–500, 14px): buttons, menu items, inputs, banner copy.
- **Label** (500, 12px): field labels, tabs, chips, metadata. The workhorse.
- **Micro** (600, 11px, uppercase, `0.025em`): Inspector section headings.
- **Footnote** (400, 10px): two instances only, attached to their controls.
- **Editor code** (400, 13.5px, 1.7): Plex Mono, caret and selection graphite.

**Named Rules:** One Face Rule (Plex Sans chrome, Plex Mono data, document
font inside the page only) · Tabular Numerals Rule (any in-place-updating
number is `tabular-nums`) · Tiny-Text Earns-It Rule (nothing below 11px except
the two attached footnotes).

## Layout

Unchanged from the previous system and still true:

- **Top bar:** 48px, hairline bottom, wordmark · doc name · autosave · gauge;
  right cluster Library / theme / quota / Export / account.
- **Panes:** editor 38% (min 280px), canvas flex (min 320px), Inspector 320px
  (min 260px). Dividers: 16px drag targets, ARIA splitters, keyboard resize,
  Enter/double-click reset.
- **Canvas rhythm:** 24px page gap, 24/32px padding, "Page N of M" labels,
  fit-to-width until the user takes over.
- **Spacing scale:** 2/4/6/8/10/12/16/20/24/32/40px.
- **Chrome heights:** 28 / 32 / 36 / 40 / 48px. Nothing else.

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
- **Icon button:** 28/32px square, 2px radius.
- **Disabled:** `opacity-50`–`60`, no color change.
- **Focus:** solid 2px `--accent` outline at 2px offset, on every interactive
  element, uniformly, non-negotiably.

### Selection & Active States

Selected Library row: `--canvas` fill (the bench color inside a `--surface`
panel — reads as "pressed through to the bench"). Active Inspector tab:
`--canvas` fill, hairline border, Ink Full text at 600. Selected preset tile /
duration / payment method: `--ink` border on `--canvas` fill. Plan CTAs:
filled primary for paid, hairline ghost for free. Verified order badge:
`--ink` border, semibold.

### Inputs / Fields

Inspector compact fields: 12px text on `--field`, 1px hairline, 2px radius;
focus draws the 2px accent ring (the inline doc-name field swaps to
`focus:border-accent` + `--field` instead). Full-width form fields: 36px,
`--canvas` fill. Monospace for IDs, wallets, hex. Errors: 12px `--danger`
below the field, `role="alert"`.

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

### Preset Thumbnail

Unchanged: a CSS sketch from the document's own `DocStyle` — its colors, never
the chrome palette. 84×112 base, scaled per footprint.

### Gate Lock

Unchanged: 24px, 11px Ink Faint, lock glyph + "Pro"; gated controls render
disabled-but-visible; clicking opens the pricing modal, never a signup wall.

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
