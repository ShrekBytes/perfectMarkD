# 07 — Engine goldens pass locally but fail on the CI runner

Status: needs-triage
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
