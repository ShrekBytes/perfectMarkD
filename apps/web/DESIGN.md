---
name: PerfectMarkD
description: Markdown → print-perfect PDFs. The chrome recedes; the paper is the product.
colors:
  accent-violet: '#7c6af7'
  accent-violet-deep: '#6a55f2'
  accent-violet-deeper: '#5b46d9'
  accent-violet-soft: 'rgb(124 106 247 / 0.11)'
  accent-ink: '#ffffff'
  canvas-warm-gray: '#f1efe9'
  canvas-dark: '#232227'
  surface-chrome: '#faf9f7'
  surface-chrome-dark: '#2b2a30'
  surface-hover: '#efede7'
  surface-hover-dark: '#36353c'
  document-page: '#ffffff'
  field-surface: '#ffffff'
  field-surface-dark: '#232227'
  ink-full: '#232220'
  ink-soft: '#5f5b53'
  ink-faint: '#6e6a60'
  ink-full-dark: '#ecebe8'
  ink-soft-dark: '#b4b1aa'
  ink-faint-dark: '#a5a197'
  hairline: '#e7e3da'
  hairline-strong: '#d5d0c4'
  hairline-dark: '#3c3b41'
  hairline-strong-dark: '#4b4a52'
  danger: '#dc2626'
  danger-dark: '#f87171'
typography:
  wordmark:
    fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 600
    letterSpacing: '-0.025em'
    lineHeight: 1.2
  headline:
    fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '24px'
    fontWeight: 600
    letterSpacing: '-0.025em'
    lineHeight: 1.25
  subhead:
    fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '18px'
    fontWeight: 600
    letterSpacing: '-0.025em'
    lineHeight: 1.4
  section-head:
    fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.4
  micro:
    fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '11px'
    fontWeight: 600
    letterSpacing: '0.025em'
    lineHeight: 1.3
  footnote:
    fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '10px'
    fontWeight: 400
    lineHeight: 1.4
  editor-code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: '13.5px'
    fontWeight: 400
    lineHeight: 1.7
rounded:
  control: '8px'
  pane: '10px'
  micro: '4px'
  thumb: '3px'
spacing:
  hair: '2px'
  xs: '4px'
  sm: '6px'
  md: '8px'
  control-x: '10px'
  lg: '12px'
  xl: '16px'
  panel: '20px'
  section: '24px'
  block: '32px'
  page: '40px'
components:
  button-primary:
    backgroundColor: '{colors.accent-violet-deep}'
    textColor: '{colors.accent-ink}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '32px'
  button-primary-hover:
    backgroundColor: '{colors.accent-violet-deeper}'
  button-ghost:
    textColor: '{colors.ink-soft}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '32px'
  button-ghost-hover:
    backgroundColor: '{colors.surface-hover}'
    textColor: '{colors.ink-full}'
  chip-quota:
    textColor: '{colors.ink-soft}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '32px'
  field-input:
    backgroundColor: '{colors.field-surface}'
    textColor: '{colors.ink-full}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '4px 8px'
  form-input:
    backgroundColor: '{colors.canvas-warm-gray}'
    textColor: '{colors.ink-full}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '36px'
  dialog-panel:
    backgroundColor: '{colors.surface-chrome}'
    textColor: '{colors.ink-full}'
    rounded: '{rounded.pane}'
    padding: '20px'
  dropdown-menu:
    backgroundColor: '{colors.surface-chrome}'
    textColor: '{colors.ink-full}'
    rounded: '{rounded.pane}'
    padding: '4px 0'
  banner-strip:
    backgroundColor: '{colors.accent-violet-soft}'
    textColor: '{colors.ink-full}'
    typography: '{typography.body}'
    minHeight: '40px'
    borderBottom: '1px {colors.hairline}'
    slots:
      copy: 'wraps, never truncates'
      primaryAction: '28px filled (button-primary rules)'
      secondaryAction: '28px ghost; danger ghost where the copy warns of loss'
      dismiss: '28px icon close with an accessible label; conflict strip omits it'
  top-bar-gauge:
    textColor: '{colors.ink-faint}'
    typography: '{typography.label}'
    numerals: 'tabular'
    height: 'inherits the 48px top bar'
    format: '"<paper size>[ landscape] · <N> pages"; the count joins once the canvas reports'
  library-row:
    thumbnail: "28px-wide PresetThumb; aspect from the document's page size and orientation"
    name: '{typography.title}, Ink Full, truncated'
    meta:
      typography: '{typography.label}'
      textColor: '{colors.ink-faint}'
      numerals: 'tabular'
      format: '"<relative time>[ · <N> pages]"; no count until a render has produced one'
  inspector-tab:
    textColor: '{colors.ink-soft}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '28px'
  inspector-tab-active:
    backgroundColor: '{colors.accent-violet-soft}'
    textColor: '{colors.accent-violet}'
---

# Design System: PerfectMarkD

## Overview

**Creative North Star: "The Proofing Desk"**

The screen is a warm-gray desk. On it sits a single sheet of white paper, lit softly enough to read as an object with edges — the paper carries a two-part shadow (a 1px contact shadow and a wide ambient one) so it reads as lying _on_ the desk rather than floating above it. Every instrument you need is at the edges of the desk, thin and neutral, waiting. Nothing on the desk competes with the sheet.

This is an instrument, not an ornament. The chrome has no gradients, no illustration, no decorative flourish, and no color that isn't doing a job. Its craft shows up in restraint and in precision: a 1px hairline where a 2px rule would be easier, 8px corners where 12px would be friendlier, a violet that appears on perhaps a tenth of any screen, and tabular numerals wherever a number might change. The reward for all that restraint is the one thing the product promises — the page you see is the page you get, so the interface must never be the thing you notice.

The system runs on three inks and two hairlines. Depth is declared once per surface, either a border or a shadow, never both stacked as decoration. Dark mode darkens the desk and the instruments but deliberately _not_ the paper: `--page` stays `#ffffff` in both themes, because the document's paper is a fact about the exported PDF, not a theme choice. That single decision is the clearest statement of what this system believes — the artifact outranks the interface.

**Key Characteristics:**

- Warm-gray proofing surface; white paper as the only high-value element on screen.
- Violet `#7c6af7` held in reserve: primary actions, active state, focus, and one brand mark — nothing else.
- 1px hairlines over fills for all structural separation; 8px control radius, 10px panel radius.
- One motion curve (ease-out) and one duration (150ms), applied to color, opacity, and transform — never to layout.
- Desktop-first three-pane workspace that collapses to fullscreen canvas in one click per pane.
- Light and dark share one token set; only the desk and instruments flip.

## Colors

A neutral, paper-warm workspace with a single saturated violet reserved for action and attention.

### Primary

- **Reserved Violet** (`#7c6af7`): the identity color, inherited from the originating plugin and binding. It appears on the active inspector tab and active library row (as an 11% tint), the "Mark" in the wordmark, links in the editor, the caret, text selection, the focus ring, and decorative accents (the divider hover line, the page frame). It is never under white text — `#ffffff` on it measures 3.99:1, below the AA floor the product commits to — never used for large fills, never for backgrounds at full strength, and never decoratively _behind copy_.
- **Reserved Violet, Fill** (`#6a55f2`): the fill of every violet-filled control, one step deeper than the identity violet so Accent Ink passes AA (4.8:1) in both themes. White-on-violet contrast is theme-independent, so this value no longer lifts in dark mode; the desk's separation comes from the control's shadow.
- **Reserved Violet, Pressed** (`#5b46d9`): the hover and active state of every violet-filled control (6.3:1 with Accent Ink).
- **Reserved Violet, Tint** (`rgb(124 106 247 / 0.11)` light, `/ 0.2` dark): the wash behind selected rows, active tabs, and informational banner strips. The dark value is deliberately stronger; a light tint on a dark surface reads as dirt rather than as selection.
- **Accent Ink** (`#ffffff`): text and icons on a violet fill. Fixed in both themes.

### Neutral

- **Warm Desk** (`#f1efe9` light, `#232227` dark): the Paper Canvas backdrop, and the one surface that is always visually distinct from the panels beside it.
- **Chrome Surface** (`#faf9f7` light, `#2b2a30` dark): the top bar, the editor and inspector panes, dialogs, dropdowns, and the Library drawer.
- **Chrome Surface, Hover** (`#efede7` light, `#36353c` dark): hover fill for ghost buttons, icon buttons, menu items, and inactive list rows.
- **Document Page** (`#ffffff`, both themes): the paper. Never themed.
- **Field Surface** (`#ffffff` light, `#232227` dark): the compact field background — Inspector inputs, the color swatch, the locked upload stub, the inline document name on focus, and the Library rename field. It is the one surface that must flip with the theme, because the text on it follows `--ink`: against a theme-pinned `--page` that pairing becomes light-on-white in dark mode and unreadable.
- **Ink Full** (`#232220` light, `#ecebe8` dark): body text, headings, and the primary content of any control.
- **Ink Soft** (`#5f5b53` light, `#b4b1aa` dark): secondary text, field labels, ghost-button labels, and inactive tab labels.
- **Ink Faint** (`#6e6a60` light, `#a5a197` dark): tertiary text only — timestamps, page labels, helper notes, and disabled affordances. Never body copy, never a label a user must read. The values hold WCAG AA (≥4.5:1) on every surface the step can sit on, canvas included: faint text still carries real information, so "faint" is a hierarchy step, not a legibility exemption.
- **Hairline** (`#e7e3da` light, `#3c3b41` dark): every structural divider and control border.
- **Hairline Strong** (`#d5d0c4` light, `#4b4a52` dark): the same 1px weight, a darker value — used where a rule must hold its own against content: the pricing table's header underline, the preset-thumbnail frame, the preset tile's hover border, and the edges of toasts.
- **Danger** (`#dc2626` light, `#f87171` dark): destructive actions and failure text only. In dark mode the value lifts to stay legible on a dark desk.

### Named Rules

**The Reserved Violet Rule.** The accent appears on at most ~10% of any screen. Its rarity is what makes it read as "this is the action." If two violet elements compete in one viewport, one of them is wrong — demote it to an ink or a hairline.

**The Three Inks Rule.** Text is `ink`, `ink-soft`, or `ink-faint`. Never an ad-hoc gray, never a `text-black/60`, never an opacity on a text node. The three steps are the whole hierarchy.

**The Paper Is Fixed Rule.** `--page` is `#ffffff` in light and dark. It represents the exported sheet, not the app theme. A dark-mode document preset changes the _document's_ page color through document settings; the token never flips.

**The Field Flips Rule.** Anything a user types into sits on `--field`, never on `--page`. `--page` is pinned white on purpose; text follows `--ink`, which lifts in dark mode. Reusing the paper as a field surface is how dark mode ends up with light text on white. The full-width form fields use the Warm Desk surface for the same reason.

## Typography

**Display Font:** Inter Variable (self-hosted via `@fontsource-variable/inter`; fallback `ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Inter Variable (same stack)
**Editor/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`

**Character:** One interface face, set small and set tightly. Inter carries every piece of chrome, with the overwhelming majority of it at 11–14px. Tightening (`-0.025em`) is reserved for the larger sizes — the 15px wordmark and the 18px and 24px page headings — and everything else runs at normal tracking. The narrow range is the point: this is a tool, and the type should read as instrumentation, not as editorial voice. Monospace is used only where the content _is_ machine data — transaction IDs, wallet addresses, hex color readouts, quotas, and the markdown source itself.

### Hierarchy

- **Headline** (600, 24px, 1.25, `-0.025em`): the pricing page's `h1` only. The workspace's largest text is the 15px wordmark; this size exists for one marketing heading.
- **Subhead** (600, 18px, 1.4, `-0.025em`): the auth page's `h1`, and the glyph inside an empty-state's 44px tinted tile.
- **Section head** (600, 16px, 1.4): the `h3` inside the upgrade flow's step panels, and the plan name in the pricing table's column header.
- **Wordmark** (600, 15px, 1.2, `-0.025em`): "Perfect**Mark**D", with "Mark" in Reserved Violet. The product's only branded typographic moment.
- **Title** (600, 14px, 1.4): dialog headings, panel headings ("Library"), and document names in list rows.
- **Body** (400–500, 14px, 1.5): buttons, menu items, form inputs, banner copy, and plan-table body.
- **Label** (500, 12px, 1.4): the workhorse. Field labels, tab labels, table cells, chips, metadata, and most secondary text in the app.
- **Micro** (600, 11px, `0.025em`, uppercase): Inspector section headings. The "Pro" gate label shares the 11px size but runs at 500 in normal case, so a section heading and a control label never read as the same rank. This is the only uppercase and the only tracked-out text in the system.
- **Footnote** (400, 10px, 1.4): two instances only, both attached to the control they explain — the page-number format hint (`{{current}}`, `{{total}}`, `{{title}}`) and the image-ingest error under a gate's picker. This is a floor, not a scale step.
- **Editor code** (400, 13.5px, 1.7): markdown source in CodeMirror, in the mono stack, with `caret-color: var(--accent)` and selection painted in the accent tint.

### Named Rules

**The One Face Rule.** Inter for all chrome, monospace for machine data, and the document's own font only inside the rendered page. No third typeface enters the interface.

**The Tabular Numerals Rule.** Any number that can change in place — quotas, zoom percentage, hex readouts, page counts — is set `tabular-nums`. Digits that jitter as they update are a defect, not a style choice.

**The Tiny-Text Earns-It Rule.** Nothing in the interface is set below 11px except the two 10px footnotes, and each of those sits directly beneath the control it explains. Small text must be attached to something the user is already looking at; it is never a place to park copy you could not fit.

## Layout

A three-pane workspace with a fixed-height chrome bar and a full-bleed paper region.

- **Top bar:** 48px tall (`h-12`), hairline bottom border, containing the wordmark, a divider, the inline-editable document name, the autosave indicator, the proofing gauge, and a right-aligned cluster (Library, theme toggle, quota chip, Export split button, account menu).
- **Panes:** editor defaults to **38%** of the shell width (min 280px); the Paper Canvas is flex and never drops below 320px; the Inspector is a fixed **320px** column (min 260px). Dividers are 16px drag targets straddling a 1px hairline, with a 24px circular collapse chevron that appears on hover or focus. Double-clicking a divider resets that pane's width.
- **Collapse:** each pane collapses independently in one click; with both collapsed the shell enters fullscreen-canvas mode and a floating 28px restore button sits at the canvas edge.
- **Stacked strips:** every notice is an instance of the one banner-strip pattern and mounts at shell level directly under the top bar — never inside a pane — pushing the pane row down rather than overlaying it. They stack in a fixed urgency order: staleness conflict, plan-ended, welcome.
- **Library:** a 336px slide-in drawer from the left, over a 25%-black scrim.
- **Canvas rhythm:** pages are stacked vertically with a 24px gap (`gap-6`), inside 24px horizontal and 32px vertical padding. Each page carries its frame plus a centered "Page N of M" label in Ink Faint with 8px above and 2px below.
- **Zoom:** 0.35–1.00 in 0.05 steps. The canvas owns the default: fit-to-width (computed against a 24px gutter per side, capped at 1.00 — fit never upscales) until the user takes over via any zoom control; after takeover the zoom is frozen across pane drags and resizes. The percentage readout in the zoom pill is itself the "true pixels" action: clicking it snaps to 1.00.
- **Spacing scale:** 2 / 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32 / 40px. 8px and 12px carry most layout, 10px is the standard control inset, 20px is a dialog's padding, 24px is the gap between pages, and 32px and 40px are page-level breathing room (a drop overlay, a form page's vertical padding).
- **Responsive:** desktop-first by design. There is exactly one `sm:` breakpoint in the entire app (the admin page's content padding), and no CSS media queries at all. Tablet degrades acceptably; phone is functional but not composed for.

### Named Rules

**The Chrome Height Rule.** Chrome elements are 28px (icon buttons, tabs), 32px (controls in the top bar), 36px (form inputs), 40px (strips), 48px (the top bar). Pick from that set; a 30px or 34px control is a bug.

**The Canvas Gutter Rule.** The Paper Canvas keeps at least 24px of breathing room on every side of the paper. Fit-to-width always subtracts that gutter before computing scale, so the sheet never touches the pane edge.

## Elevation & Depth

Depth is **declared once per surface** — a border _or_ a shadow, matched to how far the surface is from the desk. Flat surfaces in the same plane get a 1px hairline and no shadow. Surfaces that lift off the desk get a shadow and no border.

The paper is the one element that earns both, and it earns them because it is a physical object: a 1px contact shadow plus a wide ambient shadow, so it reads as resting on the desk. Chrome never imitates that.

### Shadow Vocabulary

- **Paper** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 10px 28px rgb(0 0 0 / 0.12)`): the document page only. This is the system's signature shadow and the only two-part one.
- **Raised control** (`shadow-sm`): the primary export button and the divider chevrons. A single subtle lift, enough to separate a filled control from the surface behind it.
- **Floating layer** (`shadow-lg`): dropdown menus and toast notices.
- **Modal layer** (`shadow-xl`): dialogs, the Library drawer, and the large-document notice.

### Motion

One curve, one duration. `cubic-bezier(0, 0, 0.2, 1)` at **150ms** is set as the theme's default transition timing function, so the entire motion vocabulary is `transition-colors duration-150` — hover, focus, and active changes on color, background, border, and opacity. Nothing animates position or size, and there is no second duration in the shipped interface (the theme's 200ms upper bound is unused headroom). Entering surfaces use two 150ms keyframes (`fade-in`, `slide-in-left`); the loading shimmer (`animate-pulse`) and export spinner (`animate-spin`) are the only loops.

### Named Rules

**The 150ms Rule.** Every state transition is 150ms on the ease-out curve, and no transition touches a layout property. If a change needs longer to feel right, the change is too large — reduce it rather than extending the duration.

**The One Declaration Rule.** A surface has a hairline or a shadow, not both. The exceptions are the paper (a physical object) and floating layers that must be separated from arbitrary content behind them.

**The No Ambient Glow Rule.** Shadows carry an offset and a soft blur. No zero-offset colored halos, no shadows used as emphasis, no shadow that a hairline could have done.

## Shapes

Soft, small, and consistent: the system rounds just enough to feel built rather than printed.

- **Controls** — buttons, inputs, selects, chips, tabs, menu rows: **8px** (`--radius-control`).
- **Panels** — dialogs, dropdowns, cards, preset tiles, the Library drawer: **10px** (`--radius-pane`).
- **Circles** — the zoom pill, the account avatar, and the pane dividers' chevron buttons: fully round, reserved for these small floating controls.
- **Micro** — the checkbox (4px) and the preset thumbnail (3px). These sit at document scale, not chrome scale, so they round less.
- **Borders** are always 1px hairlines. The single exception is the 2px dashed accent outline on the file-drop overlay. `hairline-strong` is a _value_ change, not a weight change: it appears on the pricing table's header underline, the preset-thumbnail frame, the preset tile's hover border, and the edges of toasts.
- There is no clipping, no cut-corner, no chamfer, and no asymmetry anywhere in the system.

## Components

### Buttons

- **Shape:** 8px radius; heights are 28px (compact, inside the Inspector and Library rows), 32px (top bar and primary actions), or 36px (full-width form submits).
- **Primary:** Reserved Violet Fill (the deep step, `#6a55f2` — see the Colors section), Accent Ink text, 12px horizontal padding, `font-medium` at 14px, `shadow-sm`. Hover and active darken to `#5b46d9`.
- **Ghost:** transparent fill, 1px hairline border, Ink Soft text. Hover fills with Chrome Surface Hover and lifts the text to Ink Full. This is the default for secondary actions ("Import .md"). Actions that warn of loss take the danger ghost instead (see the Banner Strip entry), and a conflict's keep-mine choice is a filled primary, not a ghost.
- **Quiet (no border):** transparent fill, Ink Soft text, transparent border. Hover fills with Chrome Surface Hover and lifts to Ink Full. This is the top bar's default for Library, Sign in, and theme toggle.
- **Icon button:** 28px or 32px square, 8px radius, Ink Soft glyph at 1em, same hover as quiet. Appears at reduced opacity until row hover or focus inside list rows.
- **Disabled:** `opacity-40` to `opacity-60`, `cursor-not-allowed` or `cursor-default`. Never a color change — the shape stays intact.
- **Focus:** a 2px accent outline at 2px offset (`outline-offset-2 outline-accent focus-visible:outline-2`) on every interactive element in the app. This is uniform and non-negotiable.

### Chips

- **Style:** 32px tall, 8px radius, 1px hairline border, Ink Soft text at 12px, `tabular-nums`, 10px horizontal padding, no fill.
- **State:** the quota chip is the only chip. At exhaustion it swaps to a `danger` border and 10% danger tint with danger text, and stops being a readout: it becomes a button that opens the pricing modal — the ceiling's recovery path, the same route every gate lock takes. A live allowance renders nothing at all when there is no entitlement — absence, not an empty state.

### Cards / Containers

- **Corner Style:** 10px radius.
- **Background:** Chrome Surface.
- **Shadow Strategy:** a single hairline at rest; the pricing page's comparison panel adds `shadow-sm`. No card stacks, and no card inside a card.
- **Border:** 1px hairline, or hairline-strong for a toast or banner that must separate from page content.
- **Internal Padding:** 12px for dense panels, 16px for the pricing panel, 20px for dialogs.

### Inputs / Fields

- **Inspector fields (compact):** 12px text, 4px/8px padding, 8px radius, 1px hairline border, on the **Field Surface** (`--field`), which flips with the theme — white against a `#faf9f7` panel in light, `#232227` against `#2b2a30` in dark. Right-aligned against a left-aligned 12px Ink Soft label on the same row, separated by 12px.
- **Form fields (full-width):** 36px tall, 14px text, 10px horizontal padding, 8px radius, 1px hairline, on the **Warm Desk** surface (not the paper) so the field reads as inset into the form. This is the correct pattern for text, email, password, and number entry in auth and payment flows.
- **Focus:** `focus-visible` draws the standard 2px accent outline. The inline document-name field is the one exception — it swaps its transparent border for `focus:border-accent` and takes the Field Surface, so renaming never shows a ring in the top bar.
- **Monospace fields:** transaction IDs, wallet addresses, and hex readouts use the mono stack at the same size. That is a data affordance, not decoration.
- **Error:** `role="alert"` text at 12px in Danger, placed directly below the offending field. Never a red border on its own — the message names the problem and the recovery.
- **Disabled:** `opacity-50`, `cursor-not-allowed`, no border or fill change.

### Navigation

- **Top bar:** the primary navigation is a single 48px bar. Left: wordmark, a 1px vertical divider, then the document name, the autosave indicator, and the proofing gauge. Right: actions in a 6px-gapped cluster. There is no nav menu, no breadcrumb, and no sidebar of links.
- **Proofing gauge:** a readout, never a control — no border, no chip, no hover state. 12px Label in Ink Faint with tabular numerals, stating the document's paper facts beside its name ("A4 · 12 pages", "A4 landscape", "Custom · 3 pages"). The count is the value the Paper Canvas reported for the same render the page labels show, so the two cannot disagree; before the first render it shows the paper size alone, and with no document open it is absent.
- **Inspector tabs:** a 36px row of 28px pills. Inactive: Ink Soft text, hover fills Chrome Surface Hover. Active: accent tint fill with Reserved Violet text — the same active treatment as a selected Library row.
- **Library rows:** 12px vertical rhythm, led by a miniature-sheet thumbnail (see Preset Thumbnail) at drawer-row scale, then the Ink Full name at 14px with a 12px Ink Faint meta line beneath — relative time, then the true page count in tabular numerals when the document has one. Active row gets the accent tint; hover gets the surface hover. Row actions stay at zero opacity until hover or focus-within.
- **Dropdown menus:** 10px radius, Chrome Surface, 1px hairline, `shadow-lg`, 4px vertical padding, 8px/12px item padding at 14px. Dismiss on outside pointer-down or Escape.

### Gate Lock

The signature component: a paid control that explains itself instead of blocking.

- **Shape:** 24px tall, 8px radius, 11px Ink Faint text, 6px padding, a lock glyph, and the word "Pro".
- **Behaviour:** the gated control beside it renders _disabled but visible_ (a dimmed input, a faux upload button at 50% opacity) so the user can see exactly what they would get. Clicking the lock opens the pricing modal. It never opens a signup wall, and it never hides the feature behind a blur.
- **Unlocked state:** the lock disappears and the real control takes its place. Where the real control does not exist yet, the row shows a quiet 11px "Included with your plan" note rather than an empty field.

### Tinted Notice

The system's informational panel, and the one place a border carries alpha rather than a token value: a 40%-alpha accent border over the 11% accent tint, with Reserved Violet text. It appears wherever the app explains a state the user must act on — the upgrade flow's payment instructions, the admin verify/grant dialogs, the export-history note, and the "Open the editor" CTA on the pricing table. The danger twin (`border-danger/40 bg-danger/10 text-danger`) covers the exhausted quota chip and admin settings warnings. Both use the 8px control radius and 12px Label type. Because the border and the fill are the same hue at two alphas, the notice reads as one tinted object rather than as a bordered box with a fill poured into it.

### Banner Strip

The one notice pattern, and the only full-width chrome under the top bar. All shell notices (staleness conflict, plan-ended, first-run welcome) are instances of it, mounted at shell level in a fixed stacking order — conflict, plan-ended, welcome — so the most urgent is always topmost and a collapsed pane can never hide one. Shape: the 11% accent tint, a 1px bottom hairline, resting at 40px, growing when the copy wraps — copy always wraps, never truncates, because a consequence hidden at a narrow width is a consequence denied. Slots: wrapping copy, a 28px filled primary action, a 28px ghost secondary (danger ghost where the copy warns of loss, as the conflict strip's "Load changes" does), and a 28px icon close with an accessible label. An instance fills the slots it needs; the conflict strip offers no dismiss (a version conflict is resolved, never cleared), and the secondary slot is reserved for real actions — dismissal is always the icon. Roles carry the urgency: `alert` for conflict and plan notices, `status` for the welcome.

### Preset Thumbnail

The one place the system draws a picture, and it draws it from data. A miniature page sketched in plain CSS from the document's own `DocStyle` values: a heading bar, two body lines at 55% and 40% opacity, a quote block with its own bar and fill, a code strip, and a small accent mark at the foot. Every color comes from the document, never from the chrome palette — a thumbnail must be able to show a dark preset on a light desk. One drawing serves all footprints: it is drawn at the 84×112px base (A4's aspect) and scaled to the requested size — the preset gallery at full size, Library rows at 28px wide with the height following that document's page size and orientation, so a Letter row and a landscape row read as different sheets. It is a sketch, never an engine run: no pagination happens to draw a row.

## Do's and Don'ts

### Do:

- **Do** keep the paper the brightest thing on screen. If any chrome element out-values `#ffffff`, it has gone too far.
- **Do** use 1px hairlines for structure and reach for a shadow only when a surface genuinely lifts off the desk.
- **Do** keep the accent under ~10% of any viewport, and use it for action, active state, focus, and the wordmark's "Mark" — nothing else.
- **Do** draw the 2px accent focus outline on every interactive element, and never suppress it.
- **Do** show locked paid controls as visibly disabled rather than hidden, with the lock opening the pricing modal.
- **Do** set `tabular-nums` on any value that updates in place.
- **Do** pick control heights from 28 / 32 / 36 / 40 / 48px.
- **Do** keep the caret, text selection, and scrollbars in the palette — `caret-color: var(--accent)`, selection in the accent tint.
- **Do** attach small text to the control it explains, as the page-number format hint does. Nothing sits below 11px except those two 10px footnotes.
- **Do** write error copy that names the problem and the recovery, in the product's own plain voice.

### Don't:

- **Don't** add gradients — not on buttons, not on banners, not as text fills. The one sanctioned exception is a translucent `bg-surface/95` plus `backdrop-blur` on the floating zoom pill, which exists so page content stays readable behind it.
- **Don't** introduce a second accent hue. One violet, one danger red, and neutrals. Nothing else is a color.
- **Don't** use a shadow and a border on the same surface to make it look more important.
- **Don't** build card grids, dashboard tiles, or metric blocks. This is a workspace, not an admin panel; the panes are the layout.
- **Don't** theme the document paper. It is `#ffffff` in both themes and only a document preset may change it.
- **Don't** set interface text below 10px, or above 24px, and don't open a new size between the steps above — the ramp is 10 / 11 / 12 / 14 / 15 / 16 / 18 / 24.
- **Don't** use monospace for anything that is not code, an identifier, or a measurement.
- **Don't** add a second motion curve or a second duration. Everything is 150ms ease-out, and no transition touches a layout property.
- **Don't** use Unicode glyphs or emoji as icons. Every icon is an authored SVG in the 24px viewBox at 1.75 stroke, `stroke-linecap: round`, `stroke-linejoin: round`, inheriting `currentColor`.
