# 03: Dead exports and structural shrinks (core)

**What to build:** the engine's public surface stops advertising things nobody
asks for, and the three places it does the same work twice do it once. Two
settings fields exist that no control writes and no engine code reads; two
band-style helpers are zero-argument functions returning a constant; a
golden-harness option has exactly one legal value; and the two splitters that
count how much fits on a page run the same loop character for character.

After this ticket, a symbol carrying `export` in this package means something
reaches for it.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Every `export` keyword this ticket drops is dropped only after checking
      the whole repository — web, server, core, unit tests and e2e — for an
      import site, and the removals are recorded.
- [x] The exported types that exist only as their own function's parameter or
      return annotation stop being exported. Roughly a dozen of them, across
      the render, export-HTML, paginator, AI and styling-reference modules.
- [x] The golden harness's internals go private. Its regression net's surface
      is the four functions its suites actually import; its URL builders,
      math-CSS builders and page accessor are not part of it. The bundled-font
      table constants go private the same way, and the document-helper that
      only its own module calls with it.
- [x] The two settings fields no control writes and no engine code reads are
      gone, along with their defaults, their validation clamps and the CSS
      interpolations that therefore always emitted zero. **No setting with a
      real control behind it is touched** — this is scoped to the two that
      have neither.
- [x] The two band-style helpers that take no arguments and return a constant
      become constants. All the numbers in them come from CSS custom
      properties, so the emitted stylesheet is byte-identical.
- [x] The golden run option whose only two reads are "is this exactly false"
      ternaries, and which no caller ever passes, is gone. The branch it
      guarded keeps its default behavior.
- [x] The two splitters that count how many children fit on a page share one
      counting helper. The pre splitter is a genuine variant and is left
      alone — the ticket states which two are the copies rather than making
      the next agent re-derive it.
- [x] The diagram renderer is declared as a development dependency of this
      package. Its only import site is the golden harness; nothing a consumer
      of the built engine loads pulls it in. The lockfile and the build's
      external list both stay correct afterwards.
- [x] The barrel surface guard is repaired. It currently asserts that three
      symbols are absent from the public surface — all three deleted by the
      previous sweep, so it asserts nothing. The ghosts are replaced with
      internal names that exist, so the guard guards again.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` green; the full unit
      suite green.
- [x] The paginator goldens pass **without snapshot updates**. If a golden
      moves, that is a rendered change this ticket did not intend — stop and
      investigate rather than running the update.

## Deliverable record

### `export` keywords dropped (each verified against the whole repository)

Every name below was searched for across `packages/core/src`, `apps/web/src`,
`apps/server/src`, the unit tests and the e2e suites, and each had **zero**
import sites outside the file that declared it.

**Annotation-only types (14).** The rule was "exists only as its own function's
parameter or return annotation".

| Module | Dropped |
| --- | --- |
| `render.ts` | `RenderMarkdownOptions`, `RenderMarkdownResult` |
| `export-html.ts` | `ExportHTMLOptions` |
| `paginator.ts` | `PaginateChunkedOptions` |
| `styling-reference.ts` | `StylingReferenceEntry` |
| `ai.ts` | `AiLadderInput`, `AiSizeCheck`, `AiPlanParseResult`, `AiPlanParseFailure`, `AnchoredEditParseResult`, `AnchoredEditParseFailure`, `AnchoredEditApplyResult`, `AnchoredEditApplyFailure` |

They still emit into `dist/index.d.ts` as `declare interface`, so a host can
pass an options object and read a result; it simply cannot name the type.

**Golden harness internals (14).** `harness.ts`: `getPage`, `engineURL`,
`mermaidURL`, `mathCSS`, `mathLayoutCSS`, `GoldenPage`, `GoldenResult`,
`OverflowViolation`, `RunOptions`; `fonts.ts`: `GOLDEN_SERIF`, `GOLDEN_SANS`,
`GOLDEN_MONO`, `GOLDEN_ARABIC`, `BundledFace`, `BundledFonts`; `documents.ts`:
`withBundledFonts`. The harness's surface is now exactly the four functions
its three suites import — `closeBrowser`, `runPipeline`, `measureExport`,
`genericFontElements`. `createMermaidRenderer` stays exported on purpose: the
harness bundle reaches it through an in-page dynamic `import()`.

### The two settings fields: `includeFilenameAsTitle` and `includeOutline`

`includeFilenameAsTitle` had **zero** references in the repository. `includeOutline`
had exactly one: the default assertion in `settings.test.ts`. Neither had a
validation clamp or a CSS interpolation, so only the interface field and the
`DEFAULT_SETTINGS` entry went (plus that one test assertion). The server
injects the outline unconditionally and the web app always reports it, so the
bookmark feature itself is untouched — the field simply never governed it.

### Renames, not silent removals

`headerBandStyle()` / `footerBandStyle()` became the constants
`HEADER_BAND_STYLE` / `FOOTER_BAND_STYLE`. The strings are character-for-character
what the functions returned, so both consumers (`export-html.ts` and
`apps/web/src/canvas/pageBuilder.ts`) emit identical markup; the four call
sites are updated.

### Barrel guard: repaired and falsified

The three ghosts (`createDiv`, `aiBudgets`, `paginateEl` — all deleted by
`ponytail/02`) are replaced by four names that are live `export`s in their own
modules and absent from the barrel: `aiWriteCapTokens`, `isBareSectionLabel`,
`splitListElement`, `stripPageAtRules`. Falsified before it was kept: promoting
`stripPageAtRules` into `index.ts` fails the assertion.

### The diagram renderer — already satisfied, no change made

`packages/core/package.json` already carries `mermaid` in `devDependencies`,
added in `ba0ba36` (the golden-suite commit) before this spec was written.
Verified rather than changed: `pnpm-lock.yaml` lists it under the core
importer's `devDependencies`; `tsup.config.ts` derives `external` from
`dependencies` only, so mermaid is correctly *not* external; the build's only
entry is `src/index.ts`, which never reaches `golden/mermaid.ts`; and the built
`dist/index.js` contains no mermaid import (its ten "mermaid" hits are the
`.mpdf-doc .mermaid` CSS selector and the injected render hook). Removing the
declaration would have broken the harness bundle, which resolves it from
`packages/core`.

### Deliberately left alone

- `AiSizeEstimate`, `AiSizeRefusalCode`, `DocumentSection`, `TextSelection` stay
  exported: they are not annotation-only, they are field types of the
  barrel-exported `AiScope`, `AiSizeRefusal` and `AiLadderDecision`, which a
  host destructures.
- `aiWriteCapTokens`, `isBareSectionLabel` and `normalizeMarkdown` are still
  exported without an importer. They are outside this ticket's enumerated list,
  and the repo's real invariant is the barrel guard's, not "no exported symbol
  lacks an importer" — `postProcessRenderedHTML` is deliberately kept exported
  *as* a guard fixture. Worth a later pass.
- The forced-split tail both splitters keep after the count was left in each
  function: it is four lines, and folding it into the helper would turn a
  counting helper into a "should I split at all" decision, which is not the
  helper the ticket asked for.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm build` green.
Full unit suite green: 150 files / 1908 tests, unchanged from the baseline.
Paginator goldens pass **without** an update — all 22 snapshot files
(`goldens/*.snapshot.md` and `export-html.golden.html`) verified byte-identical
by `md5sum -c`. The web visual e2e baselines are byte-identical too, which is
why `pageBuilder.ts` was safe to touch.

One web e2e test fails: `performance.spec.ts` "renders a 300-page document
under CPU throttling without freezing the tab", 1547 ms against a 1500 ms
ceiling. It fails identically on the stashed baseline, so it is this machine's
speed, not this change. The other 68 web e2e tests pass.

## Comments

- The golden suite is the engine's regression net and this ticket touches the
  paginator inside it. That is the reason for the no-snapshot-updates clause,
  and the reason the splitters' copy/variant distinction is written into the
  acceptance criteria rather than left to the implementer.
- The pre splitter is the reason that distinction mattered: its loop looks like
  the list and table loops, but it must retain each candidate fragment (that
  fragment is the split it returns, and a code block's has to keep its
  highlight spans) and its builder can decline to produce one at all. Sharing
  the helper across all three would have forced a `number | null` contract onto
  a loop that has no such case.
