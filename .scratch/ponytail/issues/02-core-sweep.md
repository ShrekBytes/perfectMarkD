# 02: Core sweep — dead exports, right-sized surface, structural shrinks

Status: ready-for-agent

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

- [ ] Deleted with all references: `PRESET_COLOR_KEYS`,
  `estimateTokensForCharacters` (and its test block), `sectionLabel`,
  `aiBudgets` (its callers — two in the server AI routes, two in the web AI
  hook — type their sources as `AiBudgets` directly), and
  `bgImageCssProps` (inlined into its single in-file caller).
- [ ] Internal-only symbols no longer carry `export` (the DOM/style/render
  helpers, `SETTINGS_VERSION`, the `split*Element` quartet, the
  styling-reference tables, and the type-only exports); the public surface
  drops from 107 symbols to roughly 58, spot-checked against the built
  type declarations.
- [ ] `countOccurrences` is exported from core; the web copy still works
  (its adoption is ticket 03's job — this ticket only opens the seam).
- [ ] `dom.ts` is deleted; the paginator's six call sites use
  `document.createElement` / `Object.assign(el.style, …)` directly.
- [ ] `extractDocStyle` copies exactly the fields the default style
  defines, via its keys — the existing settings tests prove field-for-field
  equality.
- [ ] The three alignment switches in page-layout building are one
  table/lookup; the built CSS for every alignment combination is unchanged.
- [ ] `paginateEl` and `PaginationRun` are gone; the unit tests and the
  golden harness's in-page runner use the chunked stepper.
- [ ] One `buildInfo(source)` in core; the web passes its Vite-inlined env
  and the server passes `process.env`; both local implementations are
  deleted; the footer and `/healthz` render exactly as before.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` green.
- [ ] `pnpm --filter @perfectmarkd/core test:golden` green **without
  snapshot updates** — the sweep changes no rendered pixel; if a golden
  moves, stop and investigate rather than `-u`.
