# The golden suite — how it catches regressions

This suite (`packages/core/src/golden/`) is the paginator's regression net
(engine-port/08). The paginator is the product's moat: it distributes
rendered content into page-height buckets and splits oversized elements
along natural units. These tests exist to make any change to that behavior
visible before it ships.

## What the suite depends on

A golden is a byte-exact snapshot of laid-out *shape*, so anything that can
move a measurement has to belong to the suite rather than to the machine it
runs on:

- **The browser.** The Playwright-pinned Chromium, and nothing else.
- **Every font.** The golden documents render in four faces the suite ships
  and serves over its own origin — IBM Plex Serif, IBM Plex Sans, IBM Plex
  Mono and Noto Sans Arabic — plus KaTeX's, which `katex.css` addresses
  relatively and the harness serves from the same place. No stack ends in a
  generic family, so a glyph no bundled face covers cannot quietly become
  the host's, and the fixtures are written in glyphs those faces cover:
  Latin and Arabic. See `fonts.ts`.
- **The mermaid renderer.** The engine takes it as a hook, so the harness
  pins the diagram's font family itself (`golden/mermaid.ts`) instead of
  inheriting mermaid's default system stack. Mermaid measures its labels to
  size its nodes, so a substituted font moves the whole diagram. The app
  keeps mermaid's default — diagrams are not meant to follow the Document's
  typography — and that decision is the app's; the pin here only keeps the
  diagram's *size* from being whatever the host has installed.

The presets' own stacks — `Georgia, serif`, `Arial, sans-serif`, `'Courier
New', monospace` — are system fonts and stay that way; that is a product
decision, not a test one. The goldens render in bundled families instead.
The consequence is worth stating plainly: **a regression in a preset's font
stack string is not what these tests catch.** Everything that actually moves
layout — font size, line height, paragraph spacing, margins, heading scale,
page geometry — still is.

## What the goldens record

Each golden file (`goldens/*.snapshot.md`, updated via
`pnpm --filter @perfectmarkd/core test:golden:update`) captures one golden
document's laid-out shape in real Chromium:

- **page count** — the headline number;
- **per-page node signatures** — e.g. `OL[18@17]` is a list fragment with 18
  items continuing at number 17, `TABLE[11r+th]` a table fragment with 11
  body rows replicating the header, `PRE[37l]` a code fragment of 37 lines,
  `H2 «Section 4»` a heading with its text;
- **outline entries** — every heading → page mapping;
- **content heights** — measured px of occupied content per page, so a
  regression that keeps the page count but empties/overflows pages shows.

Alongside each snapshot, two invariants are asserted outright:

1. No node extends past its page's content box, twice: once in the
   pipeline's own measurement pass, once in a fresh layout of the export
   document (the two could diverge if export positioning drifts from
   pagination geometry).
2. Structural expectations specific to each document (e.g. the split table's
   every fragment carries `+th`).

## Verified against deliberate regressions (2026-09-07)

The acceptance criterion is "catches a deliberately-introduced pagination
regression." Three sabotages were introduced, one at a time, and the suite
re-run:

| Sabotage                                                               | Result                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| `HEIGHT_EPS` 2 → 200 (fits 200px less per page)                        | 13/15 golden tests fail                            |
| List splitter drops OL `start` continuity (continuation restarts at 1) | golden fails: `OL[18]` vs `OL[18@17]`              |
| Table splitter drops thead replication on fragments                    | 3 tests fail, incl. the structural `+th` assertion |

A fourth sabotage (off-by-one in the pre-splitter's line-end offsets that
happened to resolve to identical splits) correctly did **not** fail — the
suite measures behavior, not implementation.

Re-verify after engine changes by picking a line in
`packages/core/src/paginator.ts`, breaking it deliberately, and running
`pnpm --filter @perfectmarkd/core test:golden` — expect failures, then
revert.

## Verified font-independent (2026-09-26, launch/07)

The suite used to pass on the Admin's machine and fail on `ubuntu-latest`
with no engine change between the two: the preset stacks name system fonts
and fontconfig substitutes those differently per machine, so the same code
block wrapped into a different number of lines and the page splits moved
with it.

That is now checked by removing the variable. Point fontconfig at a
configuration with no font directories, regenerate, and compare against a
run on a font-rich machine — the two must be byte-identical:

```bash
mkdir -p /tmp/nofonts/cache
cat > /tmp/nofonts/fonts.conf <<'EOF'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><cachedir>/tmp/nofonts/cache</cachedir></fontconfig>
EOF

FONTCONFIG_FILE=/tmp/nofonts/fonts.conf \
  pnpm --filter @perfectmarkd/core test:golden:update
cp -r packages/core/src/golden/goldens /tmp/goldens-nofonts
git checkout -- packages/core/src/golden/goldens
pnpm --filter @perfectmarkd/core test:golden:update
diff -r /tmp/goldens-nofonts packages/core/src/golden/goldens
```

Before this work the diff covered 15 of 18 files. It is now empty, and an
empty diff is an argument rather than a coincidence: with no fonts installed
there is no host face to consult, so a layout that comes out identical in
both runs cannot have consulted one. Whatever a given machine has installed,
the goldens cannot see it.

What this does not do is run the suite on `ubuntu-latest` itself — that
happens on the next CI push. The paragraph above is why it has to agree, and
`expectSoundLayout` is what fails if it ever stops.

Three real defects sat behind that coupling, and each is worth knowing about
because each was a measurement the machine owned:

1. **The preset stacks themselves**, which is what the bundling fixes.
2. **`pre` resolved through the UA stylesheet's `monospace`.** The doc CSS
   set the code font on `pre code` and never on `pre`, so the block's own
   font — its strut, its line box — came from the host while the text inside
   it came from the document.
3. **The pagination sandbox had no math stylesheet.** KaTeX's accessibility
   MathML branch is hidden by `katex.css`; unstyled, it rendered visibly and
   was measured, and its radical SVGs kept the `400em` attribute width that
   `katex.css` overrides with `width: 100%`. A document containing `$$` math
   was paginated against a shape nothing ever draws.

`expectSoundLayout` — which every golden test calls — now fails loudly when
any element in a laid-out document resolves its font through a generic
keyword. That is what caught 2 and 3, and it is the check that keeps them
caught. It does not catch a *named* family the suite does not ship; the
procedure above is the check for that.

## Updating goldens after a deliberate engine change

1. Make the engine change on a branch.
2. `pnpm --filter @perfectmarkd/core test:golden` — inspect every failure:
   each diff should be explainable by the deliberate change and nothing
   else. A change you cannot explain is a regression, not churn.
3. `pnpm --filter @perfectmarkd/core test:golden:update` and commit the
   snapshots with the engine change in the same commit, so the goldens and
   the code that produced them always travel together.
