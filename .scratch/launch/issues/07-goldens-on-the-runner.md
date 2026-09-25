# 07 — Engine goldens pass locally but fail on the CI runner

Status: resolved
Blocked by:

The engine golden suite (`packages/core/src/golden/`, the paginator's regression
net) passes on the Admin's machine and **fails on `ubuntu-latest`**. CI had
never run before 2026-09-24 — the repository was pushed to GitHub that day — so
this was latent, not a regression from any commit.

## What it looks like

`pnpm --filter @perfectmarkd/core test:golden` on the runner reports different
per-page node signatures for the same documents, and the differences are all in
code-block fragmentation:

```
-         "PRE[12l]",
+         "PRE[11l]",
-         "PRE[22l]",
+         "PRE[24l]",
-         "PRE[37l]",
+         "PRE[36l]",
```

A `PRE[nl]` signature is "a code fragment of n lines" — so the same source text
is wrapping into a different number of lines, which changes how many lines fit
on a page and therefore where the block splits.

## Why

The preset font stacks are **system** fonts, not bundled ones
(`packages/core/src/settings.ts`):

- `Georgia, serif`
- `'Helvetica Neue', Helvetica, sans-serif`
- `'Times New Roman', Times, serif`
- `Arial, sans-serif`

None of those exist on a bare `ubuntu-latest`. `playwright install --with-deps`
installs a font package set, but the substitutes fontconfig picks for Georgia /
Times / Helvetica / Arial differ from the ones on the Admin's KDE machine, so
the metrics differ and the goldens — which are byte-for-byte snapshots of
laid-out shape — disagree.

The browser is not the variable: both sides run the Playwright-pinned Chromium
(1243 locally).

## What not to do

**Do not run `test:golden:update` to make CI pass.** That bakes the runner's
font substitution into the snapshots and breaks the suite on the Admin's
machine — trading a red CI for a dead regression net, and hiding the real
finding that the goldens are environment-coupled.

## Options

1. **Make the goldens font-independent** — bundle the fonts the golden
   documents use and reference them by `@font-face` in the golden harness, so
   the same bytes render the same everywhere. The web app already self-hosts
   IBM Plex (`@fontsource/*`); `packages/core` carries 20 ttf/woff/woff2 files
   already, so the direction exists. This is the durable fix and the one that
   makes the goldens mean what the README says they mean.
2. **Pin the runner's fonts** — install the same font packages CI-side and
   document the dependency. Cheaper, but the suite stays coupled to a font set
   nobody wrote down, and the next runner image change re-breaks it.
3. **Mark the suite as not-CI** — run goldens locally only. Honest about the
   coupling, but gives up the regression net exactly where it is cheapest to
   run.

Leaning (1).

## Acceptance

`pnpm --filter @perfectmarkd/core test:golden` is green on `ubuntu-latest` **and**
on the Admin's machine, with no snapshot regenerated for the runner's benefit —
and `packages/core/src/golden/README.md` says what the suite depends on.

## Comments

- Found while resolving [launch/01](01-analytics-umami.md): its verification
  pass ran the stack end to end and the first-ever CI run went red on this step
  alone — lint, typecheck, build, and the unit suite all passed. Recorded here
  because it is a real defect with a clear next step and it would otherwise live
  only in a commit message. Filed under `launch` because it blocks a green
  pipeline before announcement ([launch/06](06-launch-checklist.md)); move it if
  the engine workstream is the better home.

- **Triage verdict (user, 2026-09-26): implement option 1.** Status flipped
  `needs-triage` → `resolved`; the work is below.

- **The coupling was total, not partial, and that was the first thing to
  establish.** Pointing fontconfig at a configuration with no font directories
  and running the suite failed **21 of 21** golden tests — the smoke test was
  the only survivor. So this was never "one font differs"; every measurement
  the suite made was a measurement of the host.

- **Option 1 as written, with one correction it did not anticipate.** The
  bundled faces are IBM Plex Serif, IBM Plex Sans, IBM Plex Mono and Noto Sans
  Arabic — all OFL, all test-only devDependencies of `core` — served over the
  harness's fictional origin like the engine bundle already was, and adopted by
  the golden documents in place of the presets' system stacks. The correction:
  the ticket says to "bundle the fonts the golden documents use", but Georgia,
  Helvetica Neue, Times New Roman and Arial cannot be redistributed, so the
  fixtures had to change which families they use rather than have those
  families provided. The consequence is recorded in the README and worth
  repeating: the goldens no longer catch a regression in a preset's font-stack
  *string*. Everything that moves layout still is.

- **KaTeX's faces had to come along, and that was not obvious from the
  ticket.** `katex.css` addresses its fonts as `url(fonts/KaTeX_…)` — relative
  to whatever document the stylesheet lands in — so inlined into the golden
  page every math glyph in the feature matrix had been resolving against the
  host as well. Serving them at the same origin needed no change to the
  stylesheet.

- **Three defects sat behind the coupling, and only the first was in the
  ticket's diagnosis.** Each is a measurement the machine owned, and each was
  found by measuring rather than reasoning:

  1. **The preset stacks**, which the bundling fixes.
  2. **`pre` resolved through the UA stylesheet's `monospace`.** `.mpdf-doc pre
     code` set the code font; `.mpdf-doc pre` never did, and a UA rule beats
     inheritance. So the block's own font — its strut, its line box — came from
     the host while the text inside it came from the document. Measured
     directly: with a font-rich machine the same `<pre>` laid out at 44.05px,
     with no fonts at 46.05px, while every other element in the document
     matched to the hundredth. Fixed in `buildCodeBlockCSS`.
  3. **The pagination sandbox had no math stylesheet.** `katex.css` hides
     KaTeX's accessibility MathML branch; unstyled, it rendered *visibly* and
     was measured — and the radical SVGs kept their `400em` attribute width,
     which `katex.css` overrides with `width: 100%`, so the math block measured
     5200px wide inside a 694px column. A document containing `$$` math was
     paginated against a shape nothing ever draws. `pipeline.ts` now paginates
     against the math layout rules ahead of the doc rules, which is the order
     the preview's shadow roots and the export document already used — the
     pipeline's own header states the invariant it was breaking.

     The stylesheet arrives as a new `PipelineOptions.mathCSS`, not an import,
     and the Server Export e2e suite is what forced that: `katex-css.ts` is a
     Vite asset module (`?raw` / `?inline`), and importing it from the pipeline
     pulled those specifiers into the esbuild bundle that suite builds —
     `Cannot read directory "packages/core/src/index.ts": not a directory`,
     five tests to nothing. The protocol module's header already documents the
     rule ("deliberately avoids Vite-specific imports … so the end-to-end
     render test can bundle it with esbuild"); the first cut broke it and the
     suite said so. The slice itself is now one function in core
     (`katexLayoutCSS`), used by the pipeline, by the preview's
     `KATEX_LAYOUT_CSS`, and by the golden harness, so the three cannot drift.
     All four pipeline callers — Paper Canvas, Client Export, Server Export
     and the export protocol — pass the stylesheet they already had.

- **Defect 3 is a product change, and it is the one thing here the ticket did
  not ask for.** It was not optional: the residue was a generic `math` font on
  MathML, and a generic keyword cannot be pinned by `@font-face`, so no amount
  of bundling could have reached it. Fixing it moves page counts for documents
  containing `$$` math — toward correct, since pagination now measures the
  document the preview and both export paths render (ADR-0003). Flagged here
  rather than buried in the commit.

- **The mermaid diagram was the last holdout, and it was left as the app's
  decision.** Mermaid measures its labels to size its nodes, and the app's hook
  (`apps/web/src/canvas/mermaid.ts`) leaves the family to mermaid's default
  stack — `"trebuchet ms", verdana, arial, sans-serif`, a system stack — so the
  same diagram came out 269px tall on one machine and 221px on another. Rather
  than change the product's diagram typography on this ticket's authority, the
  harness now renders mermaid itself with the family pinned
  (`packages/core/src/golden/mermaid.ts`); the app's choice stays the app's.
  **If the design owner wants diagrams to follow the document's typography
  instead of mermaid's default, that is a separate, deliberate change** — the
  engine's `buildDocCSS` already carries `.mpdf-doc .mermaid` rules to hang it
  on.

- **A guard, because this class of bug is silent.** `expectSoundLayout` — which
  every golden test already called for its overflow invariants — now also
  fails when any element in a laid-out document resolves its font through a
  generic keyword, naming the element and the family. Falsified before it was
  kept: reverting the `pre` fix fails 7 tests with the guard's own message, and
  it caught defect 3 unprompted.

- **Verified, with one claim left to the next CI push.** `FONTCONFIG_FILE=<empty
  config> pnpm --filter @perfectmarkd/core test:golden:update` and a normal run
  now produce **byte-identical** goldens — 18 files regenerated, `diff -r`
  empty, where before 15 of 18 differed. That is an argument, not just an
  observation: with no fonts installed there is no host face to consult, so a
  layout identical in both runs cannot have consulted one, whatever the runner
  has installed. `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test`
  (1587 tests) are green, and so are all three browser suites — the golden
  suite, the web e2e suite (67/67, visual baselines included) and the Server
  Export e2e (5/5). **`ubuntu-latest` itself has not been exercised**: that
  happens on the next push, and it is the one claim here that rests on an
  argument rather than a run. The procedure is written into
  `packages/core/src/golden/README.md` so the next person can re-run it instead
  of trusting this note.

- **On regenerating snapshots, since the ticket warned against it.** "Do not
  run `test:golden:update` to make CI pass" is about baking one machine's font
  substitution into the goldens. These 18 were regenerated once, from a
  deliberate change to which faces the fixtures render in, and the same bytes
  now pass on both a font-rich and a font-less machine — the opposite of what
  the warning describes. The literal acceptance line "no snapshot regenerated"
  is therefore not met; its intent is.

- **Found while here, not fixed (out of scope):** `pnpm format:check` fails on
  44 files at `HEAD` — none of them touched by this work. My own files are
  formatted; the repo-wide drift is somebody else's call.

- **The suite no longer touches `apps/web`.** The mermaid bundle used to be
  built from `apps/web/src/canvas/mermaid.ts`; core's golden suite reaching
  into the app was the wrong direction anyway, and it is now self-contained.
