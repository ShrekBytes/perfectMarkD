# Custom Stylesheet overrides the Preset and the page chrome

Date: 2026-09-24

## Context

The Custom Stylesheet shipped (ai-transforms/01) as a pure cascade tail: the
user's CSS appended after the generated rules, with the `--mpdf-*` variables
documented as a read-only mirror. That let users restyle content selectors,
but three whole surfaces were unreachable, and users reasonably expected a
"custom stylesheet" to control them:

- **The Preset's typography and colors.** The generated rules set values
  directly, so overriding them meant restating every rule by hand.
- **The paper background, the header/footer band colors, and the frame
  color.** These were inline styles on page-box layers — invisible to any
  stylesheet by construction.
- **Margins and page geometry.** These are JS arithmetic feeding the
  paginator's measurement box; a CSS override would shift text while
  pagination still sliced at the old height, splitting preview from print.

## Decision

Three movements, all inside `buildDocCSS` so every consumer (pagination
measurement, Paper Canvas, Client Export, Server Export) inherits one string:

1. **The variables become the wiring, not a mirror.** Every generated content
   rule reads its value from a `--mpdf-*` variable defined on `.mpdf-doc`
   (new: `--mpdf-code-font-size`, `--mpdf-blockquote-border`). Redefining one
   — from the Custom Stylesheet or any scoped rule — restyles the whole
   Document. This is the wholesale-override seam.
2. **Page chrome moves from inline styles into the sheet.** A second root,
   `.mpdf-page` (added to the page box alongside its existing classes), carries
   the page-level variables — `--mpdf-page-background`, `--mpdf-header-color`,
   `--mpdf-footer-color`, `--mpdf-frame-color`, plus the internal band-geometry
   `--pm-*` vars — and the paper is painted by the sheet. The header/footer
   text bands and the frame become class-hooked rules
   (`.mpdf-page-header-text`, `.mpdf-page-footer-text`, `.mpdf-page-frame`)
   whose colors come from the variables. Asset layers (background image,
   banners) stay inline: they depend on the AssetResolver, not the sheet.
3. **Geometry stays out of CSS.** `@page` rules remain stripped and margins
   remain a Page-tab setting. The chrome rules receive the page geometry
   through internal `--pm-*` variables, so they can restyle the bands but never
   move them. A Custom Stylesheet overrides the look of everything the engine
   draws; it cannot resize or reposition the page.

`buildDocCSS` takes an optional page geometry. Without it, it builds the
content rules plus the Custom Stylesheet tail — the measurement sheet the
paginator uses (chrome cannot affect content flow). With it, the page-chrome
section is appended between the generated rules and the custom tail — the
render sheet the preview adopts and `buildExportHTML` embeds. Both builds
carry the custom layer, so a stylesheet override always agrees between
measurement and rendering.

The styling reference, the server's AI stylesheet prompt, the Stylesheet tab's
footer line, and CONTEXT.md were updated to describe the wider contract, and
the drift test now covers the page-chrome variables and selectors.

## Consequences

- **Alpha-appended colors are fixed by construction.** The old builder emitted
  settings colors with an alpha suffix (`${accent}33`), which silently produced
  invalid CSS for 3-digit preset colors (`#333` + `33` = `#33333`) and dropped
  the declaration. Chrome and accent tints now go through `color-mix()`, which
  is valid for any color notation. This changed real rendered output: two
  golden pagination snapshots moved (tables grew where borders previously
  collapsed), recorded in the same commit as the engine change.
- **`color-mix()` is required in every render context.** All of them are
  Chromium (ADR-0003), which supports it; a future non-Chromium print target
  would need a fallback pass.
- **The `.mpdf-page` scope joins the stable contract.** Renaming it, the band
  classes, or the page variables is now a breaking change to the styling
  reference, guarded by the drift test.
- **Sheet size grows slightly** (the chrome section rides every render), and
  the page box's background is now a stylesheet paint rather than an inline
  declaration — invisible to users, but load-bearing for the
  preview-is-the-contract tests.
