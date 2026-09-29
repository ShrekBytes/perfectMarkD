# 02: Core sweep — dead exports, right-sized surface, structural shrinks

Status: resolved

The engine sheds ~180 lines and roughly half its public API with no
behavior change. Of the 107 symbols the barrel exports, 46% are never
imported outside the package; the sweep deletes the truly dead, de-exports
the internal-only, and adds exactly one export the product needs —
`countOccurrences`, which the web app currently mirrors verbatim (with a
comment admitting the mirror) so that both AI-refusal paths can never
drift. The structural shrinks are mechanical: the `dom.ts` module is three
one-line delegates to platform APIs kept "so ported code keeps its original
shape" — its six call sites get the platform calls directly and the module
disappears; `extractDocStyle`'s 26 hand-copied fields become a walk over
the default style's keys; the three near-identical alignment switches in
page-layout building become one small table; and the test-only synchronous
`paginateEl` and its single-implementation `PaginationRun` interface fold
into the chunked stepper the production pipeline already uses. Finally, the
approved `version.ts` merge lands here because core owns the shared
helper: one `buildInfo(source)` replaces the parallel web and server
implementations (the only deliberately cross-package item in this ticket).

**Blocked by:** 01 — Server sweep (wave sequencing; no shared files).

**Accepts**:

- [x] Deleted with all references: `PRESET_COLOR_KEYS`,
  `estimateTokensForCharacters` (and its test block), `sectionLabel`,
  `aiBudgets` (its callers — two in the server AI routes, two in the web AI
  hook — type their sources as `AiBudgets` directly), and
  `bgImageCssProps` (inlined into its single in-file caller).
- [x] Internal-only symbols no longer carry `export` (the DOM/style/render
  helpers, `SETTINGS_VERSION`, the `split*Element` quartet, the
  styling-reference tables, and the type-only exports); the public surface
  drops from 107 symbols to roughly 58, spot-checked against the built
  type declarations.
- [x] `countOccurrences` is exported from core; the web copy still works
  (its adoption is ticket 03's job — this ticket only opens the seam).
- [x] `dom.ts` is deleted; the paginator's six call sites use
  `document.createElement` / `Object.assign(el.style, …)` directly.
- [x] `extractDocStyle` copies exactly the fields the default style
  defines, via its keys — the existing settings tests prove field-for-field
  equality.
- [x] The three alignment switches in page-layout building are one
  table/lookup; the built CSS for every alignment combination is unchanged.
- [x] `paginateEl` and `PaginationRun` are gone; the unit tests and the
  golden harness's in-page runner use the chunked stepper.
- [x] One `buildInfo(source)` in core; the web passes its Vite-inlined env
  and the server passes `process.env`; both local implementations are
  deleted; the footer and `/healthz` render exactly as before.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` green.
- [x] `pnpm --filter @perfectmarkd/core test:golden` green **without
  snapshot updates** — the sweep changes no rendered pixel; if a golden
  moves, stop and investigate rather than `-u`.

## Comments

- **Implemented in one commit plus a two-axis review pass (2026-09-29).**
  Net −179 lines.
- **How the de-export was done:** at the barrel. `index.ts` now re-exports
  the public surface by name, while module-level `export` stays on the
  internal-only symbols — removing the keyword itself would have broken the
  in-package unit tests that import the split quartet, the CSS helpers,
  `estimateAiSize`, and the styling-reference tables directly, for no
  observable gain. The operative acceptance is what the built d.ts carries:
  `dist/index.d.ts` exports exactly 60 symbols (the 58 production-used
  outside the package, plus `countOccurrences` and `buildInfo`), with no
  internal symbol present. `index.test.ts` now guards the surface from both
  sides — key exports in, spot-checked internals (`postProcessRenderedHTML`,
  the split quartet, `mmToPx`, `SETTINGS_VERSION`, the tables) out.
- **The tables' de-export forced two small web test edits here** (the same
  "same commit, no intermediate state" rule 01 applied to the flags
  reader): `core-wiring.test.ts` resolves the barrel through `PAGE_SIZES`
  instead of `normalizeMarkdown`, and `docs-content.test.tsx` reads the
  contract names back out of `buildStylingReferenceMarkdown()` — the
  tables' public carrier — which also picks up the page-variable rows.
  `styling-reference.test.ts` (in-package) now imports the tables from
  their home module instead of the barrel.
- **Ticket correction:** the server had one `aiBudgets` call site by the
  time this started — 01's `runAiCommand` consolidation had already
  absorbed the second — not two; the web hook had two. All three call sites
  now pass their sources (`gate.config`, `account`, `current`) straight
  into the `AiBudgets`-typed slots.
- **Review findings fixed:** `countOccurrences`' doc claimed both
  AI-refusal paths already read it — the web adoption is ticket 03's, so
  the comment now states the exactly-once rule both sides apply without the
  premature "can never drift" claim; `beginPagination`'s doc re-carries the
  two `PaginationRun` contract lines that matter now the interface is gone
  (`pageCount()` safe mid-run — what `onProgress` rests on; `dispose()` on
  every path).
- **The `bgImageCssProps` size/repeat mapping keeps its unit coverage** on
  the function that absorbed it: `bgImageLayerStyle` tests assert all four
  `backgroundImageSize` values surface in the style string, plus the
  unresolvable-ref case.
- **The chunked-equivalence test changed shape:** with the synchronous
  variant gone, "produces exactly the pages paginateEl does" became
  "produces the same pages at every yield cadence" (yieldEvery 1 vs the
  default batch) — the same invariant, that pausing between steps changes
  nothing, against the only implementation left.
- **Verification:** `pnpm lint`, `pnpm format:check`, `pnpm typecheck`,
  `pnpm build`, `pnpm test` (1,906 tests), core goldens (23 — no snapshot
  updates), web e2e (69, including the 300-page render-performance test the
  chunked stepper drives), and server e2e (5) all green.
- Unblocks `03-web-sweep.md`.
