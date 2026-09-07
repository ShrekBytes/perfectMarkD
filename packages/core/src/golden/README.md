# The golden suite — how it catches regressions

This suite (`packages/core/src/golden/`) is the paginator's regression net
(engine-port/08). The paginator is the product's moat: it distributes
rendered content into page-height buckets and splits oversized elements
along natural units. These tests exist to make any change to that behavior
visible before it ships.

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

## Updating goldens after a deliberate engine change

1. Make the engine change on a branch.
2. `pnpm --filter @perfectmarkd/core test:golden` — inspect every failure:
   each diff should be explainable by the deliberate change and nothing
   else. A change you cannot explain is a regression, not churn.
3. `pnpm --filter @perfectmarkd/core test:golden:update` and commit the
   snapshots with the engine change in the same commit, so the goldens and
   the code that produced them always travel together.
